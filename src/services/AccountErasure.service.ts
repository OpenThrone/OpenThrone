import { createHash, randomBytes } from 'crypto';

import prisma from '@/lib/prisma';
import type { AccountErasureRequest, Prisma } from '@/lib/prisma-exports';
import {
  AccountAnonymizationService,
  isAnonymizedUser,
} from '@/services/AccountAnonymization.service';
import { AllianceService } from '@/services/Alliance.service';
import { sendImmediate } from '@/services/Email.service';
import {
  renderErasureConfirmEmail,
  renderErasureScheduledEmail,
} from '@/services/privacyEmails';
import {
  deleteUserAvatarFiles,
  ERASURE_RECORD_RETENTION_DAYS,
  EXPORT_LOG_RETENTION_DAYS,
} from '@/services/PrivacyRetention.service';
import {
  endSupporterBillingSoon,
  resumeSupporterBillingSoon,
} from '@/services/supporter/AccountBilling.service';
import { logActionStrict } from '@/utils/auditLogger';
import { consumeRateLimit } from '@/utils/credentialGuards';
import { logError } from '@/utils/logger';
import { requireReauth } from '@/utils/reauth';

const DAY_MS = 86_400_000;

/** Days between a confirmed request and the erasure; the player can cancel until then. */
export const ERASURE_GRACE_DAYS = 14;
/** Hours the emailed confirmation link stays valid. */
export const ERASURE_CONFIRM_TTL_HOURS = 24;
/** Requests (including re-sends) a player may start per hour. */
const REQUEST_LIMIT = { windowMs: 60 * 60_000, max: 3 };
/** Fixed reason written to the CLOSED status row; the player's free text is never copied there. */
const CLOSED_REASON = 'Erasure requested (grace period)';
const ERASED_REASON = 'User requested deletion';
const MIN_STAFF_REASON_LENGTH = 10;
const MAX_REASON_LENGTH = 500;

export type ErasureErrorCode =
  | 'staff_account'
  | 'already_scheduled'
  | 'rate_limited'
  | 'email_failed'
  | 'invalid_token'
  | 'not_found'
  | 'not_pending'
  | 'reason_required'
  | 'not_due'
  | 'already_erased';

/** Expected refusal; `code` is stable and safe to expose. */
export class ErasureError extends Error {
  constructor(public readonly code: ErasureErrorCode) {
    super(code);
    this.name = 'ErasureError';
  }
}

export const hashErasureToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

const isErased = (user: { email: string | null; anonymizedAt?: Date | null }) =>
  isAnonymizedUser(user);

const lockUser = (tx: Prisma.TransactionClient, userId: number) =>
  tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;

const cleanReason = (value: string | undefined | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, MAX_REASON_LENGTH) : null;
};

/**
 * Whether the player's subscription is still renewing. Read inside the
 * transaction that starts the grace period and stored on the request before the
 * provider is called, so a failed provider call, the daily billing sweep, or the
 * gap between commit and the provider call still leads to a resume on cancel.
 * A subscription the player had already set to end is not counted.
 */
async function subscriptionIsRenewing(
  tx: Prisma.TransactionClient,
  userId: number,
) {
  const membership = await tx.supporterMembership.findUnique({
    where: { userId },
    select: {
      cancelAtPeriodEnd: true,
      status: true,
      providerSubscriptionId: true,
    },
  });
  return (
    Boolean(membership?.providerSubscriptionId) &&
    !membership?.cancelAtPeriodEnd &&
    membership?.status !== 'CANCELED' &&
    membership?.status !== 'EXPIRED'
  );
}

/** The player-visible state of their own erasure request. */
export interface ErasureState {
  status: 'NONE' | 'AWAITING_CONFIRMATION' | 'PENDING';
  requestedAt: string | null;
  confirmationExpiresAt: string | null;
  scheduledFor: string | null;
}

