import { z } from 'zod';

import { hasAlliancePermission } from '@/constants/alliancePermissions';
import {
  ALLIANCE_NOTE_MAX_LENGTH,
  computeLoanOwed,
  LOAN_INCOME_SHARE_PERCENT,
  LOAN_INTEREST_PCT_DEFAULT,
  LOAN_INTEREST_PCT_MAX,
  LOAN_INTEREST_PCT_MIN,
  LOAN_TERM_DAYS_DEFAULT,
  LOAN_TERM_DAYS_MAX,
  LOAN_TERM_DAYS_MIN,
  MEMBER_DAILY_CAP_DEFAULT,
  MEMBER_DAILY_CAP_MAX,
  MEMBER_DAILY_CAP_MIN,
} from '@/constants/allianceTreasury';
import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import {
  AllianceLoanStatus,
  AllianceTransactionType,
} from '@/lib/prisma-exports';
import {
  ALLIANCE_BANK_TX_OPTIONS,
  getReceivedToday,
  lockAllianceThenUsers,
  transferInTx,
} from '@/services/AllianceBank.service';
import { postToAllianceRoom } from '@/services/AllianceRoom.service';
import { logError } from '@/utils/logger';

const OPEN_STATUSES = [AllianceLoanStatus.ACTIVE, AllianceLoanStatus.DEFAULTED];
const DAY_MS = 24 * 60 * 60 * 1000;

const idSchema = z.number().int().positive();

const RequestSchema = z.object({
  allianceId: idSchema,
  userId: idSchema,
  amount: z.coerce.bigint().min(BigInt(1)),
  reason: z.string().trim().max(ALLIANCE_NOTE_MAX_LENGTH).optional(),
});

const DecideSchema = z.object({
  allianceId: idSchema,
  loanId: idSchema,
  actorId: idSchema,
  decision: z.enum(['approve', 'decline']),
});

const CancelSchema = z.object({
  allianceId: idSchema,
  loanId: idSchema,
  userId: idSchema,
});

const RepaySchema = z.object({
  allianceId: idSchema,
  userId: idSchema,
  amount: z.coerce.bigint().min(BigInt(1)),
});

export const TreasurySettingsSchema = z
  .object({
    loan_term_days: z
      .number()
      .int()
      .min(LOAN_TERM_DAYS_MIN)
      .max(LOAN_TERM_DAYS_MAX)
      .optional(),
    loan_interest_pct: z
      .number()
      .int()
      .min(LOAN_INTEREST_PCT_MIN)
      .max(LOAN_INTEREST_PCT_MAX)
      .optional(),
    member_daily_cap: z.coerce
      .bigint()
      .min(BigInt(MEMBER_DAILY_CAP_MIN))
      .max(BigInt(MEMBER_DAILY_CAP_MAX))
      .optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Nothing to update',
  });

type LoanRow = {
  id: number;
  alliance_id: number;
  borrower_id: number;
  amount_owed: bigint;
  amount_repaid: bigint;
  status: AllianceLoanStatus;
};

const remainingOf = (loan: Pick<LoanRow, 'amount_owed' | 'amount_repaid'>) => {
  const left = BigInt(loan.amount_owed) - BigInt(loan.amount_repaid);
  return left > 0n ? left : 0n;
};

/**
 * Applies a repayment to one open loan inside a transaction: guarded loan
 * update (never past the owed amount), treasury credit and a history row. The
 * caller must hold the borrower's user lock, which serializes every loan
 * mutation for that borrower, and must have already taken `amount` from them.
 */
