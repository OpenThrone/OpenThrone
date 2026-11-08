import prisma from '@/lib/prisma';
import type {
  MembershipSource,
  PaymentProviderName,
  SupporterStatus,
} from '@/types/supporter';

import type { Prisma } from '../../../prisma/generated/prisma/client';

type Db = Prisma.TransactionClient;
const DAY = 86_400_000;

export function membershipIsActive(
  membership: { status: string; currentPeriodEnd: Date | null } | null,
  now = new Date(),
): boolean {
  return (
    !!membership &&
    ['ACTIVE', 'PAST_DUE', 'CANCELED'].includes(membership.status) &&
    !!membership.currentPeriodEnd &&
    membership.currentPeriodEnd > now
  );
}

async function sync(db: Db, userId: number) {
  const membership = await db.supporterMembership.findUnique({
    where: { userId },
  });
  await db.users.update({
    where: { id: userId },
    data: {
      supporter_until:
        membership?.badgeVisible && membershipIsActive(membership)
          ? membership!.currentPeriodEnd
          : null,
    },
  });
  return membership;
}

async function locked<T>(
  userId: number,
  fn: (db: Db) => Promise<T>,
  db?: Db,
): Promise<T> {
  const run = async (tx: Db) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    return fn(tx);
  };
  return db ? run(db) : prisma.$transaction(run);
}

export async function getSupporterStatus(
  userId: number,
  db: Db = prisma,
): Promise<SupporterStatus> {
  const m = await db.supporterMembership.findUnique({ where: { userId } });
  return {
    isActive: membershipIsActive(m),
    tier: m?.tier ?? null,
    status: m?.status ?? null,
    source: m?.source ?? null,
    activeUntil: m?.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: m?.cancelAtPeriodEnd ?? false,
    badgeVisible: m?.badgeVisible ?? true,
    canManageBilling: !!m?.providerCustomerId,
    provider: (m?.provider as PaymentProviderName | undefined) ?? null,
  };
}

export async function isSupporter(
  userId: number,
  db: Db = prisma,
): Promise<boolean> {
  return (await getSupporterStatus(userId, db)).isActive;
}

export async function grantDays(
  userId: number,
  days: number,
  source: Exclude<MembershipSource, 'SUBSCRIPTION'>,
  db?: Db,
  /** Provider billing identity for paid passes, so the portal can open. */
  billing?: { provider: PaymentProviderName; customerId: string | null },
) {
  if (!Number.isSafeInteger(days) || days <= 0)
    throw new Error('Invalid grant duration');
  return locked(
    userId,
    async (tx) => {
      const old = await tx.supporterMembership.findUnique({
        where: { userId },
      });
      const now = new Date();
      const end = new Date(
        Math.max(
          now.getTime(),
          membershipIsActive(old, now) ? old!.currentPeriodEnd!.getTime() : 0,
        ) +
          days * DAY,
      );
      await tx.supporterMembership.upsert({
        where: { userId },
        create: {
          userId,
          source,
          status: 'ACTIVE',
          provider: billing?.provider ?? 'mock',
          providerCustomerId: billing?.customerId ?? null,
          currentPeriodEnd: end,
        },
        update: {
          source:
            old?.source === 'SUBSCRIPTION' && membershipIsActive(old, now)
              ? 'SUBSCRIPTION'
              : source,
          status: 'ACTIVE',
          currentPeriodEnd: end,
          // A live subscription keeps its own billing identity.
          ...(billing?.customerId &&
          !(old?.source === 'SUBSCRIPTION' && membershipIsActive(old, now))
            ? {
                provider: billing.provider,
                providerCustomerId: billing.customerId,
              }
            : {}),
        },
      });
      await sync(tx, userId);
      return getSupporterStatus(userId, tx);
    },
    db,
  );
}

