import type { Prisma } from '@/lib/prisma-exports';
import { AllianceLoanStatus, WarStatus } from '@/lib/prisma-exports';

/**
 * Alliance era lifecycle (#13).
 *
 * An ordinary era rollover moves every alliance from ACTIVE to RESERVED:
 * identity, name, artwork, leader, roster and role definitions are preserved,
 * while every game feature (treasury, loans, forces, wars, recruiting,
 * diplomacy, lists, intel, announcements, internal battles, premium marks) is
 * gated on ACTIVE until the leader reactivates the alliance for the new era.
 * Alliances are deleted only by the explicit admin factory restore, never by
 * an ordinary rollover.
 */

type Tx = Prisma.TransactionClient;

/**
 * Thrown when a feature is used against a RESERVED alliance. Business
 * refusal: the message is safe to show players (see publicErrorMessage).
 */
export class AllianceReservedError extends Error {
  /** Stable code for API clients, which translate it. */
  readonly code = 'ALLIANCE_RESERVED';

  constructor() {
    super(
      'This alliance is reserved for the new era. Its features reopen once the leader reactivates it.',
    );
    this.name = 'AllianceReservedError';
  }
}

/** Legacy rows before the status column existed were ACTIVE; treat missing as ACTIVE. */
export const isAllianceActive = (
  alliance: { status?: string | null } | null | undefined,
): boolean => (alliance?.status ?? 'ACTIVE') === 'ACTIVE';

/**
 * Throws AllianceReservedError unless the alliance is ACTIVE. Every alliance
 * feature calls this server-side; hiding buttons is never the only gate.
 */
export const assertAllianceActive = (
  alliance: { status?: string | null } | null | undefined,
): void => {
  if (!isAllianceActive(alliance)) throw new AllianceReservedError();
};

/** Loads the alliance status and refuses a RESERVED (or missing) alliance. */
export const assertAllianceIdActive = async (
  client: Pick<Tx, 'alliances'>,
  allianceId: number,
): Promise<void> => {
  const alliance = await client.alliances.findUnique({
    where: { id: allianceId },
    select: { status: true },
  });
  if (!alliance) throw new Error('Alliance not found');
  assertAllianceActive(alliance);
};

export interface AllianceEraBoundaryResult {
  /** Alliances moved ACTIVE -> RESERVED (idempotent: already-reserved ones are not counted again). */
  reserved: number;
  /** Open treasury loans written off (member debt of the old era). */
  loansWrittenOff: number;
  /** Pending loan requests cancelled. */
  loanRequestsCancelled: number;
  /** Pending gold requests cancelled. */
  goldRequestsCancelled: number;
  /** Pending join requests and invitations cancelled. */
  joinRequestsCancelled: number;
  /** Wars in WARMUP/ACTIVE/COOLDOWN ended (the rows stay as old-era history). */
  warsEnded: number;
}

/**
 * The era-boundary half of a rollover, shared by the ordinary rollover
 * (Era.service.startNewEra) and the ordinary current-era reset. Runs inside
 * the caller's era lifecycle transaction after every player was reset:
 *
 * - every ACTIVE alliance becomes RESERVED (identity, roster, roles, artwork
 *   and history are untouched);
 * - the treasury is zeroed: it belongs to the old era, exactly like player
 *   gold, which the same rollover resets to the era start value;
 * - open loans are written off and pending loan/gold requests cancelled (a
 *   fresh era starts with no old-era debt, matching how the reset wipes
 *   player gold so nothing could be collected anyway);
 * - wars in progress are ended and kept as history;
 * - pending join requests and invitations are cancelled (recruiting is
 *   reserved-state gated);
 * - alliance XP and upgrades are cleared and the Alliance Hall returns to
 *   level 0 (Camp): they are era progression, the same baseline the
 *   current-era reset already applies;
 * - membership dues arrears are cleared (fee and dues settings are kept).
 *
 * Per-player era state (deployed forces, force obligations, reserves) is
 * reset by resetUserRelations and the forceReserve/forceDuesRule passes of
 * the callers, not here.
 */
export const reserveAlliancesForEraBoundary = async (
  tx: Tx,
  eraId: number,
): Promise<AllianceEraBoundaryResult> => {
  const now = new Date();
  const reserved = await tx.alliances.updateMany({
    where: { status: 'ACTIVE' },
    data: {
      status: 'RESERVED',
      status_changed_at: now,
      status_era_id: eraId,
    },
  });
  // Old-era treasury is discarded, not paid out: the same boundary resets
  // every member's gold, so a payout would mint new-era gold from nothing.
  // The Alliance Hall level was bought with that treasury, so it is era
  // progression too and returns to Camp (alliances above the Camp member cap
  // keep their members but cannot add more until they upgrade again).
  await tx.alliances.updateMany({ data: { gold_in_bank: 0n, hall_level: 0 } });
  // Unpaid membership dues are old-era debt, like the treasury they were owed
  // to. The fee and dues settings stay; the first dues of the new era fall
  // at the first boundary after the alliance is reactivated.
  await tx.alliance_memberships.updateMany({
    data: { dues_arrears: 0n, dues_paid_through: null },
  });

  // Repayments parked on ANY loan (even repaid ones) are old-era treasury
  // gold: settleLoanTreasuryCredits would otherwise credit them back later.
  await tx.alliance_loans.updateMany({
    where: { pending_treasury_credit: { gt: 0n } },
    data: { pending_treasury_credit: 0n },
  });
  const loansWrittenOff = await tx.alliance_loans.updateMany({
    where: {
      status: { in: [AllianceLoanStatus.ACTIVE, AllianceLoanStatus.DEFAULTED] },
    },
    data: { status: AllianceLoanStatus.WRITTEN_OFF, closed_at: now },
  });
  const loanRequestsCancelled = await tx.alliance_loans.updateMany({
    where: { status: AllianceLoanStatus.REQUESTED },
    data: { status: AllianceLoanStatus.CANCELLED, closed_at: now },
  });
  const goldRequestsCancelled = await tx.alliance_gold_requests.updateMany({
    where: { status: 'PENDING' },
    data: { status: 'CANCELLED', decided_at: now },
  });
  const joinRequestsCancelled = await tx.alliance_join_requests.updateMany({
    where: { status: 'PENDING' },
    data: { status: 'CANCELLED', updated_at: now },
  });
  const warsEnded = await tx.alliance_wars.updateMany({
    where: {
      status: { in: [WarStatus.WARMUP, WarStatus.ACTIVE, WarStatus.COOLDOWN] },
    },
    data: { status: WarStatus.ENDED, end_at: now },
  });

  await tx.alliance_xp.deleteMany();
  await tx.alliance_upgrades.deleteMany();

  return {
    reserved: reserved.count,
    loansWrittenOff: loansWrittenOff.count,
    loanRequestsCancelled: loanRequestsCancelled.count,
    goldRequestsCancelled: goldRequestsCancelled.count,
    joinRequestsCancelled: joinRequestsCancelled.count,
    warsEnded: warsEnded.count,
  };
};
