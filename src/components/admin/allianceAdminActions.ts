import { z } from 'zod';

import { toBigIntSafe } from '@/utils/jsonHelpers';

/**
 * Admin alliance detail actions (#229). Shared by the admin API route and the
 * detail drawer so both validate the same shapes; no server-only imports.
 */

const id = z.coerce.number().int().positive();

/** Same limit as the player-side alliance name (UpdateAllianceSchema). */
export const ALLIANCE_NAME_MAX = 100;

export const AllianceAdminActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('transfer_leadership'), newLeaderId: id }),
  z.object({
    action: z.literal('rename'),
    name: z.string().trim().min(1).max(ALLIANCE_NAME_MAX),
  }),
  z.object({ action: z.literal('remove_member'), userId: id }),
  z.object({ action: z.literal('clear_cooldowns'), userId: id }),
  z.object({ action: z.literal('forgive_loan'), loanId: id }),
  z.object({ action: z.literal('cancel_loan'), loanId: id }),
  z.object({ action: z.literal('end_war'), warId: id }),
]);

export type AllianceAdminAction = z.infer<typeof AllianceAdminActionSchema>;
export type AllianceAdminActionName = AllianceAdminAction['action'];

/** Audit action name for each admin alliance action. */
export const ALLIANCE_ADMIN_AUDIT_ACTIONS: Record<
  AllianceAdminActionName,
  string
> = {
  transfer_leadership: 'ADMIN_ALLIANCE_TRANSFER_LEADERSHIP',
  rename: 'ADMIN_ALLIANCE_RENAME',
  remove_member: 'ADMIN_ALLIANCE_REMOVE_MEMBER',
  clear_cooldowns: 'ADMIN_ALLIANCE_CLEAR_COOLDOWNS',
  forgive_loan: 'ADMIN_ALLIANCE_FORGIVE_LOAN',
  cancel_loan: 'ADMIN_ALLIANCE_CANCEL_LOAN',
  end_war: 'ADMIN_ALLIANCE_END_WAR',
};

/** Loan statuses that still carry a balance (AllianceLoan.service OPEN_STATUSES). */
export const OPEN_LOAN_STATUSES = ['ACTIVE', 'DEFAULTED'] as const;

/** Unpaid balance of a loan, never negative. Accepts bigint or string amounts. */
export const loanRemaining = (loan: {
  amount_owed: bigint | string | number;
  amount_repaid: bigint | string | number;
}): bigint => {
  // API amounts arrive as bigint strings with an `n` suffix.
  const left =
    toBigIntSafe(loan.amount_owed) - toBigIntSafe(loan.amount_repaid);
  return left > 0n ? left : 0n;
};

/** Which admin loan action applies to a loan status, if any. */
export const loanAdminAction = (
  status: string,
): 'forgive_loan' | 'cancel_loan' | null => {
  if ((OPEN_LOAN_STATUSES as readonly string[]).includes(status))
    return 'forgive_loan';
  if (status === 'REQUESTED') return 'cancel_loan';
  return null;
};

/** A war can be force-ended unless it already ended. */
export const canForceEndWar = (status: string): boolean => status !== 'ENDED';
