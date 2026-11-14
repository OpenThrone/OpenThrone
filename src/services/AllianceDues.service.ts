import { z } from 'zod';

import {
  ALLIANCE_DUES_CODES,
  ALLIANCE_DUES_PERIODS,
  AllianceDuesError,
  type AllianceDuesPeriod,
  getDuesPeriodStart,
  getNextDuesCollection,
  validateAllianceDuesSettingsDetailed,
} from '@/constants/allianceDues';
import { ALLIANCE_RULE_CODES } from '@/constants/allianceErrors';
import { hasAlliancePermission } from '@/constants/alliancePermissions';
import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import { AllianceTransactionType } from '@/lib/prisma-exports';
import {
  ALLIANCE_BANK_TX_OPTIONS,
  lockAllianceThenUsers,
} from '@/services/AllianceBank.service';
import {
  assertAllianceActive,
  isAllianceActive,
} from '@/services/allianceStatus';
import { lockEraLifecycleShared } from '@/utils/eraLifecycleLock';
import { logError } from '@/utils/logger';

type Tx = Prisma.TransactionClient;

const formatGold = (amount: bigint) => amount.toLocaleString('en-US');

const Gold = z.coerce.bigint().min(0n);

const SettingsSchema = z.object({
  allianceId: z.number().int().positive(),
  actorId: z.number().int().positive(),
  joinFee: Gold,
  duesAmount: Gold,
  duesPeriod: z.enum(ALLIANCE_DUES_PERIODS),
});

const PaySchema = z.object({
  allianceId: z.number().int().positive(),
  userId: z.number().int().positive(),
  amount: z.coerce.bigint().min(1n),
});

/** Who pays the join fee, for the refusal wording. */
type FeePayer = 'self' | 'applicant';

/**
 * Charges the alliance's current join fee to a joining player inside the
 * joining transaction. The caller already holds the alliance and player locks
 * (lockAllianceThenUsers order). The debit is conditional on gold on hand, so
 * a player who cannot pay is refused and the whole join rolls back. The fee
 * goes to the treasury even above the Alliance Hall treasury cap, like loan
 * repayments. When `expectedFee` is given (the fee the player confirmed) and
 * the fee changed since, the join is refused so nobody pays an unseen fee.
 *
 * Returns the start of the current dues period, which the new membership
 * stores as dues_paid_through: its first dues fall due at the next boundary.
 */
export const chargeJoinFeeInTx = async (
  tx: Tx,
  params: {
    allianceId: number;
    userId: number;
    payer: FeePayer;
    expectedFee?: bigint | null;
    now?: Date;
  },
): Promise<{ fee: bigint; duesPaidThrough: Date | null }> => {
  const now = params.now ?? new Date();
  const alliance = await tx.alliances.findUnique({
    where: { id: params.allianceId },
    select: { join_fee: true, dues_period: true },
  });
  const fee = BigInt(alliance?.join_fee ?? 0n);
  const duesPaidThrough = getDuesPeriodStart(alliance?.dues_period, now);

  if (
    params.expectedFee !== undefined &&
    params.expectedFee !== null &&
    params.expectedFee !== fee
  ) {
    throw new AllianceDuesError(
      ALLIANCE_DUES_CODES.feeChanged,
      `The join fee is now ${formatGold(fee)} gold. Review it and confirm again.`,
      { fee: Number(fee) },
    );
  }
  if (fee <= 0n) return { fee: 0n, duesPaidThrough };

  const debit = await tx.users.updateMany({
    where: { id: params.userId, gold: { gte: fee } },
    data: { gold: { decrement: fee } },
  });
  if (debit.count !== 1) {
    throw new AllianceDuesError(
      params.payer === 'self'
        ? ALLIANCE_RULE_CODES.feeUnpaidSelf
        : ALLIANCE_RULE_CODES.feeUnpaidApplicant,
      params.payer === 'self'
        ? `The join fee is ${formatGold(fee)} gold, paid from gold on hand. You do not have enough gold on hand.`
        : `The join fee is ${formatGold(fee)} gold, paid from gold on hand, and the applicant does not have enough gold on hand.`,
      { fee: Number(fee) },
    );
  }
  await tx.alliances.update({
    where: { id: params.allianceId },
    data: { gold_in_bank: { increment: fee } },
  });
  await tx.alliance_bank_history.create({
    data: {
      alliance_id: params.allianceId,
      transaction_type: AllianceTransactionType.FEE,
      amount: fee,
      performed_by_user_id: params.userId,
      related_user_id: params.userId,
      notes: 'Join fee',
    },
  });
  return { fee, duesPaidThrough };
};

