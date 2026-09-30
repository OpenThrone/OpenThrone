import { assertGoldQuantity, SimulationConfigError } from './invariants';
import type { Rng } from './random';
import { createRng } from './random';
import type {
  RecruitmentAwardEvent,
  RecruitmentManifest,
  RecruitmentRecipientMode,
} from './scenarioTypes';
import {
  RECRUITMENT_RECIPIENT_MODES,
  RECRUITMENT_REWARD_BANDS,
} from './scenarioTypes';
import type { PlayerState } from './types';

/**
 * External recruitment reward modeling for ERA scenario simulation.
 *
 * Production recruitment (`Recruitment.service.ts`) grants the recipient one
 * citizen and 250 hand gold per successful reward event. The ERA model treats
 * throughput as successful reward EVENTS per participating recipient per day,
 * NOT as raw UI clicks: click assumptions in `v5Combat.ts` and the stress-test
 * doc are declared sensitivity figures, not production authority.
 *
 * This module is intentionally distinct from unit training
 * (`economy.ts` `recruitUnits`), which converts existing citizens into
 * military units. External recruitment introduces NEW citizens and gold.
 */

/** Gold granted to a recipient per successful recruitment reward event. */
export const RECRUITMENT_EVENT_GOLD_REWARD = 250;

/** Citizens granted to a recipient per successful recruitment reward event. */
export const RECRUITMENT_EVENT_CITIZEN_REWARD = 1;

/** Default share of active users selected as daily recruitment participants. */
export const RECRUITMENT_DEFAULT_SELECTION_SHARE = 0.75;

/** Share of total events directed to the top quintile under networkWeighted. */
export const RECRUITMENT_NETWORK_TOP_CONCENTRATION = 0.8;

/** Top-quintile cutoff used to measure and direct concentration. */
export const RECRUITMENT_NETWORK_TOP_QUINTILE = 0.2;

/**
 * Per-recipient participation summary for a single simulated day. `selected`
 * marks members of the 75% participating cohort; `eventsReceived` is the
 * discrete reward-event count routed to that recipient.
 */
export interface RecruitmentParticipantRecord {
  readonly playerId: string;
  readonly eventsReceived: number;
  readonly citizensAwarded: number;
  readonly goldAwarded: number;
  readonly selected: boolean;
}

/**
 * Outcome of one simulated day of external recruitment rewards. `events`
 * holds one aggregated {@link RecruitmentAwardEvent} per recipient, while
 * `participants` carries the richer per-recipient bookkeeping.
 */
export interface RecruitmentAwardResult {
  readonly day: number;
  readonly events: readonly RecruitmentAwardEvent[];
  readonly participants: readonly RecruitmentParticipantRecord[];
  readonly totalCitizens: number;
  readonly totalGold: number;
  /** Number of active users selected into the 75% participating cohort. */
  readonly participantCount: number;
  /** Number of distinct recipients that received at least one reward event. */
  readonly recipientCount: number;
  /** Share of total events received by the top quintile of recipients. */
  readonly concentrationRatio: number;
  readonly mode: RecruitmentRecipientMode;
}

/**
 * Computes the largest-remainder apportionment of `total` across `count`
 * slots: each slot receives `floor(total / count)`, and the first
 * `total % count` slots receive one extra. Deterministic given the inputs.
 */
function apportionEvenly(total: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  const out = new Array<number>(count).fill(base);
  for (let i = 0; i < remainder; i++) out[i] += 1;
  return out;
}

/**
 * Rounds a participant share to an exact integer count. Round-half-up mirrors
 * the declared stress-test table (10 -> 8, 15 -> 11, 20 -> 15) and is
 * equivalent to a single-group largest-remainder apportionment.
 */
function selectCount(activeCount: number, share: number): number {
  return Math.round(activeCount * share);
}