const applyRepayment = async (
  tx: Prisma.TransactionClient,
  loan: LoanRow,
  amount: bigint,
  performedBy: number,
  note: string,
  // Income paths hold only the borrower's lock; taking the alliance row there
  // would invert the alliance-then-user order used everywhere else. They park
  // the credit on the loan and settleLoanTreasuryCredits moves it later.
  deferTreasury = false,
): Promise<void> => {
  const remaining = remainingOf(loan);
  if (amount <= 0n || amount > remaining) {
    throw new Error('Invalid loan repayment amount');
  }
  const repaid = BigInt(loan.amount_repaid) + amount;
  const done = repaid >= BigInt(loan.amount_owed);
  const updated = await tx.alliance_loans.updateMany({
    where: {
      id: loan.id,
      status: { in: OPEN_STATUSES },
      amount_repaid: BigInt(loan.amount_repaid),
    },
    data: {
      amount_repaid: repaid,
      ...(deferTreasury
        ? { pending_treasury_credit: { increment: amount } }
        : {}),
      ...(done
        ? { status: AllianceLoanStatus.REPAID, closed_at: new Date() }
        : {}),
    },
  });
  if (updated.count !== 1) {
    throw new Error('Loan changed, please try again');
  }
  if (deferTreasury) return;
  await tx.alliances.updateMany({
    where: { id: loan.alliance_id },
    data: { gold_in_bank: { increment: amount } },
  });
  await tx.alliance_bank_history.create({
    data: {
      alliance_id: loan.alliance_id,
      transaction_type: AllianceTransactionType.LOAN_REPAYMENT,
      amount,
      performed_by_user_id: performedBy,
      related_user_id: loan.borrower_id,
      notes: note,
    },
  });
};

/**
 * Takes up to `limit` from a borrower's gold on hand, then their personal
 * bank, and applies it to the loan. The caller holds the borrower's lock.
 * Returns the amount collected.
 */
const collectFromBorrower = async (
  tx: Prisma.TransactionClient,
  loan: LoanRow,
  limit: bigint,
  note: string,
): Promise<bigint> => {
  const want = remainingOf(loan) < limit ? remainingOf(loan) : limit;
  if (want <= 0n) return 0n;
  const user = await tx.users.findUnique({
    where: { id: loan.borrower_id },
    select: { gold: true, gold_in_bank: true },
  });
  if (!user) return 0n;
  const gold = BigInt(user.gold ?? 0);
  const bank = BigInt(user.gold_in_bank ?? 0);
  const fromHand = want < gold ? want : gold;
  const rest = want - fromHand;
  const fromBank = rest < bank ? rest : bank;
  const total = fromHand + fromBank;
  if (total <= 0n) return 0n;
  const debit = await tx.users.updateMany({
    where: {
      id: loan.borrower_id,
      gold: { gte: fromHand },
      gold_in_bank: { gte: fromBank },
    },
    data: {
      gold: { decrement: fromHand },
      gold_in_bank: { decrement: fromBank },
    },
  });
  if (debit.count !== 1) {
    throw new Error('Borrower balance changed, please try again');
  }
  await applyRepayment(tx, loan, total, loan.borrower_id, note);
  return total;
};

/**
 * Diverts the loan share of fresh income (turn economy, battle pillage) to
 * the lending treasuries. Call inside the transaction that credits the gold,
 * after locking the borrower's user row, then credit only `gross - diverted`.
 * Never takes more than the remaining balance. Returns the amount diverted.
 */
export const divertIncomeToLoans = async (
  tx: Prisma.TransactionClient,
  userId: number,
  gross: bigint,
  source: 'economy' | 'pillage',
): Promise<bigint> => {
  if (gross <= 0n || !tx.alliance_loans) return 0n;
  let budget = (gross * BigInt(LOAN_INCOME_SHARE_PERCENT)) / 100n;
  if (budget <= 0n) return 0n;
  const loans = await tx.alliance_loans.findMany({
    where: { borrower_id: userId, status: { in: OPEN_STATUSES } },
    orderBy: { id: 'asc' },
  });
  let diverted = 0n;
  for (const loan of loans) {
    const remaining = remainingOf(loan);
    const pay = budget < remaining ? budget : remaining;
    if (pay <= 0n) continue;
    await applyRepayment(
      tx,
      loan,
      pay,
      userId,
      `Loan repayment (${LOAN_INCOME_SHARE_PERCENT}% of ${source} income)`,
      true,
    );
    budget -= pay;
    diverted += pay;
  }
  return diverted;
};