/** Live request for a player, if any. */
export async function getOpenErasureRequest(
  userId: number,
  client: Pick<Prisma.TransactionClient, 'accountErasureRequest'> = prisma,
): Promise<AccountErasureRequest | null> {
  return client.accountErasureRequest.findFirst({
    where: {
      userId,
      status: { in: ['AWAITING_CONFIRMATION', 'PENDING'] },
    },
    orderBy: { id: 'desc' },
  });
}

export async function getErasureState(userId: number): Promise<ErasureState> {
  const request = await getOpenErasureRequest(userId);
  if (!request) {
    return {
      status: 'NONE',
      requestedAt: null,
      confirmationExpiresAt: null,
      scheduledFor: null,
    };
  }
  return {
    status: request.status as 'AWAITING_CONFIRMATION' | 'PENDING',
    requestedAt: request.requestedAt.toISOString(),
    confirmationExpiresAt: request.tokenExpiresAt?.toISOString() ?? null,
    scheduledFor: request.scheduledFor?.toISOString() ?? null,
  };
}

/**
 * Step 1: the signed-in player re-proves identity and asks for erasure. A
 * single-use link goes to the address on file; nothing changes until it is
 * pressed. A second request while one awaits confirmation replaces it.
 */
export async function requestErasure(
  userId: number,
  input: {
    password?: string;
    totpToken?: string;
    reason?: string;
    ip: string;
  },
): Promise<ErasureState> {
  await requireReauth(userId, 'erasure', input);
  if (!(await consumeRateLimit(`erasure-request:${userId}`, REQUEST_LIMIT))) {
    throw new ErasureError('rate_limited');
  }

  const token = randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + ERASURE_CONFIRM_TTL_HOURS * 3_600_000,
  );

  const { request, email, locale } = await prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const user = await tx.users.findUnique({
      where: { id: userId },
      select: { email: true, anonymizedAt: true, locale: true },
    });
    if (!user || isErased(user)) throw new ErasureError('not_found');
    const staff = await tx.staffRoleAssignment.findFirst({
      where: { userId, revokedAt: null },
      select: { id: true },
    });
    if (staff) throw new ErasureError('staff_account');

    const existing = await getOpenErasureRequest(userId, tx);
    if (existing?.status === 'PENDING') {
      throw new ErasureError('already_scheduled');
    }
    if (existing) {
      await tx.accountErasureRequest.update({
        where: { id: existing.id },
        data: {
          status: 'EXPIRED',
          tokenHash: null,
          tokenExpiresAt: null,
          userReason: null,
        },
      });
    }
    const created = await tx.accountErasureRequest.create({
      data: {
        userId,
        tokenHash: hashErasureToken(token),
        tokenExpiresAt: expiresAt,
        userReason: cleanReason(input.reason),
      },
    });
    await logActionStrict(
      {
        userId,
        action: 'ACCOUNT_ERASURE_REQUESTED',
        ip: input.ip,
        entityType: 'AccountErasureRequest',
        entityId: created.id,
      },
      tx,
    );
    return { request: created, email: user.email, locale: user.locale };
  });

  try {
    await sendImmediate({
      to: email,
      ...renderErasureConfirmEmail(locale, token, ERASURE_CONFIRM_TTL_HOURS),
    });
  } catch (error) {
    await prisma.accountErasureRequest.updateMany({
      where: { id: request.id, status: 'AWAITING_CONFIRMATION' },
      data: {
        status: 'EXPIRED',
        tokenHash: null,
        tokenExpiresAt: null,
        userReason: null,
      },
    });
    logError(error, { userId }, 'Erasure confirmation email failed');
    throw new ErasureError('email_failed');
  }
  return getErasureState(userId);
}

/**
 * Step 2: the player presses Confirm on the page the emailed link opens. The
 * account is deactivated at once (a
 * CLOSED status row, so existing sessions stop working and login offers the
 * cancel path), the erasure is scheduled after the grace period, and the
 * subscription stops renewing. The token alone proves control of the address.
 */