export async function applySubscriptionStart(
  userId: number,
  end: Date,
  provider: PaymentProviderName,
  customerId: string,
  subscriptionId: string,
  db?: Db,
) {
  return locked(
    userId,
    async (tx) => {
      const old = await tx.supporterMembership.findUnique({
        where: { userId },
      });
      const now = Date.now();
      const extra =
        membershipIsActive(old) && old?.source !== 'SUBSCRIPTION'
          ? Math.max(0, old!.currentPeriodEnd!.getTime() - now)
          : 0;
      const data = {
        source: 'SUBSCRIPTION' as const,
        status: 'ACTIVE' as const,
        provider,
        providerCustomerId: customerId,
        providerSubscriptionId: subscriptionId,
        currentPeriodEnd: new Date(end.getTime() + extra),
        subscriptionPeriodEnd: end,
        cancelAtPeriodEnd: false,
      };
      await tx.supporterMembership.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
      });
      await sync(tx, userId);
    },
    db,
  );
}

async function update(
  userId: number,
  data: Prisma.SupporterMembershipUpdateInput,
  db?: Db,
) {
  return locked(
    userId,
    async (tx) => {
      await tx.supporterMembership.update({ where: { userId }, data });
      await sync(tx, userId);
    },
    db,
  );
}
export function subscriptionEntitlementEnd(
  end: Date,
  currentPeriodEnd: Date | null,
  subscriptionPeriodEnd: Date | null,
) {
  const banked = Math.max(
    0,
    (currentPeriodEnd?.getTime() ?? 0) -
      (subscriptionPeriodEnd?.getTime() ?? currentPeriodEnd?.getTime() ?? 0),
  );
  return new Date(end.getTime() + banked);
}

export const applySubscriptionRenewal = (userId: number, end: Date, db?: Db) =>
  locked(
    userId,
    async (tx) => {
      const old = await tx.supporterMembership.findUniqueOrThrow({
        where: { userId },
      });
      // Ignore stale provider periods so a late event cannot shorten access.
      const periodEnd = new Date(
        Math.max(end.getTime(), old.subscriptionPeriodEnd?.getTime() ?? 0),
      );
      await tx.supporterMembership.update({
        where: { userId },
        data: {
          status: 'ACTIVE',
          subscriptionPeriodEnd: periodEnd,
          currentPeriodEnd: subscriptionEntitlementEnd(
            periodEnd,
            old.currentPeriodEnd,
            old.subscriptionPeriodEnd,
          ),
        },
      });
      await sync(tx, userId);
    },
    db,
  );
export const applySubscriptionUpdate = (
  userId: number,
  end: Date,
  cancelAtPeriodEnd: boolean,
  db?: Db,
) =>
  locked(
    userId,
    async (tx) => {
      const old = await tx.supporterMembership.findUniqueOrThrow({
        where: { userId },
      });
      const periodEnd = new Date(
        Math.max(end.getTime(), old.subscriptionPeriodEnd?.getTime() ?? 0),
      );
      await tx.supporterMembership.update({
        where: { userId },
        data: {
          subscriptionPeriodEnd: periodEnd,
          currentPeriodEnd: subscriptionEntitlementEnd(
            periodEnd,
            old.currentPeriodEnd,
            old.subscriptionPeriodEnd,
          ),
          cancelAtPeriodEnd,
        },
      });
      await sync(tx, userId);
    },
    db,
  );
export const applySubscriptionDeleted = (userId: number, db?: Db) =>
  update(userId, { status: 'CANCELED', cancelAtPeriodEnd: true }, db);
/** Perks continue through the provider's retry window after a failed renewal. */
export const PAST_DUE_GRACE_DAYS = 7;
export const applyPaymentFailed = (userId: number, db?: Db) =>
  locked(
    userId,
    async (tx) => {
      const old = await tx.supporterMembership.findUnique({
        where: { userId },
      });
      if (!old) return;
      // Grace runs from the first failed attempt; retries do not extend it.
      if (old.status === 'PAST_DUE') return;
      const grace = Date.now() + PAST_DUE_GRACE_DAYS * DAY;
      await tx.supporterMembership.update({
        where: { userId },
        data: {
          status: 'PAST_DUE',
          currentPeriodEnd: new Date(
            Math.max(old.currentPeriodEnd?.getTime() ?? 0, grace),
          ),
        },
      });
      await sync(tx, userId);
    },
    db,
  );
export const applyCancel = (userId: number, db?: Db) =>
  update(userId, { cancelAtPeriodEnd: true }, db);
