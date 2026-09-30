/**
 * Alliance state, treasury aid, fresh intel sharing, and coordinated attack
 * planning for ERA scenario simulation (plan Todo 7).
 *
 * Mirrors the production alliance-bank contract in
 * `src/services/AllianceBank.service.ts` (members deposit OWN hand gold; only
 * the alliance leader may withdraw to a member) and the production attack
 * limits in `src/services/AttackValidationService.ts` (max five attacks per
 * attacker-defender pair per rolling 24h) and `src/models/BattleUser.ts`
 * (`canAttack` symmetric level range; `isProtected` level-9 ceiling), plus
 * the intel-freshness threshold in `src/sim/targeting.ts` (age <= 1 day).
 *
 * This module is SIMULATION-ONLY and intentionally self-contained so plan
 * Todo 9 can compose it without touching `daycycle.ts`, `targeting.ts`, or
 * `behaviors.ts`. It composes `PlayerState` and `AllianceManifest` WITHOUT
 * adding fields to either base type, and performs NO unit transfer and NO
 * gold/unit creation: every deposit and aid withdrawal conserves the sum of
 * member hand gold plus treasury exactly.
 */

import { calculateTurnIncome } from './economy';
import {
  assertGoldQuantity,
  assertScenarioTreasury,
  SimulationConfigError,
} from './invariants';
import type {
  AllianceManifest,
  AllianceMemberSeat,
  AllianceMode,
} from './scenarioTypes';
import { ALLIANCE_MODES } from './scenarioTypes';
import type { IntelResult, PlayerState } from './types';

/**
 * Symmetric attack level range. Source: `BattleUser.canAttack`
 * (`NEXT_PUBLIC_ATTACK_LEVEL_RANGE`, default 5) and `daycycle.canAttackByLevel`.
 */
export const ALLIANCE_ATTACK_LEVEL_RANGE = 5;

/**
 * Maximum attacks per attacker-defender pair per rolling 24h window.
 * Source: `AttackValidationService.canAttack` (`history < 5`).
 */
export const ALLIANCE_MAX_ATTACKS_PER_PAIR_24H = 5;

/**
 * Inclusive level ceiling for low-level protection. Source:
 * `BattleUser.isProtected` (`level <= 9`) and `PRODUCTION_RULESET`.
 */
export const ALLIANCE_PROTECTED_MAX_LEVEL = 9;

/**
 * Intel is "fresh" while its age in days is at most this value. Source:
 * `targeting.getIntelFreshness` (`age <= 1` => 'fresh').
 */
export const ALLIANCE_INTEL_FRESH_MAX_AGE_DAYS = 1;

/**
 * Treasury-aid cap: at most this fraction of the current treasury per aid.
 */
export const ALLIANCE_AID_TREASURY_FRACTION = 0.1;

/**
 * Treasury-aid cap: at most this fraction of the recipient's trailing-7d
 * income per aid.
 */
export const ALLIANCE_AID_INCOME_FRACTION = 0.25;

/**
 * Default ticks per simulated day (30-minute turn interval => 48 ticks/day).
 * Source: `daycycle.DEFAULT_TURN_INTERVAL_MINUTES` (30).
 */
export const ALLIANCE_DEFAULT_TICKS_PER_DAY = 48;

/** Number of attackers that form a focus-fire alliance under `focusFive`. */
export const FOCUS_FIVE_ALLIANCE_SIZE = 5;

/** Share of eligible players placed in the dominant alliance under 60/40. */
export const DOMINANT_SPLIT_FRACTION = 0.6;

const TWO_BALANCED_ALLIANCE_IDS = ['alliance-alpha', 'alliance-beta'] as const;

const DOMINANT_ALLIANCE_IDS = ['alliance-dominant', 'alliance-minor'] as const;

const FOCUS_FIVE_ALLIANCE_ID = 'alliance-focus';

/** Kind of treasury movement recorded in `AllianceState.treasuryLog`. */
export type AllianceTreasuryRecordKind = 'deposit' | 'aid';