/** Throws when the user has a DEFAULTED treasury loan. */
export const assertNoDefaultedLoan = async (
  tx: Prisma.TransactionClient,
  userId: number,
  message: string,
): Promise<void> => {
  if (!tx.alliance_loans) return;
  const count = await tx.alliance_loans.count({
    where: { borrower_id: userId, status: AllianceLoanStatus.DEFAULTED },
  });
  if (count > 0) {
    throw new Error(message);
  }
};

/**
 * Loan handling when a member leaves or is kicked. Call inside the locked
 * leave/kick transaction (alliance row already locked). Pending requests are
 * cancelled; unpaid balances are collected from gold on hand then bank. When
 * that is not enough a voluntary leave throws (rolling everything back) and a
 * kick writes the remainder off.
 */
export const settleLoansOnExit = async (
  tx: Prisma.TransactionClient,
  allianceId: number,
  userId: number,
  mode: 'leave' | 'kick',
): Promise<void> => {
  if (!tx.alliance_loans) return;
  await tx.alliance_loans.updateMany({
    where: {
      alliance_id: allianceId,
      borrower_id: userId,
      status: AllianceLoanStatus.REQUESTED,
    },
    data: { status: AllianceLoanStatus.CANCELLED, closed_at: new Date() },
  });
  const open = await tx.alliance_loans.findMany({
    where: {
      alliance_id: allianceId,
      borrower_id: userId,
      status: { in: OPEN_STATUSES },
    },
    orderBy: { id: 'asc' },
  });
  if (open.length === 0) return;
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
  for (const loan of open) {
    const noteVerb = mode === 'leave' ? 'leaving' : 'removal';
    let current: LoanRow = loan;
    const collected = await collectFromBorrower(
      tx,
      current,
      remainingOf(current),
      `Loan collected on ${noteVerb}`,
    );
    current = {
      ...current,
      amount_repaid: BigInt(current.amount_repaid) + collected,
    };
    if (remainingOf(current) === 0n) continue;
    if (mode === 'leave') {
      throw new Error('Repay your loan before leaving');
    }
    await tx.alliance_loans.updateMany({
      where: { id: loan.id, status: { in: OPEN_STATUSES } },
      data: {
        status: AllianceLoanStatus.WRITTEN_OFF,
        closed_at: new Date(),
      },
    });
  }
};

/** Writes off every open or pending loan of an alliance (disband). */
export const writeOffAllianceLoans = async (
  tx: Prisma.TransactionClient,
  allianceId: number,
): Promise<void> => {
  if (!tx.alliance_loans) return;
  const now = new Date();
  await tx.alliance_loans.updateMany({
    where: { alliance_id: allianceId, status: { in: OPEN_STATUSES } },
    data: { status: AllianceLoanStatus.WRITTEN_OFF, closed_at: now },
  });
  await tx.alliance_loans.updateMany({
    where: { alliance_id: allianceId, status: AllianceLoanStatus.REQUESTED },
    data: { status: AllianceLoanStatus.CANCELLED, closed_at: now },
  });
};

/**
 * Splits the treasury evenly over every member's gold on hand (integer
 * division, remainder to the leader) and records the history. Call inside the
 * locked disband transaction. Returns the amount distributed.
 */