function validateManifest(manifest: RecruitmentManifest): void {
  if (!RECRUITMENT_REWARD_BANDS.includes(manifest.band)) {
    throw new SimulationConfigError(
      `Recruitment band ${manifest.band} is not supported; allowed bands are ` +
        `${RECRUITMENT_REWARD_BANDS.join(', ')}.`,
      'recruitment-band-unsupported',
    );
  }
  if (!RECRUITMENT_RECIPIENT_MODES.includes(manifest.recipientMode)) {
    throw new SimulationConfigError(
      `Recruitment recipient mode "${manifest.recipientMode}" is not supported.`,
      'recruitment-mode-unsupported',
    );
  }
  if (
    !Number.isFinite(manifest.selectionShare) ||
    manifest.selectionShare <= 0 ||
    manifest.selectionShare > 1
  ) {
    throw new SimulationConfigError(
      `Recruitment selectionShare must be a number in (0, 1]; received ${manifest.selectionShare}.`,
      'recruitment-selection-share-invalid',
    );
  }
  if (
    !Number.isFinite(manifest.rewardsPerDay) ||
    !Number.isSafeInteger(manifest.rewardsPerDay) ||
    manifest.rewardsPerDay <= 0
  ) {
    throw new SimulationConfigError(
      `Recruitment rewardsPerDay must be a positive safe integer; received ${manifest.rewardsPerDay}.`,
      'recruitment-rewards-per-day-invalid',
    );
  }
}

/**
 * Filters the candidate pool to eligible recipients. Defeated players are a
 * configuration contract violation (the caller mislabeled an ineligible
 * recipient as eligible) and are rejected eagerly; inactive players are
 * silently excluded from selection but never rewarded.
 */
function filterEligiblePlayers(players: readonly PlayerState[]): PlayerState[] {
  for (const player of players) {
    if (player.status === 'defeated') {
      throw new SimulationConfigError(
        `Player ${player.id} is defeated and cannot participate in or receive external recruitment rewards.`,
        'recruitment-defeated-recipient',
        player.id,
      );
    }
  }
  return players.filter((player) => player.status === 'active');
}

/**
 * Selects the participating cohort via stable seeded ordering: candidates are
 * sorted by id for input-order independence, then deterministically shuffled
 * with `rng`, and the first `selectionShare` fraction (round-half-up) is taken.
 */
function selectParticipants(
  eligible: PlayerState[],
  selectionShare: number,
  rng: Rng,
): PlayerState[] {
  if (eligible.length === 0) return [];
  const stable = eligible
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const shuffled = rng.shuffle(stable);
  const count = Math.min(
    selectCount(eligible.length, selectionShare),
    shuffled.length,
  );
  return shuffled.slice(0, count);
}

/**
 * Builds a per-recipient event-count map for `self` mode: each selected
 * participant receives exactly `band` events to themselves.
 */
function distributeSelf(
  participants: readonly PlayerState[],
  band: number,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const participant of participants) {
    out.set(participant.id, band);
  }
  return out;
}

/**
 * Builds a per-recipient event-count map for `networkWeighted` mode.
 *
 * The total event budget (`participants * band`) is split so that 80% of
 * events flow to the top 20% of recipients (round-half-up share, largest
 * remainder per group). The top quintile is chosen by the seeded participant
 * ordering, so the distribution is deterministic for a fixed RNG stream.
 */
function distributeNetworkWeighted(
  participants: readonly PlayerState[],
  band: number,
): Map<string, number> {
  const out = new Map<string, number>();
  if (participants.length === 0) return out;

  const totalEvents = participants.length * band;
  const topCount = Math.max(
    1,
    Math.floor(participants.length * RECRUITMENT_NETWORK_TOP_QUINTILE),
  );
  const topEvents = Math.round(
    totalEvents * RECRUITMENT_NETWORK_TOP_CONCENTRATION,
  );

  const topParticipants = participants.slice(0, topCount);
  const restParticipants = participants.slice(topCount);

  const topShares = apportionEvenly(topEvents, topParticipants.length);
  topParticipants.forEach((player, index) => {
    out.set(player.id, topShares[index]);
  });

  const restEvents = totalEvents - topEvents;
  if (restParticipants.length > 0 && restEvents > 0) {
    const restShares = apportionEvenly(restEvents, restParticipants.length);
    restParticipants.forEach((player, index) => {
      out.set(player.id, restShares[index]);
    });
  } else if (restParticipants.length > 0) {
    for (const player of restParticipants) out.set(player.id, 0);
  }

  return out;
}

/**
 * Applies `eventCount` reward events to a recipient, mutating the player in
 * place. Each event grants one citizen and 250 hand gold. Gold quantity is
 * asserted after every award so overflow fails fast with full day/player
 * context rather than silently corrupting downstream balance conclusions.
 */