export async function confirmErasure(
  token: string,
  ip: string,
): Promise<{ scheduledFor: Date }> {
  const tokenHash = hashErasureToken(token);
  const now = new Date();
  const scheduledFor = new Date(now.getTime() + ERASURE_GRACE_DAYS * DAY_MS);

  const result = await prisma.$transaction(async (tx) => {
    const found = await tx.accountErasureRequest.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true },
    });
    if (!found) throw new ErasureError('invalid_token');
    await lockUser(tx, found.userId);
    const request = await tx.accountErasureRequest.findUnique({
      where: { id: found.id },
    });
    if (
      !request ||
      request.status !== 'AWAITING_CONFIRMATION' ||
      request.tokenHash !== tokenHash
    ) {
      throw new ErasureError('invalid_token');
    }
    if (!request.tokenExpiresAt || request.tokenExpiresAt <= now) {
      await tx.accountErasureRequest.update({
        where: { id: request.id },
        data: {
          status: 'EXPIRED',
          tokenHash: null,
          tokenExpiresAt: null,
          userReason: null,
        },
      });
      return { expired: true as const };
    }
    const user = await tx.users.findUnique({
      where: { id: request.userId },
      select: { email: true, anonymizedAt: true, locale: true },
    });
    if (!user || isErased(user)) throw new ErasureError('already_erased');

    const closed = await tx.accountStatusHistory.create({
      data: {
        user_id: request.userId,
        status: 'CLOSED',
        start_date: now,
        reason: CLOSED_REASON,
      },
    });
    // API clients stop working with the account; they are not restored on cancel.
    await tx.apiToken.updateMany({
      where: { client: { ownerUserId: request.userId }, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.apiClient.updateMany({
      where: { ownerUserId: request.userId, status: 'ACTIVE' },
      data: { status: 'DISABLED' },
    });
    await tx.accountErasureRequest.update({
      where: { id: request.id },
      data: {
        status: 'PENDING',
        confirmedAt: now,
        scheduledFor,
        closedStatusId: closed.id,
        billingStopped: await subscriptionIsRenewing(tx, request.userId),
        tokenHash: null,
        tokenExpiresAt: null,
      },
    });
    await logActionStrict(
      {
        userId: request.userId,
        action: 'ACCOUNT_ERASURE_CONFIRMED',
        ip,
        entityType: 'AccountErasureRequest',
        entityId: request.id,
        details: { scheduledFor: scheduledFor.toISOString() },
      },
      tx,
    );
    return {
      expired: false as const,
      requestId: request.id,
      userId: request.userId,
      email: user.email,
      locale: user.locale,
    };
  });

  if (result.expired) throw new ErasureError('invalid_token');

  await endSupporterBillingSoon(result.userId, 'period_end');
  try {
    await sendImmediate({
      to: result.email,
      ...renderErasureScheduledEmail(result.locale, scheduledFor),
    });
  } catch (error) {
    logError(
      error,
      { userId: result.userId },
      'Erasure scheduled email failed',
    );
  }
  return { scheduledFor };
}

interface CancelOptions {
  by: 'USER' | 'ADMIN';
  /** When set, only that request is cancelled; another live one is left alone. */
  requestId?: number;
  adminId?: number;
  reason?: string | null;
  ip: string;
}

/**
 * Cancels the live request (awaiting confirmation or in the grace period) and
 * reactivates the account. Returns false when there was nothing to cancel.
 */