export const distributeTreasuryOnDisband = async (
  tx: Prisma.TransactionClient,
  allianceId: number,
  leaderId: number,
  treasury: bigint,
): Promise<bigint> => {
  if (treasury <= 0n) return 0n;
  const rows = await tx.alliance_memberships.findMany({
    where: { alliance_id: allianceId },
    select: { user_id: true },
  });
  const recipients = [...new Set([leaderId, ...rows.map((r) => r.user_id)])];
  for (const id of [...recipients].sort((a, b) => a - b)) {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${id} FOR UPDATE`;
  }
  const count = BigInt(recipients.length);
  const share = treasury / count;
  const remainder = treasury - share * count;
  for (const id of recipients) {
    const amount = id === leaderId ? share + remainder : share;
    if (amount <= 0n) continue;
    const credit = await tx.users.updateMany({
      where: { id },
      data: { gold: { increment: amount } },
    });
    if (credit.count !== 1) {
      throw new Error('Member not found while distributing the treasury');
    }
    await tx.alliance_bank_history.create({
      data: {
        alliance_id: allianceId,
        transaction_type: AllianceTransactionType.WITHDRAWAL,
        amount,
        performed_by_user_id: leaderId,
        related_user_id: id,
        notes: 'Alliance disbanded: treasury split among members',
      },
    });
  }
  await tx.alliances.updateMany({
    where: { id: allianceId },
    data: { gold_in_bank: 0n },
  });
  return treasury;
};

/** Alliance treasury loans (#66 phase 3). */
export class AllianceLoanService {
  private static async getStanding(
    tx: Prisma.TransactionClient | typeof prisma,
    allianceId: number,
    userId: number,
  ) {
    const alliance = await tx.alliances.findUnique({
      where: { id: allianceId },
    });
    if (!alliance) {
      throw new Error('Alliance not found');
    }
    const membership = await tx.alliance_memberships.findUnique({
      where: {
        unique_alliance_user: { alliance_id: allianceId, user_id: userId },
      },
      include: { role: true },
    });
    if (!membership) {
      throw new Error('You are not a member of this alliance');
    }
    const can = (
      key: 'manage_bank' | 'request_gold' | 'approve_own_requests',
    ) =>
      hasAlliancePermission(alliance.leader_id, userId, membership.role, key);
    return {
      alliance,
      canManageBank: can('manage_bank'),
      canRequest: can('request_gold'),
      // Bank managers need this extra key to approve their own loan requests.
      canApproveOwn: can('approve_own_requests'),
    };
  }

  private static terms(alliance: {
    loan_term_days?: number | null;
    loan_interest_pct?: number | null;
    member_daily_cap?: bigint | null;
  }) {
    return {
      termDays: alliance.loan_term_days ?? LOAN_TERM_DAYS_DEFAULT,
      interestPct: alliance.loan_interest_pct ?? LOAN_INTEREST_PCT_DEFAULT,
      dailyCap: BigInt(alliance.member_daily_cap ?? MEMBER_DAILY_CAP_DEFAULT),
    };
  }

  /** Leader-only update of loan term, interest and the member daily cap. */
  static async updateTreasurySettings(
    allianceId: number,
    actorId: number,
    data: z.input<typeof TreasurySettingsSchema>,
  ) {
    const v = TreasurySettingsSchema.parse(data);
    try {
      const alliance = await prisma.alliances.findFirst({
        where: { id: allianceId, leader_id: actorId },
        select: { id: true },
      });
      if (!alliance) {
        throw new Error('Alliance not found or you are not the leader');
      }
      const updated = await prisma.alliances.update({
        where: { id: allianceId },
        data: v,
        select: {
          loan_term_days: true,
          loan_interest_pct: true,
          member_daily_cap: true,
        },
      });
      return updated;
    } catch (error: any) {
      logError('Error updating alliance treasury settings', {
        allianceId,
        actorId,
        error,
      });
      throw error;
    }
  }

  /** Files a loan request. Needs request_gold; one open loan per member. */
  static async request(data: {
    allianceId: number;
    userId: number;
    amount: bigint;
    reason?: string;
  }) {
    const v = RequestSchema.parse(data);
    try {
      return await prisma.$transaction(async (tx) => {
        await lockAllianceThenUsers(tx, v.allianceId, [v.userId]);
        const standing = await this.getStanding(tx, v.allianceId, v.userId);
        if (!standing.canRequest) {
          throw new Error('You do not have permission to request gold');
        }
        const terms = this.terms(standing.alliance);
        if (v.amount > terms.dailyCap) {
          throw new Error(
            `Loans are limited to ${terms.dailyCap.toString()} gold in this alliance`,
          );
        }
        await assertNoDefaultedLoan(
          tx,
          v.userId,
          'Repay your defaulted loan before borrowing again',
        );
        const existing = await tx.alliance_loans.count({
          where: {
            alliance_id: v.allianceId,
            borrower_id: v.userId,
            status: {
              in: [...OPEN_STATUSES, AllianceLoanStatus.REQUESTED],
            },
          },
        });
        if (existing > 0) {
          throw new Error('You already have an open loan or loan request');
        }
        return await tx.alliance_loans.create({
          data: {
            alliance_id: v.allianceId,
            borrower_id: v.userId,
            principal: v.amount,
            interest_pct: terms.interestPct,
            amount_owed: computeLoanOwed(v.amount, terms.interestPct),
            reason: v.reason || null,
          },
        });
      }, ALLIANCE_BANK_TX_OPTIONS);
    } catch (error: any) {
      logError('Error requesting alliance loan', { ...v, error });
      throw error;
    }
  }

  /**
   * Loans visible to the caller. Managers (leader or manage_bank) see every
   * open or pending loan plus recent history; members see their own.
   */
  static async list(allianceId: number, userId: number) {
    const standing = await this.getStanding(prisma, allianceId, userId);
    const terms = this.terms(standing.alliance);
    const include = {
      borrower: { select: { id: true, display_name: true } },
      decider: { select: { display_name: true } },
    };
    const receivedToday = await getReceivedToday(
      prisma as unknown as Prisma.TransactionClient,
      allianceId,
      userId,
    );
    const remainingCap =
      terms.dailyCap > receivedToday ? terms.dailyCap - receivedToday : 0n;
    const base = {
      terms,
      remainingCap,
      canManage: standing.canManageBank,
      canRequest: standing.canRequest,
      canApproveOwn: standing.canManageBank && standing.canApproveOwn,
    };
    if (standing.canManageBank) {
      const [live, history] = await Promise.all([
        prisma.alliance_loans.findMany({
          where: {
            alliance_id: allianceId,
            status: {
              in: [AllianceLoanStatus.REQUESTED, ...OPEN_STATUSES],
            },
          },
          orderBy: { created_at: 'asc' },
          include,
        }),
        prisma.alliance_loans.findMany({
          where: {
            alliance_id: allianceId,
            status: {
              notIn: [AllianceLoanStatus.REQUESTED, ...OPEN_STATUSES],
            },
          },
          orderBy: { created_at: 'desc' },
          take: 25,
          include,
        }),
      ]);
      return { ...base, loans: [...live, ...history] };
    }
    const loans = await prisma.alliance_loans.findMany({
      where: { alliance_id: allianceId, borrower_id: userId },
      orderBy: { created_at: 'desc' },
      take: 25,
      include,
    });
    return { ...base, loans };
  }

  /**
   * Approves or declines a REQUESTED loan (leader or manage_bank). Approval
   * snapshots the alliance's current term and interest, disburses through the
   * same locked transfer as any treasury payout (so the daily cap and balance
   * checks apply) and flips the status once.
   */
  static async decide(data: {
    allianceId: number;
    loanId: number;
    actorId: number;
    decision: 'approve' | 'decline';
  }) {
    const v = DecideSchema.parse(data);
    try {
      return await prisma.$transaction(async (tx) => {
        const peek = await tx.alliance_loans.findFirst({
          where: { id: v.loanId, alliance_id: v.allianceId },
          select: { borrower_id: true },
        });
        if (!peek) {
          throw new Error('Loan request not found');
        }
        await lockAllianceThenUsers(tx, v.allianceId, [peek.borrower_id]);

        const standing = await this.getStanding(tx, v.allianceId, v.actorId);
        if (!standing.canManageBank) {
          throw new Error('You do not have permission to manage the bank');
        }
        const loan = await tx.alliance_loans.findFirst({
          where: { id: v.loanId, alliance_id: v.allianceId },
        });
        if (!loan) {
          throw new Error('Loan request not found');
        }
        if (loan.status !== AllianceLoanStatus.REQUESTED) {
          throw new Error('This loan request has already been decided');
        }

        const now = new Date();
        if (v.decision === 'decline') {
          const flipped = await tx.alliance_loans.updateMany({
            where: { id: loan.id, status: AllianceLoanStatus.REQUESTED },
            data: {
              status: AllianceLoanStatus.DECLINED,
              decided_by: v.actorId,
              closed_at: now,
            },
          });
          if (flipped.count !== 1) {
            throw new Error('This loan request has already been decided');
          }
          return { message: 'Loan declined', status: 'DECLINED' as const };
        }

        if (loan.borrower_id === v.actorId && !standing.canApproveOwn) {
          throw new Error(
            'You do not have permission to approve your own requests',
          );
        }

        await assertNoDefaultedLoan(
          tx,
          loan.borrower_id,
          'The borrower has a defaulted loan',
        );
        const open = await tx.alliance_loans.count({
          where: {
            alliance_id: v.allianceId,
            borrower_id: loan.borrower_id,
            status: { in: OPEN_STATUSES },
          },
        });
        if (open > 0) {
          throw new Error('The borrower already has an active loan');
        }

        const terms = this.terms(standing.alliance);
        const flipped = await tx.alliance_loans.updateMany({
          where: { id: loan.id, status: AllianceLoanStatus.REQUESTED },
          data: {
            status: AllianceLoanStatus.ACTIVE,
            decided_by: v.actorId,
            approved_at: now,
            due_at: new Date(now.getTime() + terms.termDays * DAY_MS),
            // The borrower was quoted the interest when they asked; a later
            // change to the alliance's rate does not apply to this loan.
            interest_pct: loan.interest_pct,
            amount_owed: BigInt(loan.amount_owed),
          },
        });
        if (flipped.count !== 1) {
          throw new Error('This loan request has already been decided');
        }
        await transferInTx(tx, {
          allianceId: v.allianceId,
          actorId: v.actorId,
          targetUserId: loan.borrower_id,
          amount: BigInt(loan.principal),
          notes: `Loan #${loan.id}`,
          transactionType: AllianceTransactionType.LOAN,
        });
        return { message: 'Loan approved', status: 'ACTIVE' as const };
      }, ALLIANCE_BANK_TX_OPTIONS);
    } catch (error: any) {
      logError('Error deciding alliance loan', { ...v, error });
      throw error;
    }
  }

  /** Cancels the caller's own REQUESTED loan. */
  static async cancel(data: {
    allianceId: number;
    loanId: number;
    userId: number;
  }) {
    const v = CancelSchema.parse(data);
    try {
      const result = await prisma.alliance_loans.updateMany({
        where: {
          id: v.loanId,
          alliance_id: v.allianceId,
          borrower_id: v.userId,
          status: AllianceLoanStatus.REQUESTED,
        },
        data: {
          status: AllianceLoanStatus.CANCELLED,
          closed_at: new Date(),
        },
      });
      if (result.count !== 1) {
        throw new Error('No pending loan request to cancel');
      }
      return { message: 'Loan request cancelled' };
    } catch (error: any) {
      logError('Error cancelling alliance loan', { ...v, error });
      throw error;
    }
  }

  /** Manual repayment from gold on hand; capped at the remaining balance. */
  static async repay(data: {
    allianceId: number;
    userId: number;
    amount: bigint;
  }) {
    const v = RepaySchema.parse(data);
    try {
      return await prisma.$transaction(async (tx) => {
        await lockAllianceThenUsers(tx, v.allianceId, [v.userId]);
        const loan = await tx.alliance_loans.findFirst({
          where: {
            alliance_id: v.allianceId,
            borrower_id: v.userId,
            status: { in: OPEN_STATUSES },
          },
          orderBy: { id: 'asc' },
        });
        if (!loan) {
          throw new Error('You have no loan to repay');
        }
        const remaining = remainingOf(loan);
        const amount = v.amount < remaining ? v.amount : remaining;
        const debit = await tx.users.updateMany({
          where: { id: v.userId, gold: { gte: amount } },
          data: { gold: { decrement: amount } },
        });
        if (debit.count !== 1) {
          throw new Error('Insufficient gold');
        }
        await applyRepayment(tx, loan, amount, v.userId, 'Loan repayment');
        return {
          message: amount === remaining ? 'Loan repaid' : 'Repayment received',
          paid: amount,
          remaining: remaining - amount,
        };
      }, ALLIANCE_BANK_TX_OPTIONS);
    } catch (error: any) {
      logError('Error repaying alliance loan', { ...v, error });
      throw error;
    }
  }

  /**
   * Daily cron: for each loan past its due date, seize what is owed from the
   * borrower's gold on hand then personal bank. Anything still unpaid marks
   * the loan DEFAULTED (once, notifying the officers); DEFAULTED loans keep
   * being collected each day until paid.
   */
  static async processOverdueLoans(now: Date = new Date()) {
    const overdue = await prisma.alliance_loans.findMany({
      where: { status: { in: OPEN_STATUSES }, due_at: { lt: now } },
      select: { id: true, alliance_id: true, borrower_id: true },
    });
    let collected = 0;
    let defaulted = 0;
    for (const item of overdue) {
      try {
        const outcome = await prisma.$transaction(async (tx) => {
          await lockAllianceThenUsers(tx, item.alliance_id, [item.borrower_id]);
          const loan = await tx.alliance_loans.findFirst({
            where: {
              id: item.id,
              status: { in: OPEN_STATUSES },
              due_at: { lt: now },
            },
          });
          if (!loan) return 'skipped' as const;
          const got = await collectFromBorrower(
            tx,
            loan,
            remainingOf(loan),
            'Overdue loan seized',
          );
          const left = remainingOf({
            amount_owed: loan.amount_owed,
            amount_repaid: BigInt(loan.amount_repaid) + got,
          });
          if (left === 0n) return 'repaid' as const;
          if (loan.status === AllianceLoanStatus.ACTIVE) {
            await tx.alliance_loans.updateMany({
              where: { id: loan.id, status: AllianceLoanStatus.ACTIVE },
              data: { status: AllianceLoanStatus.DEFAULTED },
            });
            await this.notifyOfficers(tx, loan, left);
            return 'defaulted' as const;
          }
          return 'still_defaulted' as const;
        }, ALLIANCE_BANK_TX_OPTIONS);
        if (outcome === 'repaid') collected++;
        if (outcome === 'defaulted') defaulted++;
      } catch (error) {
        logError('Error processing overdue alliance loan', {
          loanId: item.id,
          error,
        });
      }
    }
    return { checked: overdue.length, collected, defaulted };
  }

  /** Inbox message to the leader and every manage_bank member. */
  private static async notifyOfficers(
    tx: Prisma.TransactionClient,
    loan: LoanRow,
    outstanding: bigint,
  ) {
    const [alliance, borrower, members] = await Promise.all([
      tx.alliances.findUnique({
        where: { id: loan.alliance_id },
        select: { id: true, name: true, leader_id: true },
      }),
      tx.users.findUnique({
        where: { id: loan.borrower_id },
        select: { display_name: true },
      }),
      tx.alliance_memberships.findMany({
        where: { alliance_id: loan.alliance_id },
        include: { role: true },
      }),
    ]);
    if (!alliance) return;
    const recipients = new Set<number>([alliance.leader_id]);
    for (const m of members) {
      if (
        hasAlliancePermission(
          alliance.leader_id,
          m.user_id,
          m.role,
          'manage_bank',
        )
      ) {
        recipients.add(m.user_id);
      }
    }
    recipients.delete(loan.borrower_id);
    if (recipients.size === 0) return;
    const name = borrower?.display_name ?? `#${loan.borrower_id}`;
    // Posted to the alliance's conversation in /messaging, where the
    // treasury managers (and the rest of the alliance) will see it.
    await postToAllianceRoom(
      tx,
      alliance,
      loan.borrower_id,
      `[${alliance.name}] Loan defaulted: ${name}\n\n${name} defaulted on a treasury loan. ${outstanding.toString()} gold is still outstanding after seizing their gold on hand and bank. Their income keeps repaying it until it is cleared.`,
    );
  }
}