function applyEventsToRecipient(
  player: PlayerState,
  eventCount: number,
  day: number,
): { citizensAwarded: number; goldAwarded: number } {
  const citizensAwarded = eventCount * RECRUITMENT_EVENT_CITIZEN_REWARD;
  const goldAwarded = eventCount * RECRUITMENT_EVENT_GOLD_REWARD;
  const context = { day, playerId: player.id };

  player.units = {
    ...player.units,
    citizen: player.units.citizen + citizensAwarded,
  };
  player.gold += goldAwarded;

  assertGoldQuantity(player.gold, 'gold', context);

  return { citizensAwarded, goldAwarded };
}

/**
 * Computes the realized concentration ratio: the share of total events
 * received by the top quintile of recipients. Under `self` mode this is
 * approximately 0.20 (uniform); under `networkWeighted` it is approximately
 * 0.80 within integer-rounding tolerance.
 */
function computeConcentrationRatio(
  eventCounts: ReadonlyMap<string, number>,
): number {
  const counts = Array.from(eventCounts.values()).filter((value) => value > 0);
  const total = counts.reduce((sum, value) => sum + value, 0);
  if (counts.length === 0 || total === 0) return 0;
  counts.sort((a, b) => b - a);
  const topCount = Math.max(
    1,
    Math.floor(counts.length * RECRUITMENT_NETWORK_TOP_QUINTILE),
  );
  let topTotal = 0;
  for (let i = 0; i < topCount; i++) topTotal += counts[i];
  return topTotal / total;
}

/**
 * Generates and applies one simulated day of external recruitment reward
 * events for a participating cohort drawn from `activePlayers`.
 *
 * Semantics:
 *  - Defeated players in `activePlayers` are rejected (configuration error).
 *  - Only `status === 'active'` players are eligible; inactive players are
 *    excluded from selection and receive no rewards.
 *  - Exactly `selectionShare` (round-half-up) of eligible players are
 *    selected via stable seeded ordering.
 *  - Each selected participant earns `band` reward events.
 *  - `self` mode: each participant receives their own events.
 *  - `networkWeighted` mode: the total event budget is redistributed so the
 *    top quintile of recipients receives ~80% of events (deterministic).
 *  - Each event grants exactly one citizen and 250 hand gold, with gold
 *    overflow asserted after every award.
 *
 * `activePlayers` is mutated in place: recipient `units.citizen` and `gold`
 * fields are incremented. Returns a {@link RecruitmentAwardResult} describing
 * the day's participation, per-recipient rewards, totals, and concentration.
 */
export function generateRecruitmentEvents(
  manifest: RecruitmentManifest,
  activePlayers: PlayerState[],
  day: number,
  rng: Rng = createRng(0),
): RecruitmentAwardResult {
  validateManifest(manifest);

  const eligible = filterEligiblePlayers(activePlayers);
  const participants = selectParticipants(
    eligible,
    manifest.selectionShare,
    rng,
  );

  const eventCounts =
    manifest.recipientMode === 'self'
      ? distributeSelf(participants, manifest.band)
      : distributeNetworkWeighted(participants, manifest.band);

  const participantIds = new Set(participants.map((player) => player.id));
  const events: RecruitmentAwardEvent[] = [];
  const participantRecords: RecruitmentParticipantRecord[] = [];
  let totalCitizens = 0;
  let totalGold = 0;

  for (const player of activePlayers) {
    const count = eventCounts.get(player.id) ?? 0;
    if (count === 0) continue;
    const { citizensAwarded, goldAwarded } = applyEventsToRecipient(
      player,
      count,
      day,
    );
    totalCitizens += citizensAwarded;
    totalGold += goldAwarded;
    events.push({
      day,
      recipientId: player.id,
      citizensAwarded,
      goldAwarded,
      sourceMode: manifest.recipientMode,
    });
    participantRecords.push({
      playerId: player.id,
      eventsReceived: count,
      citizensAwarded,
      goldAwarded,
      selected: participantIds.has(player.id),
    });
  }

  return {
    day,
    events,
    participants: participantRecords,
    totalCitizens,
    totalGold,
    participantCount: participants.length,
    recipientCount: events.length,
    concentrationRatio: computeConcentrationRatio(eventCounts),
    mode: manifest.recipientMode,
  };
}