/** What the Overview, Bank and Settings tabs show about fee and dues. */
export interface AllianceDuesStatus {
  allianceId: number;
  status: string;
  joinFee: bigint;
  duesAmount: bigint;
  duesPeriod: AllianceDuesPeriod;
  /** When dues are next collected; null when there are no dues or reserved. */
  nextCollectionAt: Date | null;
  /** Members only: the viewer's membership dues. */
  member: {
    isLeader: boolean;
    arrears: bigint;
    paidThrough: Date | null;
  } | null;
  /** Leader or set_dues: may change the fee and dues. */
  canSetDues: boolean;
}

/** Outcome of one alliance's dues pass. */
export interface AllianceDuesRunResult {
  allianceId: number;
  charged: number;
  collected: bigint;
  arrearsAdded: bigint;
}

const isPeriod = (value: unknown): value is AllianceDuesPeriod =>
  (ALLIANCE_DUES_PERIODS as readonly string[]).includes(String(value));

/** Alliance join fee and recurring dues. */
export class AllianceDuesService {
  /** Fee and dues for anyone signed in; members also see their arrears. */
  static async getStatus(
    allianceId: number,
    viewerId: number,
    now: Date = new Date(),
  ): Promise<AllianceDuesStatus> {
    const [alliance, membership] = await Promise.all([
      prisma.alliances.findUnique({
        where: { id: allianceId },
        select: {
          id: true,
          leader_id: true,
          status: true,
          join_fee: true,
          dues_amount: true,
          dues_period: true,
        },
      }),
      prisma.alliance_memberships.findUnique({
        where: {
          unique_alliance_user: { alliance_id: allianceId, user_id: viewerId },
        },
        include: { role: true },
      }),
    ]);
    if (!alliance) {
      throw new AllianceDuesError(
        ALLIANCE_RULE_CODES.notFound,
        'Alliance not found',
      );
    }
    const duesPeriod = isPeriod(alliance.dues_period)
      ? alliance.dues_period
      : 'NONE';
    const duesAmount = BigInt(alliance.dues_amount ?? 0n);
    const isLeader = alliance.leader_id === viewerId;
    const isMember = !!membership || isLeader;
    return {
      allianceId,
      status: alliance.status ?? 'ACTIVE',
      joinFee: BigInt(alliance.join_fee ?? 0n),
      duesAmount,
      duesPeriod,
      nextCollectionAt:
        isAllianceActive(alliance) && duesAmount > 0n
          ? getNextDuesCollection(duesPeriod, now)
          : null,
      member: isMember
        ? {
            isLeader,
            arrears: BigInt(membership?.dues_arrears ?? 0n),
            paidThrough: membership?.dues_paid_through ?? null,
          }
        : null,
      canSetDues:
        isMember &&
        hasAlliancePermission(
          alliance.leader_id,
          viewerId,
          membership?.role ?? null,
          'set_dues',
        ),
    };
  }

  /**
   * Sets the join fee and dues. Leader or set_dues; the alliance must be
   * active. A new period (including turning dues on) starts counting from
   * now: every membership is marked paid through the current period, so the
   * first dues fall at the next boundary and nobody is charged
   * retroactively. Changing only the amount applies from the next boundary.
   * The fee only affects players who join after the change.
   */
  static async updateSettings(data: {
    allianceId: number;
    actorId: number;
    joinFee: bigint | number | string;
    duesAmount: bigint | number | string;
    duesPeriod: string;
  }) {
    const input = SettingsSchema.parse(data) as Required<
      z.infer<typeof SettingsSchema>
    >;
    const refusal = validateAllianceDuesSettingsDetailed(input);
    if (refusal) {
      throw new AllianceDuesError(
        refusal.code,
        refusal.message,
        refusal.params,
      );
    }
    const now = new Date();
    try {
      return await prisma.$transaction(async (tx) => {
        await lockEraLifecycleShared(tx);
        await lockAllianceThenUsers(tx, input.allianceId, []);
        const alliance = await tx.alliances.findUnique({
          where: { id: input.allianceId },
          select: {
            id: true,
            leader_id: true,
            status: true,
            join_fee: true,
            dues_amount: true,
            dues_period: true,
          },
        });
        if (!alliance) {
          throw new AllianceDuesError(
            ALLIANCE_RULE_CODES.notFound,
            'Alliance not found',
          );
        }
        assertAllianceActive(alliance);

        if (alliance.leader_id !== input.actorId) {
          const membership = await tx.alliance_memberships.findUnique({
            where: {
              unique_alliance_user: {
                alliance_id: input.allianceId,
                user_id: input.actorId,
              },
            },
            include: { role: true },
          });
          if (!membership) {
            throw new AllianceDuesError(
              ALLIANCE_RULE_CODES.notMember,
              'You are not a member of this alliance',
            );
          }
          if (
            !hasAlliancePermission(
              alliance.leader_id,
              input.actorId,
              membership.role,
              'set_dues',
            )
          ) {
            throw new AllianceDuesError(
              ALLIANCE_RULE_CODES.duesForbidden,
              'You do not have permission to set the join fee and dues',
            );
          }
        }

        await tx.alliances.update({
          where: { id: input.allianceId },
          data: {
            join_fee: input.joinFee,
            dues_amount: input.duesAmount,
            dues_period: input.duesPeriod,
          },
        });
        if (alliance.dues_period !== input.duesPeriod) {
          await tx.alliance_memberships.updateMany({
            where: { alliance_id: input.allianceId },
            data: {
              dues_paid_through: getDuesPeriodStart(input.duesPeriod, now),
            },
          });
        }
        return {
          message: 'Fee and dues saved',
          previous: {
            joinFee: BigInt(alliance.join_fee ?? 0n),
            duesAmount: BigInt(alliance.dues_amount ?? 0n),
            duesPeriod: alliance.dues_period,
          },
        };
      }, ALLIANCE_BANK_TX_OPTIONS);
    } catch (error) {
      logError('Error saving alliance dues settings', { ...input, error });
      throw error;
    }
  }