export async function cancelErasure(
  userId: number,
  options: CancelOptions,
  client?: Prisma.TransactionClient,
): Promise<boolean> {
  let resumeBilling = false;
  const run = async (tx: Prisma.TransactionClient) => {
    await lockUser(tx, userId);
    const request = await getOpenErasureRequest(userId, tx);
    if (!request) return false;
    // The request staff looked at may have been replaced while they waited.
    if (options.requestId !== undefined && request.id !== options.requestId) {
      return false;
    }
    resumeBilling = request.billingStopped;
    const now = new Date();
    await tx.accountErasureRequest.update({
      where: { id: request.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: now,
        cancelledBy: options.by,
        // The reason is in the audit row; the retained request keeps no free
        // text, and a cancelled request shows no earlier failure.
        lastError: null,
        tokenHash: null,
        tokenExpiresAt: null,
        userReason: null,
      },
    });
    if (request.status === 'PENDING' && request.closedStatusId) {
      // Take the grace-period CLOSED row away rather than ending it: status
      // readers use the latest row, so an ended row on top would read as
      // unrestricted and lift a ban, suspension, vacation or closure written
      // before it. Removing it makes that earlier row the latest again, exactly
      // as it was (the row is ours and nothing else references it).
      await tx.accountStatusHistory.deleteMany({
        where: { id: request.closedStatusId },
      });
    }
    await logActionStrict(
      {
        userId: options.adminId ?? userId,
        action:
          options.by === 'ADMIN'
            ? 'ADMIN_ACCOUNT_ERASURE_CANCELLED'
            : 'ACCOUNT_ERASURE_CANCELLED',
        ip: options.ip,
        targetUserId: userId,
        entityType: 'AccountErasureRequest',
        entityId: request.id,
        details: {
          previousStatus: request.status,
          ...(options.by === 'ADMIN'
            ? { reason: cleanReason(options.reason) }
            : {}),
        },
      },
      tx,
    );
    return true;
  };
  if (client) return run(client);
  const cancelled = await prisma.$transaction(run);
  // After the commit: restart renewal this request stopped, if the paid period
  // is still running. A lapsed subscription is not revived; the player can
  // subscribe again.
  if (cancelled && resumeBilling) await resumeSupporterBillingSoon(userId);
  return cancelled;
}

type ExecuteOutcome = 'erased' | 'already_erased' | 'not_due' | 'not_pending';

interface ExecuteOptions {
  now?: Date;
  /** Staff skipped the grace period; requires `reason`. */
  expedite?: { adminId: number; reason: string; ip: string };
}

/**
 * Erases one pending request: the existing anonymization, which now also
 * removes the remaining personal data. Locks the user and re-reads the request
 * inside the transaction, so concurrent runs and repeats do nothing twice.
 */
export async function executeErasure(
  requestId: number,
  options: ExecuteOptions = {},
): Promise<ExecuteOutcome> {
  const now = options.now ?? new Date();
  const outcome = await prisma.$transaction(
    async (tx): Promise<{ outcome: ExecuteOutcome; userId?: number }> => {
      const found = await tx.accountErasureRequest.findUnique({
        where: { id: requestId },
        select: { userId: true },
      });
      if (!found) return { outcome: 'not_pending' };
      // #318: the erased player leaves every alliance here, before the
      // first user-row lock, so the whole erasure transaction takes
      // alliance locks in the canonical leave/kick order. Nothing is lost
      // when the request turns out not actionable: the exit rolls back
      // with the rest of this transaction.
      await AllianceService.leaveAllAlliancesOnErasure(tx, found.userId, {
        actorUserId: options.expedite?.adminId,
      });
      await lockUser(tx, found.userId);
      const request = await tx.accountErasureRequest.findUnique({
        where: { id: requestId },
      });
      if (!request || request.status !== 'PENDING') {
        return { outcome: 'not_pending' };
      }
      if (
        !options.expedite &&
        (!request.scheduledFor || request.scheduledFor > now)
      ) {
        return { outcome: 'not_due' };
      }
      const user = await tx.users.findUnique({
        where: { id: request.userId },
        select: { email: true, anonymizedAt: true },
      });
      const finish = {
        status: 'COMPLETED' as const,
        completedAt: now,
        tokenHash: null,
        tokenExpiresAt: null,
        userReason: null,
        lastError: null,
        ...(options.expedite
          ? {
              expeditedByUserId: options.expedite.adminId,
            }
          : {}),
      };
      if (!user || isErased(user)) {
        // An earlier attempt committed the erasure but not the bookkeeping.
        await tx.accountErasureRequest.update({
          where: { id: request.id },
          data: finish,
        });
        return { outcome: 'already_erased', userId: request.userId };
      }
      await AccountAnonymizationService.anonymizeAccount(tx, request.userId, {
        reason: ERASED_REASON,
        initiatedBy: 'SELF',
        // The audit actor is the staff member who erased early, else the player.
        actorUserId: options.expedite?.adminId,
        auditDetails: {
          requestId: request.id,
          ...(request.openedByUserId
            ? { openedByStaffUserId: request.openedByUserId }
            : {}),
          ...(options.expedite
            ? { expeditedByStaffUserId: options.expedite.adminId }
            : {}),
        },
      });
      await tx.accountErasureRequest.update({
        where: { id: request.id },
        data: finish,
      });
      if (options.expedite) {
        await logActionStrict(
          {
            userId: options.expedite.adminId,
            action: 'ADMIN_ACCOUNT_ERASURE_EXPEDITED',
            ip: options.expedite.ip,
            targetUserId: request.userId,
            entityType: 'AccountErasureRequest',
            entityId: request.id,
            details: { reason: cleanReason(options.expedite.reason) },
          },
          tx,
        );
      }
      return { outcome: 'erased', userId: request.userId };
    },
    { timeout: 60_000 },
  );

  if (outcome.outcome === 'erased' && outcome.userId) {
    await endSupporterBillingSoon(outcome.userId, 'now');
    await deleteUserAvatarFiles(outcome.userId);
  }
  return outcome.outcome;
}