/**
 * Moves one alliance's parked loan repayments into its treasury. The caller
 * must already hold the alliance row lock.
 */
export const settleLoanCreditsInTx = async (
  tx: Prisma.TransactionClient,
  allianceId: number,
): Promise<void> => {
  const loans = await tx.$queryRaw<
    {
      id: number;
      borrower_id: number;
      pending_treasury_credit: bigint;
    }[]
  >`SELECT id, borrower_id, pending_treasury_credit FROM alliance_loans
      WHERE alliance_id = ${allianceId} AND pending_treasury_credit > 0
      ORDER BY id FOR UPDATE`;
  for (const loan of loans) {
    const amount = BigInt(loan.pending_treasury_credit);
    if (amount <= 0n) continue;
    await tx.alliance_loans.update({
      where: { id: loan.id },
      data: { pending_treasury_credit: 0n },
    });
    await tx.alliances.updateMany({
      where: { id: allianceId },
      data: { gold_in_bank: { increment: amount } },
    });
    await tx.alliance_bank_history.create({
      data: {
        alliance_id: allianceId,
        transaction_type: AllianceTransactionType.LOAN_REPAYMENT,
        amount,
        performed_by_user_id: loan.borrower_id,
        related_user_id: loan.borrower_id,
        notes: `Loan repayment (${LOAN_INCOME_SHARE_PERCENT}% of income)`,
      },
    });
  }
};