/**
 * Full conservation evidence for one treasury movement. The `treasuryBefore`/
 * `treasuryAfter` and `recipientGoldBefore`/`recipientGoldAfter` pairs let a
 * test or audit verify that gold was moved, never created: for a deposit the
 * member's loss equals the treasury's gain, and for an aid the treasury's
 * loss equals the recipient's gain.
 */
export interface AllianceTreasuryRecord {
  readonly kind: AllianceTreasuryRecordKind;
  readonly day: number;
  /** Depositor (deposit) or authorizing leader (aid). */
  readonly actorId: string;
  /** Depositor (deposit) or aided member (aid). */
  readonly recipientId: string;
  readonly amount: number;
  readonly treasuryBefore: number;
  readonly treasuryAfter: number;
  readonly recipientGoldBefore: number;
  readonly recipientGoldAfter: number;
}

/** One fresh-intel delivery to a single alliance member. */
export interface AllianceIntelShareRecord {
  readonly day: number;
  readonly sharerId: string;
  readonly targetId: string;
  readonly memberId: string;
  /** Simulated day the shared intel was originally gathered. */
  readonly intelDay: number;
}

/** A focus-fire nomination: a target plus the deterministic attacker order. */
export interface AllianceFocusFireNomination {
  readonly nominatedOnDay: number;
  readonly targetId: string;
  readonly attackerOrder: readonly string[];
}

/** Reason a coordinated-attack order was marked eligible or ineligible. */
export type AllianceAttackEligibilityReason =
  | 'eligible'
  | 'self'
  | 'ally'
  | 'protected'
  | 'out-of-level-range'
  | 'insufficient-turns'
  | 'insufficient-stamina'
  | 'pair-limit-reached'
  | 'attacker-missing'
  | 'target-missing';

/** One attacker's scheduled order against a nominated focus-fire target. */
export interface CoordinatedAttackOrder {
  readonly attackerId: string;
  readonly targetId: string;
  readonly orderIndex: number;
  readonly eligible: boolean;
  readonly reason: AllianceAttackEligibilityReason;
  /** Attacks already recorded for this pair inside the rolling 24h window. */
  readonly pairAttackCountInWindow: number;
}

/** Full plan for one focus-fire target, including rejected orders. */
export interface CoordinatedAttackPlan {
  readonly allianceId: string;
  readonly targetId: string;
  readonly nominatedOnDay: number;
  readonly plannedOnDay: number;
  readonly orders: readonly CoordinatedAttackOrder[];
  readonly legalOrders: readonly CoordinatedAttackOrder[];
}

/** An aggression against a member that the alliance may retaliate for. */
export interface AllianceRetaliationRecord {
  readonly day: number;
  readonly memberId: string;
  readonly aggressorId: string;
  readonly allianceId: string;
}

/**
 * Per-alliance runtime state for an ERA scenario. The scalar `treasury` and
 * the accumulating arrays/maps evolve over a run; the membership fields are
 * fixed at creation. Stored as scenario-only metadata parallel to
 * `SimulationState.players` — never forced onto base `PlayerState`.
 */
export interface AllianceState {
  readonly allianceId: string;
  readonly mode: AllianceMode;
  readonly leaderId: string;
  readonly members: readonly AllianceMemberSeat[];
  readonly memberIds: ReadonlySet<string>;
  treasury: number;
  readonly treasuryLog: AllianceTreasuryRecord[];
  /** Last day aid was authorized per member, enforcing one aid/member/day. */
  readonly aidDayByMember: Map<string, number>;
  readonly intelShares: AllianceIntelShareRecord[];
  readonly nominations: AllianceFocusFireNomination[];
  readonly attackPlans: CoordinatedAttackPlan[];
  readonly retaliationRecords: AllianceRetaliationRecord[];
}

/** Population snapshot consumed by `planCoordinatedAttack`. */
export interface CoordinatedAttackContext {
  readonly players: ReadonlyMap<string, PlayerState>;
  readonly currentTick: number;
  readonly windowTicks: number;
  readonly currentDay: number;
  readonly attackLevelRange?: number;
  /** Set to `null` to disable low-level protection. Defaults to level 9. */
  readonly protectedMaxLevel?: number | null;
  readonly maxAttacksPerPair?: number;
  readonly minTurns?: number;
  readonly minStamina?: number;
}

