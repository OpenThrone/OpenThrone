import { z } from 'zod';

import {
  ALLIANCE_DUES_MAX,
  ALLIANCE_DUES_PERIODS,
  ALLIANCE_JOIN_FEE_MAX,
} from '@/constants/allianceDues';
import {
  ALLIANCE_LEVEL_MAX,
  ALLIANCE_LEVEL_MIN,
} from '@/constants/allianceLevels';
import { toBigIntSafe } from '@/utils/jsonHelpers';

/**
 * Admin alliance detail actions (#229). Shared by the admin API route and the
 * detail drawer so both validate the same shapes; no server-only imports.
 */

const id = z.coerce.number().int().positive();

/** Whole gold, not coerced: null or '' must not silently become 0. */
const gold = (max: bigint) =>
  z
    .number()
    .int()
    .min(0)
    .max(Number(max))
    .transform((value) => BigInt(value));

const HIGHEST_DUES = Object.values(ALLIANCE_DUES_MAX).reduce((a, b) =>
  a > b ? a : b,
);

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
  // Era lifecycle (#13): staff can reserve an alliance or reactivate it free.
  z.object({ action: z.literal('reserve') }),
  z.object({ action: z.literal('reactivate') }),
  // Alliance Hall level (allianceLevels.ts): staff set it directly, free.
  z.object({
    action: z.literal('set_hall_level'),
    // Not coerced: null or '' must not silently become level 0.
    level: z.number().int().min(ALLIANCE_LEVEL_MIN).max(ALLIANCE_LEVEL_MAX),
    /** The level the admin saw; a different current level refuses (stale). */
    fromLevel: z
      .number()
      .int()
      .min(ALLIANCE_LEVEL_MIN)
      .max(ALLIANCE_LEVEL_MAX)
      .optional(),
  }),
  // Join fee and membership dues (allianceDues.ts), same bounds as players.
  // The per-period maximum and the amount/period pairing are checked by
  // validateAllianceDuesSettings in the route (a discriminated union member
  // cannot carry a refinement).
  z.object({
    action: z.literal('set_dues'),
    joinFee: gold(ALLIANCE_JOIN_FEE_MAX),
    duesAmount: gold(HIGHEST_DUES),
    duesPeriod: z.enum(ALLIANCE_DUES_PERIODS),
    /** The fee and dues the admin saw; changed values refuse (stale edit). */
    expected: z
      .object({
        joinFee: gold(ALLIANCE_JOIN_FEE_MAX),
        duesAmount: gold(HIGHEST_DUES),
        duesPeriod: z.enum(ALLIANCE_DUES_PERIODS),
      })
      .optional(),
  }),
]);

export type AllianceAdminAction = z.infer<typeof AllianceAdminActionSchema>;
/** What the drawer sends (gold amounts as JSON numbers, before transforms). */
export type AllianceAdminActionInput = z.input<
  typeof AllianceAdminActionSchema
>;
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
  reserve: 'ADMIN_ALLIANCE_RESERVE',
  reactivate: 'ADMIN_ALLIANCE_REACTIVATE',
  set_hall_level: 'ADMIN_ALLIANCE_SET_HALL_LEVEL',
  set_dues: 'ADMIN_ALLIANCE_SET_DUES',
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