/**
 * Moves repayments parked on loans by divertIncomeToLoans into their
 * alliances' treasuries. Locks the alliance first, then its loan rows, so it
 * follows the same order as every other treasury path. Safe to call any time;
 * the turn cron and attacks call it after their transaction commits, and the
 * daily cleanup sweeps anything left over.
 */
export const settleLoanTreasuryCredits = async (
  allianceIds?: number[],
): Promise<void> => {
  // Runs after the caller's transaction committed: never throw from here.
  if (!prisma.alliance_loans) return;
  let pending: { alliance_id: number }[];
  try {
    pending = await prisma.alliance_loans.findMany({
      where: {
        pending_treasury_credit: { gt: 0n },
        ...(allianceIds ? { alliance_id: { in: allianceIds } } : {}),
      },
      select: { alliance_id: true },
      distinct: ['alliance_id'],
    });
  } catch (error) {
    logError('Failed to read pending alliance loan repayments', { error });
    return;
  }
  for (const { alliance_id: allianceId } of pending) {
    try {
      await prisma.$transaction(async (tx) => {
        await lockAllianceThenUsers(tx, allianceId, []);
        await settleLoanCreditsInTx(tx, allianceId);
      });
    } catch (error) {
      logError('Failed to settle alliance loan repayments', {
        allianceId,
        error,
      });
    }
  }
};