function sortById(players: readonly PlayerState[]): PlayerState[] {
  return players
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Filters the candidate pool to alliance-eligible players. Defeated players
 * are a configuration contract violation (mislabeled as eligible) and are
 * rejected eagerly; inactive players are silently excluded from membership.
 */
function filterEligiblePlayers(players: readonly PlayerState[]): PlayerState[] {
  for (const player of players) {
    if (player.status === 'defeated') {
      throw new SimulationConfigError(
        `Player ${player.id} is defeated and cannot join an alliance.`,
        'alliance-defeated-player',
        player.id,
      );
    }
  }
  return players.filter((player) => player.status === 'active');
}

/**
 * Builds member seats for one alliance from already-id-sorted members. The
 * leader is the lexicographically smallest member id, which is deterministic
 * and stable across runs and independent of input order.
 */
function buildSeats(
  allianceId: string,
  sortedMembers: readonly PlayerState[],
): AllianceMemberSeat[] {
  return sortedMembers.map((player, index) => ({
    playerId: player.id,
    allianceId,
    isLeader: index === 0,
  }));
}

/**
 * Deterministically builds the alliance manifests for a scenario mode.
 *
 * Membership and leadership are derived purely from id-sorted eligible
 * players (NO seeded randomness), so identical inputs always produce
 * identical alliances. This stable ordering precedes any later seeded
 * operations performed by the scenario runner.
 *
 *  - `none`           => no alliances (empty map).
 *  - `twoBalanced`    => two alliances split as evenly as possible
 *                        (ceil(n/2) / floor(n/2)); one leader each.
 *  - `dominant60_40`  => dominant alliance receives ~60% (round-half-up),
 *                        minor alliance the remainder.
 *  - `focusFive`      => one alliance of the first min(5, n) eligible
 *                        players that will focus-fire a single target.
 */
export function buildAllianceManifests(
  mode: AllianceMode,
  players: readonly PlayerState[],
): Map<string, AllianceManifest> {
  if (!ALLIANCE_MODES.includes(mode)) {
    throw new SimulationConfigError(
      `Alliance mode "${mode}" is not supported; allowed modes are ${ALLIANCE_MODES.join(', ')}.`,
      'alliance-mode-unsupported',
    );
  }

  const manifests = new Map<string, AllianceManifest>();
  if (mode === 'none') return manifests;

  const eligible = sortById(filterEligiblePlayers(players));
  if (eligible.length === 0) {
    throw new SimulationConfigError(
      `Alliance mode "${mode}" requires at least one active player; received 0 eligible.`,
      'alliance-no-eligible-players',
    );
  }

  if (mode === 'focusFive') {
    const focus = eligible.slice(
      0,
      Math.min(FOCUS_FIVE_ALLIANCE_SIZE, eligible.length),
    );
    manifests.set(FOCUS_FIVE_ALLIANCE_ID, {
      mode,
      members: buildSeats(FOCUS_FIVE_ALLIANCE_ID, focus),
    });
    return manifests;
  }

  if (eligible.length < 2) {
    throw new SimulationConfigError(
      `Alliance mode "${mode}" requires at least two active players; received ${eligible.length} eligible.`,
      'alliance-too-few-eligible',
    );
  }

  if (mode === 'twoBalanced') {
    const mid = Math.ceil(eligible.length / 2);
    const alphaId = TWO_BALANCED_ALLIANCE_IDS[0];
    const betaId = TWO_BALANCED_ALLIANCE_IDS[1];
    manifests.set(alphaId, {
      mode,
      members: buildSeats(alphaId, eligible.slice(0, mid)),
    });
    manifests.set(betaId, {
      mode,
      members: buildSeats(betaId, eligible.slice(mid)),
    });
    return manifests;
  }

  // mode === 'dominant60_40'
  const dominantCount = Math.max(
    1,
    Math.round(eligible.length * DOMINANT_SPLIT_FRACTION),
  );
  const dominant = eligible.slice(0, dominantCount);
  const minor = eligible.slice(dominantCount);
  if (minor.length === 0) {
    throw new SimulationConfigError(
      `Alliance mode "dominant60_40" produced an empty minor alliance from ${eligible.length} eligible players.`,
      'alliance-dominant-split-degenerate',
    );
  }
  const dominantId = DOMINANT_ALLIANCE_IDS[0];
  const minorId = DOMINANT_ALLIANCE_IDS[1];
  manifests.set(dominantId, {
    mode,
    members: buildSeats(dominantId, dominant),
  });
  manifests.set(minorId, {
    mode,
    members: buildSeats(minorId, minor),
  });
  return manifests;
}

/** Indexes every seat by player id across all manifests. */
export function manifestMembershipMap(
  manifests: ReadonlyMap<string, AllianceManifest>,
): Map<string, AllianceMemberSeat> {
  const out = new Map<string, AllianceMemberSeat>();
  for (const manifest of manifests.values()) {
    for (const seat of manifest.members) {
      out.set(seat.playerId, seat);
    }
  }
  return out;
}

/**
 * Creates the runtime alliance state from a validated manifest. Membership
 * is frozen at creation; `treasury` and the accumulating logs start empty.
 */
export function createAllianceState(manifest: AllianceManifest): AllianceState {
  if (manifest.members.length === 0) {
    throw new SimulationConfigError(
      'Alliance manifest has no members.',
      'alliance-empty-manifest',
    );
  }

  const { allianceId } = manifest.members[0];
  for (const seat of manifest.members) {
    if (seat.allianceId !== allianceId) {
      throw new SimulationConfigError(
        `Alliance manifest has inconsistent alliance ids; expected ${allianceId}, found ${seat.allianceId} on member ${seat.playerId}.`,
        'alliance-inconsistent-ids',
      );
    }
  }

  const leaders = manifest.members.filter((seat) => seat.isLeader);
  if (leaders.length !== 1) {
    throw new SimulationConfigError(
      `Alliance ${allianceId} must have exactly one leader; found ${leaders.length}.`,
      'alliance-leader-count',
    );
  }

  const memberIds = new Set(manifest.members.map((seat) => seat.playerId));
  if (memberIds.size !== manifest.members.length) {
    throw new SimulationConfigError(
      `Alliance ${allianceId} has duplicate member ids.`,
      'alliance-duplicate-members',
    );
  }

  const leaderId = leaders[0].playerId;
  return {
    allianceId,
    mode: manifest.mode,
    leaderId,
    members: manifest.members,
    memberIds,
    treasury: 0,
    treasuryLog: [],
    aidDayByMember: new Map(),
    intelShares: [],
    nominations: [],
    attackPlans: [],
    retaliationRecords: [],
  };
}

/** Creates runtime state for every manifest. */
export function createAllianceStates(
  manifests: ReadonlyMap<string, AllianceManifest>,
): Map<string, AllianceState> {
  const states = new Map<string, AllianceState>();
  for (const [id, manifest] of manifests) {
    states.set(id, createAllianceState(manifest));
  }
  return states;
}

/** Returns the alliance a player belongs to, or `undefined`. */
export function allianceStateForPlayer(
  states: ReadonlyMap<string, AllianceState>,
  playerId: string,
): AllianceState | undefined {
  for (const state of states.values()) {
    if (state.memberIds.has(playerId)) return state;
  }
  return undefined;
}

/** True iff two players are in the same alliance (a player is allied to itself). */
export function isAllied(
  states: ReadonlyMap<string, AllianceState>,
  playerIdA: string,
  playerIdB: string,
): boolean {
  if (playerIdA === playerIdB) return true;
  const state = allianceStateForPlayer(states, playerIdA);
  return !!state && state.memberIds.has(playerIdB);
}

/**
 * Sums treasury plus member hand/bank gold for conservation checks. The
 * caller supplies a member-id => PlayerState map; missing members are
 * skipped (their gold is treated as 0).
 */
export function allianceGoldTotal(
  state: AllianceState,
  members: ReadonlyMap<string, PlayerState>,
): {
  readonly treasury: number;
  readonly memberHandGold: number;
  readonly memberBankGold: number;
  readonly total: number;
} {
  let memberHandGold = 0;
  let memberBankGold = 0;
  for (const memberId of state.memberIds) {
    const member = members.get(memberId);
    if (!member) continue;
    memberHandGold += member.gold;
    memberBankGold += member.goldInBank;
  }
  return {
    treasury: state.treasury,
    memberHandGold,
    memberBankGold,
    total: state.treasury + memberHandGold + memberBankGold,
  };
}

/**
 * Deposits a member's OWN hand gold into the alliance treasury. Mirrors
 * `AllianceBankService.deposit`: only members may deposit; gold leaves the
 * member's hand and enters the treasury with no creation or destruction.
 *
 * Mutates `member.gold` and `state.treasury` in place and asserts both as
 * safe-integer gold quantities after the move.
 */
export function depositToTreasury(
  state: AllianceState,
  member: PlayerState,
  amount: number,
  day: number,
): AllianceTreasuryRecord {
  if (!state.memberIds.has(member.id)) {
    throw new SimulationConfigError(
      `Player ${member.id} is not a member of alliance ${state.allianceId} and cannot deposit.`,
      'alliance-deposit-non-member',
      member.id,
    );
  }
  const context = { day, playerId: member.id };
  assertGoldQuantity(amount, 'amount', context);
  if (amount <= 0) {
    throw new SimulationConfigError(
      `Deposit amount must be positive; received ${amount}.`,
      'alliance-deposit-non-positive',
      member.id,
    );
  }
  if (member.gold < amount) {
    throw new SimulationConfigError(
      `Player ${member.id} has ${member.gold} hand gold; cannot deposit ${amount}.`,
      'alliance-deposit-insufficient-gold',
      member.id,
    );
  }

  const treasuryBefore = state.treasury;
  const recipientGoldBefore = member.gold;
  member.gold -= amount;
  state.treasury += amount;
  assertGoldQuantity(member.gold, 'gold', context);
  assertScenarioTreasury(state.treasury, context);

  const record: AllianceTreasuryRecord = {
    kind: 'deposit',
    day,
    actorId: member.id,
    recipientId: member.id,
    amount,
    treasuryBefore,
    treasuryAfter: state.treasury,
    recipientGoldBefore,
    recipientGoldAfter: member.gold,
  };
  state.treasuryLog.push(record);
  return record;
}

/**
 * Estimates a recipient's trailing-7-day gross income from the player's
 * current per-tick income. The scenario runner may instead track actual
 * income history and pass that value directly to `authorizeTreasuryAid`.
 */
export function estimateTrailing7dIncome(
  player: PlayerState,
  ticksPerDay: number = ALLIANCE_DEFAULT_TICKS_PER_DAY,
): number {
  if (!Number.isInteger(ticksPerDay) || ticksPerDay <= 0) {
    throw new SimulationConfigError(
      `estimateTrailing7dIncome ticksPerDay must be a positive integer; received ${ticksPerDay}.`,
      'alliance-ticks-per-day-invalid',
    );
  }
  const perTick = calculateTurnIncome(player);
  if (perTick <= 0) return 0;
  return Math.max(0, Math.floor(perTick * ticksPerDay * 7));
}

/**
 * Authorizes leader-only treasury aid to a member. Mirrors
 * `AllianceBankService.withdraw`: only the alliance leader may move gold out
 * of the treasury, and only to a member. Mirrors plan Todo 7 caps:
 *   - at most ONE aid per member per day;
 *   - amount <= min(10% of treasury, 25% of recipient trailing-7d income).
 *
 * Returns the treasury record on success, or `null` when no aid is possible
 * (recipient already aided today, cap is zero, or requested amount is zero).
 * The leader-only rule is enforced by throwing `SimulationConfigError` so a
 * caller bug cannot silently move treasury gold.
 */
export function authorizeTreasuryAid(
  state: AllianceState,
  leader: PlayerState,
  recipient: PlayerState,
  requestedAmount: number,
  day: number,
  trailing7dIncome: number,
): AllianceTreasuryRecord | null {
  if (leader.id !== state.leaderId) {
    throw new SimulationConfigError(
      `Player ${leader.id} is not the leader of alliance ${state.allianceId}; only the leader (${state.leaderId}) may authorize treasury aid.`,
      'alliance-aid-not-leader',
      leader.id,
    );
  }
  if (!state.memberIds.has(recipient.id)) {
    throw new SimulationConfigError(
      `Recipient ${recipient.id} is not a member of alliance ${state.allianceId}.`,
      'alliance-aid-recipient-non-member',
      recipient.id,
    );
  }
  if (!Number.isFinite(requestedAmount)) {
    throw new SimulationConfigError(
      `Treasury aid requestedAmount must be finite; received ${requestedAmount}.`,
      'alliance-aid-request-invalid',
      recipient.id,
    );
  }
  const recipientContext = { day, playerId: recipient.id };
  assertGoldQuantity(trailing7dIncome, 'trailing7dIncome', recipientContext);

  // Cap 1: at most one aid per member per day.
  if (state.aidDayByMember.get(recipient.id) === day) {
    return null;
  }

  // Cap 2: min(10% treasury, 25% trailing-7d income).
  const treasuryCap = Math.floor(
    state.treasury * ALLIANCE_AID_TREASURY_FRACTION,
  );
  const incomeCap = Math.floor(trailing7dIncome * ALLIANCE_AID_INCOME_FRACTION);
  const aidCap = Math.min(treasuryCap, incomeCap);
  if (aidCap <= 0) return null;

  const requested = Math.max(0, Math.floor(requestedAmount));
  const amount = Math.min(requested, aidCap, state.treasury);
  if (amount <= 0) return null;

  const leaderContext = { day, playerId: leader.id };
  const treasuryBefore = state.treasury;
  const recipientGoldBefore = recipient.gold;
  state.treasury -= amount;
  recipient.gold += amount;
  assertScenarioTreasury(state.treasury, leaderContext);
  assertGoldQuantity(recipient.gold, 'gold', recipientContext);

  state.aidDayByMember.set(recipient.id, day);
  const record: AllianceTreasuryRecord = {
    kind: 'aid',
    day,
    actorId: leader.id,
    recipientId: recipient.id,
    amount,
    treasuryBefore,
    treasuryAfter: state.treasury,
    recipientGoldBefore,
    recipientGoldAfter: recipient.gold,
  };
  state.treasuryLog.push(record);
  return record;
}

/**
 * Returns true iff the intel is fresh enough to share. Mirrors
 * `targeting.getIntelFreshness` ('fresh' while `currentDay - intel.day <= 1`).
 */
export function isIntelFresh(
  intel: IntelResult | undefined,
  currentDay: number,
): boolean {
  if (!intel || !intel.success) return false;
  const age = currentDay - intel.day;
  return age >= 0 && age <= ALLIANCE_INTEL_FRESH_MAX_AGE_DAYS;
}

/**
 * Shares fresh intel on `targetId` with the other alliance members. Only
 * fresh intel is ever shared: stale intel returns an empty array and records
 * nothing. Each recipient that does not already hold equal-or-fresher
 * successful intel for the target has the intel copied into its
 * `intelCache` and a share record is appended.
 *
 * `recipients` maps member id => PlayerState for the members that should
 * receive the intel; members absent from the map are skipped.
 */
export function shareFreshIntel(
  state: AllianceState,
  sharerId: string,
  targetId: string,
  intel: IntelResult,
  currentDay: number,
  recipients: ReadonlyMap<string, PlayerState>,
): AllianceIntelShareRecord[] {
  if (!state.memberIds.has(sharerId)) {
    throw new SimulationConfigError(
      `Sharer ${sharerId} is not a member of alliance ${state.allianceId}.`,
      'alliance-intel-sharer-non-member',
      sharerId,
    );
  }
  // Stale intel is never shared.
  if (!isIntelFresh(intel, currentDay)) {
    return [];
  }

  const otherMemberIds = [...state.memberIds]
    .filter((id) => id !== sharerId)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const shares: AllianceIntelShareRecord[] = [];
  for (const memberId of otherMemberIds) {
    const recipient = recipients.get(memberId);
    if (!recipient) continue;
    const existing = recipient.intelCache.get(targetId);
    // Do not clobber equal-or-fresher successful intel the recipient holds.
    if (existing?.success && existing.day >= intel.day) {
      continue;
    }
    recipient.intelCache.set(targetId, intel);
    shares.push({
      day: currentDay,
      sharerId,
      targetId,
      memberId,
      intelDay: intel.day,
    });
  }
  state.intelShares.push(...shares);
  return shares;
}

/**
 * Default deterministic attacker order: member ids sorted ascending. Stable
 * across runs and independent of insertion order.
 */
export function defaultAttackerOrder(state: AllianceState): string[] {
  return [...state.memberIds].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Records a focus-fire nomination. The target must NOT be a member of this
 * alliance (allies cannot be nominated), and every attacker id must be a
 * member. When `attackerOrder` is omitted, {@link defaultAttackerOrder} is
 * used.
 */
export function nominateFocusTarget(
  state: AllianceState,
  targetId: string,
  attackerOrder: readonly string[] | undefined,
  day: number,
): AllianceFocusFireNomination {
  if (state.memberIds.has(targetId)) {
    throw new SimulationConfigError(
      `Cannot nominate alliance member ${targetId} as a focus-fire target of alliance ${state.allianceId}.`,
      'alliance-nominate-ally',
      targetId,
    );
  }
  const order = (attackerOrder ?? defaultAttackerOrder(state)).slice();
  for (const attackerId of order) {
    if (!state.memberIds.has(attackerId)) {
      throw new SimulationConfigError(
        `Attacker ${attackerId} is not a member of alliance ${state.allianceId}.`,
        'alliance-nominate-non-member-attacker',
        attackerId,
      );
    }
  }
  const nomination: AllianceFocusFireNomination = {
    nominatedOnDay: day,
    targetId,
    attackerOrder: order,
  };
  state.nominations.push(nomination);
  return nomination;
}

/** Symmetric attack level-range test. Source: `BattleUser.canAttack`. */
export function isWithinLevelRange(
  attackerLevel: number,
  defenderLevel: number,
  range: number = ALLIANCE_ATTACK_LEVEL_RANGE,
): boolean {
  return (
    attackerLevel >= defenderLevel - range &&
    attackerLevel <= defenderLevel + range
  );
}

/**
 * Read-only count of attacks a given attacker has already logged against a
 * defender within the rolling 24h window. Mirrors `daycycle`'s tick-window
 * trimming (`minTick = currentTick - windowTicks + 1`) without mutating the
 * attacker's history.
 */
export function countAttacksInWindow(
  attacker: PlayerState,
  defenderId: string,
  currentTick: number,
  windowTicks: number,
): number {
  const history = attacker.attackHistory.get(defenderId);
  if (!history || history.length === 0) return 0;
  const minTick = currentTick - windowTicks + 1;
  let count = 0;
  for (const tick of history) {
    if (tick >= minTick) count += 1;
  }
  return count;
}

/**
 * Plans the coordinated attack against a nominated focus-fire target.
 *
 * Each attacker in the nomination order is classified against the target.
 * An order is `eligible` only when ALL of the following hold:
 *   - attacker and target both exist in the population;
 *   - attacker is not the target;
 *   - target is NOT a member of this alliance (no friendly fire);
 *   - target is NOT protected by the low-level rule (level <= ceiling);
 *   - attacker is within the symmetric level range of the target;
 *   - attacker has >= `minTurns` attack turns and >= `minStamina` stamina;
 *   - attacker has logged < `maxAttacksPerPair` attacks against this target
 *     in the rolling 24h window (so unique attackers may focus the target,
 *     but no single attacker exceeds five attacks per pair per day).
 *
 * Ineligible orders are still recorded (with their reason) so the scenario
 * runner and tests can audit why an attack was skipped; only eligible orders
 * appear in `legalOrders`.
 */
export function planCoordinatedAttack(
  state: AllianceState,
  nomination: AllianceFocusFireNomination,
  context: CoordinatedAttackContext,
): CoordinatedAttackPlan {
  const attackLevelRange =
    context.attackLevelRange ?? ALLIANCE_ATTACK_LEVEL_RANGE;
  // `protectedMaxLevel === undefined` => default ceiling; `null` => disabled.
  const protectedMaxLevel =
    context.protectedMaxLevel === undefined
      ? ALLIANCE_PROTECTED_MAX_LEVEL
      : context.protectedMaxLevel;
  const maxAttacksPerPair =
    context.maxAttacksPerPair ?? ALLIANCE_MAX_ATTACKS_PER_PAIR_24H;
  const minTurns = context.minTurns ?? 1;
  const minStamina = context.minStamina ?? 1;

  const target = context.players.get(nomination.targetId);
  const targetAllied = !!target && state.memberIds.has(target.id);
  const targetProtected =
    target != null &&
    protectedMaxLevel != null &&
    target.level <= protectedMaxLevel;

  const orders: CoordinatedAttackOrder[] = [];
  const legalOrders: CoordinatedAttackOrder[] = [];

  nomination.attackerOrder.forEach((attackerId, index) => {
    const attacker = context.players.get(attackerId);
    let reason: AllianceAttackEligibilityReason;
    let pairCount = 0;

    if (!attacker) {
      reason = 'attacker-missing';
    } else if (attackerId === nomination.targetId) {
      reason = 'self';
    } else if (!target) {
      reason = 'target-missing';
    } else if (targetAllied) {
      reason = 'ally';
    } else if (targetProtected) {
      reason = 'protected';
    } else if (
      !isWithinLevelRange(attacker.level, target.level, attackLevelRange)
    ) {
      reason = 'out-of-level-range';
    } else if (attacker.attackTurns < minTurns) {
      reason = 'insufficient-turns';
    } else if (attacker.stamina < minStamina) {
      reason = 'insufficient-stamina';
    } else {
      pairCount = countAttacksInWindow(
        attacker,
        target.id,
        context.currentTick,
        context.windowTicks,
      );
      reason =
        pairCount >= maxAttacksPerPair ? 'pair-limit-reached' : 'eligible';
    }

    const eligible = reason === 'eligible';
    const order: CoordinatedAttackOrder = {
      attackerId,
      targetId: nomination.targetId,
      orderIndex: index,
      eligible,
      reason,
      pairAttackCountInWindow: pairCount,
    };
    orders.push(order);
    if (eligible) legalOrders.push(order);
  });

  const plan: CoordinatedAttackPlan = {
    allianceId: state.allianceId,
    targetId: nomination.targetId,
    nominatedOnDay: nomination.nominatedOnDay,
    plannedOnDay: context.currentDay,
    orders,
    legalOrders,
  };
  state.attackPlans.push(plan);
  return plan;
}

/**
 * Records that `aggressorId` attacked `memberId` on `day`, so the alliance
 * may nominate the aggressor for focus-fire retaliation later. The member
 * must belong to this alliance.
 */
export function recordRetaliation(
  state: AllianceState,
  memberId: string,
  aggressorId: string,
  day: number,
): AllianceRetaliationRecord {
  if (!state.memberIds.has(memberId)) {
    throw new SimulationConfigError(
      `Player ${memberId} is not a member of alliance ${state.allianceId}.`,
      'alliance-retaliation-non-member',
      memberId,
    );
  }
  const record: AllianceRetaliationRecord = {
    day,
    memberId,
    aggressorId,
    allianceId: state.allianceId,
  };
  state.retaliationRecords.push(record);
  return record;
}