export const applyExpire = (userId: number, db?: Db) =>
  update(userId, { status: 'EXPIRED' }, db);
export const revoke = (userId: number, db?: Db) =>
  update(
    userId,
    {
      status: 'EXPIRED',
      currentPeriodEnd: new Date(),
      cancelAtPeriodEnd: true,
    },
    db,
  );
/**
 * Removes the unused part of the access one payment bought (full refund or
 * open dispute) and returns the seconds removed. Time from other purchases
 * stays: pass and gift time sits after a live subscription period, so it is
 * never taken from the subscription, and vice versa. A recorded window can
 * lag after renewals shift banked time later; the error favours the player.
 */
export const removePaymentAccess = (
  userId: number,
  payment: {
    kind: string;
    accessFrom: Date | null;
    accessUntil: Date | null;
  },
  db?: Db,
) =>
  locked(
    userId,
    async (tx) => {
      const m = await tx.supporterMembership.findUnique({ where: { userId } });
      if (!m?.currentPeriodEnd || !payment.accessUntil) return 0;
      const now = Date.now();
      const from = payment.accessFrom?.getTime() ?? now;
      const until = payment.accessUntil.getTime();
      const subscription = payment.kind === 'SUBSCRIPTION';
      // Only the live subscription period can hold subscription time; only
      // time after it can hold pass time.
      const subEnd =
        m.source === 'SUBSCRIPTION' && m.subscriptionPeriodEnd
          ? m.subscriptionPeriodEnd.getTime()
          : null;
      const floor = !subscription && subEnd && subEnd > now ? subEnd : now;
      const ceiling =
        subscription && subEnd ? subEnd : m.currentPeriodEnd.getTime();
      const removed = Math.max(
        0,
        Math.min(until - Math.max(now, from), ceiling - floor, until - from),
      );
      if (!removed) return 0;
      await tx.supporterMembership.update({
        where: { userId },
        data: {
          currentPeriodEnd: new Date(m.currentPeriodEnd.getTime() - removed),
          ...(subscription && m.subscriptionPeriodEnd
            ? {
                subscriptionPeriodEnd: new Date(
                  m.subscriptionPeriodEnd.getTime() - removed,
                ),
              }
            : {}),
        },
      });
      await sync(tx, userId);
      return Math.floor(removed / 1000);
    },
    db,
  );

/** Gives back access a dispute removed, after the dispute is won. */
export const restorePaymentAccess = (
  userId: number,
  seconds: number,
  kind: string,
  db?: Db,
) =>
  locked(
    userId,
    async (tx) => {
      const m = await tx.supporterMembership.findUnique({ where: { userId } });
      if (!m || seconds <= 0) return;
      const now = Date.now();
      const base = Math.max(now, m.currentPeriodEnd?.getTime() ?? 0);
      await tx.supporterMembership.update({
        where: { userId },
        data: {
          status: m.status === 'EXPIRED' ? 'ACTIVE' : m.status,
          currentPeriodEnd: new Date(base + seconds * 1000),
          ...(kind === 'SUBSCRIPTION' && m.subscriptionPeriodEnd
            ? {
                // Anchor to now too, so a long dispute is not read later as
                // banked time (currentPeriodEnd minus subscriptionPeriodEnd).
                subscriptionPeriodEnd: new Date(
                  Math.max(now, m.subscriptionPeriodEnd.getTime()) +
                    seconds * 1000,
                ),
              }
            : {}),
        },
      });
      await sync(tx, userId);
    },
    db,
  );
export const setBadgeVisible = (
  userId: number,
  badgeVisible: boolean,
  db?: Db,
) => update(userId, { badgeVisible }, db);
export const recompute = (userId: number, db?: Db) =>
  locked(
    userId,
    async (tx) => {
      const m = await tx.supporterMembership.findUnique({ where: { userId } });
      if (
        m?.currentPeriodEnd &&
        m.currentPeriodEnd <= new Date() &&
        m.status !== 'EXPIRED'
      )
        await tx.supporterMembership.update({
          where: { userId },
          data: { status: m.cancelAtPeriodEnd ? 'CANCELED' : 'EXPIRED' },
        });
      await sync(tx, userId);
    },
    db,
  );