  /**
   * A member pays dues arrears from gold on hand into the treasury. Pays at
   * most what is owed; refuses when the member lacks the gold. Recorded as a
   * TAX row like collected dues.
   */
  static async payArrears(data: {
    allianceId: number;
    userId: number;
    amount: bigint | number | string;
  }) {
    const input = PaySchema.parse(data);
    try {
      return await prisma.$transaction(async (tx) => {
        await lockEraLifecycleShared(tx);
        await lockAllianceThenUsers(tx, input.allianceId, [input.userId]);
        const alliance = await tx.alliances.findUnique({
          where: { id: input.allianceId },
          select: { status: true },
        });
        if (!alliance) {
          throw new AllianceDuesError(
            ALLIANCE_RULE_CODES.notFound,
            'Alliance not found',
          );
        }
        assertAllianceActive(alliance);
        const membership = await tx.alliance_memberships.findUnique({
          where: {
            unique_alliance_user: {
              alliance_id: input.allianceId,
              user_id: input.userId,
            },
          },
          select: { id: true, dues_arrears: true },
        });
        if (!membership) {
          throw new AllianceDuesError(
            ALLIANCE_RULE_CODES.notMember,
            'You are not a member of this alliance',
          );
        }
        const owed = BigInt(membership.dues_arrears ?? 0n);
        if (owed <= 0n) {
          throw new AllianceDuesError(
            ALLIANCE_RULE_CODES.duesNoneOwed,
            'You owe no dues',
          );
        }
        const pay = input.amount > owed ? owed : input.amount;

        const debit = await tx.users.updateMany({
          where: { id: input.userId, gold: { gte: pay } },
          data: { gold: { decrement: pay } },
        });
        if (debit.count !== 1) {
          throw new AllianceDuesError(
            ALLIANCE_RULE_CODES.duesNeedGold,
            `You need ${formatGold(pay)} gold on hand to pay these dues`,
            { pay: Number(pay) },
          );
        }
        const settled = await tx.alliance_memberships.updateMany({
          where: { id: membership.id, dues_arrears: { gte: pay } },
          data: { dues_arrears: { decrement: pay } },
        });
        if (settled.count !== 1) {
          throw new AllianceDuesError(
            ALLIANCE_RULE_CODES.duesChanged,
            'Your dues changed; reload and try again',
          );
        }
        await tx.alliances.update({
          where: { id: input.allianceId },
          data: { gold_in_bank: { increment: pay } },
        });
        await tx.alliance_bank_history.create({
          data: {
            alliance_id: input.allianceId,
            transaction_type: AllianceTransactionType.TAX,
            amount: pay,
            performed_by_user_id: input.userId,
            related_user_id: input.userId,
            notes: 'Dues arrears paid',
          },
        });
        return {
          message: `Paid ${formatGold(pay)} gold of dues`,
          paid: pay,
          arrears: owed - pay,
        };
      }, ALLIANCE_BANK_TX_OPTIONS);
    } catch (error) {
      logError('Error paying alliance dues', { ...input, error });
      throw error;
    }
  }