/** Records a failed attempt so staff can see why a request is stuck. */
async function recordFailure(requestId: number, error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  await prisma.accountErasureRequest
    .update({
      where: { id: requestId },
      data: { attempts: { increment: 1 }, lastError: message.slice(0, 200) },
    })
    .catch(() => undefined);
}

export interface ErasureJobResult {
  erased: number;
  failed: number;
  expired: number;
}

/**
 * Daily job: lapses confirmations that were never opened, then erases every
 * request whose grace period has ended. Each request is independent and the
 * run can be repeated safely.
 */
export async function processDueErasures(
  now = new Date(),
  limit = 100,
): Promise<ErasureJobResult> {
  const result: ErasureJobResult = { erased: 0, failed: 0, expired: 0 };

  const lapsed = await prisma.accountErasureRequest.updateMany({
    where: { status: 'AWAITING_CONFIRMATION', tokenExpiresAt: { lte: now } },
    data: {
      status: 'EXPIRED',
      tokenHash: null,
      tokenExpiresAt: null,
      userReason: null,
    },
  });
  result.expired = lapsed.count;

  const due = await prisma.accountErasureRequest.findMany({
    where: { status: 'PENDING', scheduledFor: { lte: now } },
    orderBy: { scheduledFor: 'asc' },
    take: limit,
    select: { id: true },
  });
  for (const { id } of due) {
    try {
      const outcome = await executeErasure(id, { now });
      if (outcome === 'erased') result.erased++;
    } catch (error) {
      result.failed++;
      logError(error, { requestId: id }, 'Scheduled erasure failed');
      await recordFailure(id, error);
    }
  }
  return result;
}

/** Daily: drops finished requests and export-log rows past their retention. */
export async function pruneErasureRecords(now = new Date()) {
  try {
    await prisma.accountErasureRequest.deleteMany({
      where: {
        status: { in: ['COMPLETED', 'CANCELLED', 'EXPIRED'] },
        requestedAt: {
          lt: new Date(now.getTime() - ERASURE_RECORD_RETENTION_DAYS * DAY_MS),
        },
      },
    });
    await prisma.accountDataExport.deleteMany({
      where: {
        requestedAt: {
          lt: new Date(now.getTime() - EXPORT_LOG_RETENTION_DAYS * DAY_MS),
        },
      },
    });
  } catch {
    logError('Unable to prune privacy request records');
  }
}

/**
 * Staff opens a request for a player who cannot sign in, after verifying the
 * support request outside the game. The grace period applies in full; there is
 * no confirmation email because staff verified the person instead.
 */