  /**
   * One alliance's dues for the period containing `now`. Takes the era
   * lifecycle shared lock, the alliance row and then every member row in id
   * order (lockAllianceThenUsers), so concurrent runs serialise on the
   * alliance and the second finds every membership already paid through the
   * period. Each non-leader member owes their arrears plus one period's
   * dues; gold on hand pays what it can and the rest becomes arrears. A
   * missed run charges one period, never a pile of past periods. Members
   * with no dues_paid_through (joined before dues existed, or after an era
   * reset) are only marked paid through the current period.
   */
  static async collectForAlliance(
    allianceId: number,
    now: Date = new Date(),
  ): Promise<AllianceDuesRunResult> {
    const result: AllianceDuesRunResult = {
      allianceId,
      charged: 0,
      collected: 0n,
      arrearsAdded: 0n,
    };
    return prisma.$transaction(
      async (tx) => {
        await lockEraLifecycleShared(tx);
        // Unlocked read only to learn which player rows to lock.
        const roster = await tx.alliance_memberships.findMany({
          where: { alliance_id: allianceId },
          select: { user_id: true },
        });
        const lockedIds = new Set<number>(
          roster.map((row) => Number(row.user_id)),
        );
        await lockAllianceThenUsers(tx, allianceId, [...lockedIds]);

        const alliance = await tx.alliances.findUnique({
          where: { id: allianceId },
          select: {
            id: true,
            leader_id: true,
            status: true,
            dues_amount: true,
            dues_period: true,
          },
        });
        // Reserved alliances collect nothing (#13).
        if (!alliance || !isAllianceActive(alliance)) return result;
        const amount = BigInt(alliance.dues_amount ?? 0n);
        const periodStart = getDuesPeriodStart(alliance.dues_period, now);
        if (!periodStart || amount <= 0n) return result;

        const members = await tx.alliance_memberships.findMany({
          where: {
            alliance_id: allianceId,
            user_id: { not: alliance.leader_id },
            OR: [
              { dues_paid_through: null },
              { dues_paid_through: { lt: periodStart } },
            ],
          },
          select: {
            id: true,
            user_id: true,
            dues_arrears: true,
            dues_paid_through: true,
          },
          orderBy: { user_id: 'asc' },
        });

        for (const member of members) {
          // Joined after the roster read: not locked here, and its join
          // already marked the current period paid.
          if (!lockedIds.has(member.user_id)) continue;
          const markPaid = (arrears?: bigint) =>
            tx.alliance_memberships.updateMany({
              where: {
                id: member.id,
                OR: [
                  { dues_paid_through: null },
                  { dues_paid_through: { lt: periodStart } },
                ],
              },
              data: {
                dues_paid_through: periodStart,
                ...(arrears !== undefined ? { dues_arrears: arrears } : {}),
              },
            });

          if (!member.dues_paid_through) {
            await markPaid();
            continue;
          }

          const owedBefore = BigInt(member.dues_arrears ?? 0n);
          const due = owedBefore + amount;
          const player = await tx.users.findUnique({
            where: { id: member.user_id },
            select: { gold: true },
          });
          const gold = BigInt(player?.gold ?? 0n);
          const pay = gold <= 0n ? 0n : gold < due ? gold : due;

          if (pay > 0n) {
            const debit = await tx.users.updateMany({
              where: { id: member.user_id, gold: { gte: pay } },
              data: { gold: { decrement: pay } },
            });
            if (debit.count !== 1) {
              throw new Error('Dues debit failed on a locked player row');
            }
            await tx.alliances.update({
              where: { id: allianceId },
              data: { gold_in_bank: { increment: pay } },
            });
            await tx.alliance_bank_history.create({
              data: {
                alliance_id: allianceId,
                transaction_type: AllianceTransactionType.TAX,
                amount: pay,
                performed_by_user_id: member.user_id,
                related_user_id: member.user_id,
                notes: `Dues ${periodStart.toISOString().slice(0, 10)}`,
              },
            });
          }
          const arrears = due - pay;
          const marked = await markPaid(arrears);
          if (marked.count === 1) {
            result.charged += 1;
            result.collected += pay;
            if (arrears > owedBefore)
              result.arrearsAdded += arrears - owedBefore;
          }
        }
        return result;
      },
      { timeout: 30_000, maxWait: 5_000 },
    );
  }

  /**
   * The daily job's dues pass: every active alliance with dues, one
   * transaction per alliance. Idempotent per member per period, so a second
   * run on the same day (forced cron, overlapping delivery) charges nobody.
   * One alliance failing is logged and does not stop the others.
   */
  static async collectAll(now: Date = new Date()) {
    const alliances = await prisma.alliances.findMany({
      where: {
        status: 'ACTIVE',
        dues_amount: { gt: 0n },
        dues_period: { not: 'NONE' },
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    let charged = 0;
    let collected = 0n;
    let arrearsAdded = 0n;
    let failed = 0;
    for (const { id } of alliances) {
      try {
        const run = await this.collectForAlliance(id, now);
        charged += run.charged;
        collected += run.collected;
        arrearsAdded += run.arrearsAdded;
      } catch (error) {
        failed += 1;
        logError('Alliance dues collection failed', { allianceId: id, error });
      }
    }
    return {
      alliances: alliances.length,
      charged,
      collected: collected.toString(),
      arrearsAdded: arrearsAdded.toString(),
      failed,
    };
  }
}