export async function adminOpenErasure(
  userId: number,
  input: { adminId: number; reason: string; ip: string },
): Promise<AccountErasureRequest> {
  const reason = cleanReason(input.reason);
  if (!reason || reason.length < MIN_STAFF_REASON_LENGTH) {
    throw new ErasureError('reason_required');
  }
  const now = new Date();
  const scheduledFor = new Date(now.getTime() + ERASURE_GRACE_DAYS * DAY_MS);
  const request = await prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const user = await tx.users.findUnique({
      where: { id: userId },
      select: { email: true, anonymizedAt: true },
    });
    if (!user || isErased(user)) throw new ErasureError('not_found');
    const staff = await tx.staffRoleAssignment.findFirst({
      where: { userId, revokedAt: null },
      select: { id: true },
    });
    if (staff) throw new ErasureError('staff_account');
    const existing = await getOpenErasureRequest(userId, tx);
    if (existing?.status === 'PENDING')
      throw new ErasureError('already_scheduled');
    if (existing) {
      await tx.accountErasureRequest.update({
        where: { id: existing.id },
        data: {
          status: 'EXPIRED',
          tokenHash: null,
          tokenExpiresAt: null,
          userReason: null,
        },
      });
    }
    const closed = await tx.accountStatusHistory.create({
      data: {
        user_id: userId,
        status: 'CLOSED',
        start_date: now,
        reason: CLOSED_REASON,
      },
    });
    const created = await tx.accountErasureRequest.create({
      data: {
        userId,
        status: 'PENDING',
        confirmedAt: now,
        scheduledFor,
        closedStatusId: closed.id,
        openedByUserId: input.adminId,
        billingStopped: await subscriptionIsRenewing(tx, userId),
      },
    });
    await tx.apiToken.updateMany({
      where: { client: { ownerUserId: userId }, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.apiClient.updateMany({
      where: { ownerUserId: userId, status: 'ACTIVE' },
      data: { status: 'DISABLED' },
    });
    await logActionStrict(
      {
        userId: input.adminId,
        action: 'ADMIN_ACCOUNT_ERASURE_OPENED',
        ip: input.ip,
        targetUserId: userId,
        entityType: 'AccountErasureRequest',
        entityId: created.id,
        details: { reason, scheduledFor: scheduledFor.toISOString() },
      },
      tx,
    );
    return created;
  });
  // After the commit, like the player's own confirmation: stop renewal.
  await endSupporterBillingSoon(userId, 'period_end');
  return request;
}

/** Staff erases a pending request before its grace period ends, with a recorded reason. */
export async function adminExpediteErasure(
  requestId: number,
  input: { adminId: number; reason: string; ip: string },
): Promise<void> {
  const reason = cleanReason(input.reason);
  if (!reason || reason.length < MIN_STAFF_REASON_LENGTH) {
    throw new ErasureError('reason_required');
  }
  const outcome = await executeErasure(requestId, {
    expedite: { adminId: input.adminId, reason, ip: input.ip },
  });
  if (outcome === 'not_pending') throw new ErasureError('not_pending');
}

/** Staff cancels any live request; the reason is required and audited. */
export async function adminCancelErasure(
  requestId: number,
  input: { adminId: number; reason: string; ip: string },
): Promise<void> {
  const reason = cleanReason(input.reason);
  if (!reason || reason.length < MIN_STAFF_REASON_LENGTH) {
    throw new ErasureError('reason_required');
  }
  const request = await prisma.accountErasureRequest.findUnique({
    where: { id: requestId },
    select: { userId: true, status: true },
  });
  if (
    !request ||
    (request.status !== 'PENDING' && request.status !== 'AWAITING_CONFIRMATION')
  ) {
    throw new ErasureError('not_pending');
  }
  const cancelled = await cancelErasure(request.userId, {
    by: 'ADMIN',
    requestId,
    adminId: input.adminId,
    reason,
    ip: input.ip,
  });
  if (!cancelled) throw new ErasureError('not_pending');
}
