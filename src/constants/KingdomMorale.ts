// Kingdom morale (#205 phase 3) and garrison fatigue (#204) tuning.
// Client-safe: pure constants and pure functions only — no env, no database.

/** Morale a brand-new kingdom starts with, and the neutral resting value. */
export const KINGDOM_MORALE_DEFAULT = 100;
/** Lowest reachable morale (clamped). */
export const KINGDOM_MORALE_MIN = 0;
/** Highest reachable morale (clamped). */
export const KINGDOM_MORALE_MAX = 100;

/** Morale change when a defense is LOST (the attacker wins the battle). */
export const MORALE_DEFENSE_LOST = -3;
/** Morale change when a defense is WON (the attack is repelled). */
export const MORALE_DEFENSE_WON = 2;

/** Daily bonus for players active within MORALE_ACTIVE_WINDOW_HOURS. */
export const MORALE_DAILY_ACTIVE_BONUS = 5;
/** Daily passive recovery (active 24–48h ago) toward 100. */
export const MORALE_DAILY_PASSIVE_RECOVERY = 3;
/** Base daily decay once a player has been away longer than the inactivity threshold. */
export const MORALE_INACTIVE_DAILY_DECAY = 5;
/** Extra decay per full week of continued absence (long absences bleed faster). */
export const MORALE_INACTIVE_WEEKLY_ESCALATION = 5;
/** Hard cap on inactivity decay per day, however long the absence. */
export const MORALE_INACTIVE_DAILY_DECAY_CAP = 15;
/** Hours after last activity before the inactivity decay applies. */
export const MORALE_INACTIVE_THRESHOLD_HOURS = 48;
/** Hours of activity that count as "active today" for the active bonus. */
export const MORALE_ACTIVE_WINDOW_HOURS = 24;
/** Extra daily hit for a broke kingdom (gold <= 0) still holding active mercenary contracts. */
export const MORALE_BROKE_MERCENARY_UPKEEP = -3;

/** Below this morale untrained citizens start leaving (CITIZENS events). */
export const CITIZENS_DESERTION_MORALE_THRESHOLD = 40;
/** Share of untrained citizens that leaves per day. */
export const CITIZENS_DESERTION_RATE = 0.01;
/** Populations below this never desert (1% would not be a whole unit anyway). */
export const CITIZENS_DESERTION_MIN_POPULATION = 100;

/** Below this morale the trained army and mercenaries start deserting. */
export const ARMY_DESERTION_MORALE_THRESHOLD = 20;
/** Share of the whole trained army that deserts per day. */
export const TRAINED_DESERTION_RATE = 0.01;
/** Armies below this size never desert (computed on the whole army, not per row). */
export const TRAINED_DESERTION_MIN_ARMY = 100;
/** The army may never desert below this share of the recorded desertion floor. */
export const ARMY_DESERTION_FLOOR_SHARE = 0.75;
/** Share of all surviving mercenaries that walk out per day. */
export const MERCENARY_DESERTION_RATE = 0.1;
/** Fewer survivors than this across all contracts never desert. */
export const MERCENARY_DESERTION_MIN_SURVIVORS = 10;

/** Share of trained deserters that defects to the top attacker; the rest abandon. */
export const DEFECTOR_SHARE = 0.5;
/** Attack window (hours) considered when picking who receives defectors. */
export const DEFECTOR_ATTACK_WINDOW_HOURS = 72;
/** A defector recipient must have been active within this window. */
export const DEFECTOR_RECIPIENT_ACTIVE_HOURS = 24;
/** Max share of the recipient's own trained army they may gain per day from defections. */
export const DEFECTOR_RECIPIENT_DAILY_CAP_SHARE = 0.01;
/** Defector cap candidates examined per deserting kingdom (bounded query). */
export const DEFECTOR_RECIPIENT_CANDIDATE_LIMIT = 50;

/**
 * Rolling window (days) the defector-farming cheat signal (#205) looks back
 * over: which receivers collected a loser's defectors, on how many distinct
 * OT days, and against everything that loser lost to desertion.
 */
export const DEFECTOR_FARMING_WINDOW_DAYS = 14;
/** Distinct OT days one receiver must have collected a loser's defectors to signal. */
export const DEFECTOR_FARMING_MIN_DAYS = 3;
/**
 * Defectors to one receiver as a share of EVERYTHING the loser lost to
 * desertion (all desertion events, any kind) in the window at or above which
 * the pair signals, even on fewer days.
 */
export const DEFECTOR_FARMING_MIN_SHARE = 0.5;
/** At this share the receiver took nearly the whole bleed: extra score weight. */
export const DEFECTOR_FARMING_DOMINANT_SHARE = 0.75;

/** Garrison fatigue per point of defense pressure today (#204). */
export const DEFENDER_FATIGUE_PER_PRESSURE = 0.0025;
/** Fatigue never reduces the garrison's power below this multiplier (85%). */
export const DEFENDER_FATIGUE_MIN_MULTIPLIER = 0.85;
/**
 * A repelled attack only refunds the attack's turns divided by this; the rest
 * stays as pressure (net +ceil(turns/divisor)), so repelling many attacks
 * still tires the garrison and never erases other attackers' pressure.
 */
export const DEFENDER_REPELLED_RECOVERY_DIVISOR = 2;

/** Refusal message when hiring or renewing mercenaries below the army threshold. */
export const MERCENARY_REFUSAL_MESSAGE =
  "Mercenaries won't sign with a kingdom this demoralised";

const HOUR_MS = 60 * 60 * 1000;

/** Clamps any morale value into the 0–100 range. */
export function clampMorale(value: number): number {
  const morale = Number(value);
  if (!Number.isFinite(morale)) return KINGDOM_MORALE_DEFAULT;
  return Math.min(
    KINGDOM_MORALE_MAX,
    Math.max(KINGDOM_MORALE_MIN, Math.floor(morale)),
  );
}

/** Applies a morale delta and clamps the result into 0–100. */
export function applyMoraleDelta(morale: number, delta: number): number {
  return clampMorale(Number(morale) + Number(delta));
}

/** Daily inactivity decay for `daysInactive` full days of absence (negative). */
export function inactiveMoraleDecay(daysInactive: number): number {
  const days = Number(daysInactive);
  if (Number.isNaN(days) || days < 0) return 0;
  if (!Number.isFinite(days)) return -MORALE_INACTIVE_DAILY_DECAY_CAP;
  const weeksAway = Math.floor(days / 7);
  return -Math.min(
    MORALE_INACTIVE_DAILY_DECAY_CAP,
    MORALE_INACTIVE_DAILY_DECAY + weeksAway * MORALE_INACTIVE_WEEKLY_ESCALATION,
  );
}

export type DailyMoraleRule = 'ACTIVE' | 'PASSIVE' | 'INACTIVE';

/** The daily activity-driven morale drift for one player (upkeep penalties are separate). */
export function computeDailyMoraleDelta(params: {
  lastActiveAt: Date | string | null;
  now?: Date;
}): { delta: number; rule: DailyMoraleRule } {
  const now = params.now ?? new Date();
  const lastActive = params.lastActiveAt ? new Date(params.lastActiveAt) : null;
  const hoursSinceActive = lastActive
    ? (now.getTime() - lastActive.getTime()) / HOUR_MS
    : Number.POSITIVE_INFINITY;
  if (hoursSinceActive < MORALE_ACTIVE_WINDOW_HOURS) {
    return { delta: MORALE_DAILY_ACTIVE_BONUS, rule: 'ACTIVE' };
  }
  if (hoursSinceActive > MORALE_INACTIVE_THRESHOLD_HOURS) {
    return {
      delta: inactiveMoraleDecay(hoursSinceActive / 24),
      rule: 'INACTIVE',
    };
  }
  return { delta: MORALE_DAILY_PASSIVE_RECOVERY, rule: 'PASSIVE' };
}

/** Citizens leaving at this morale level today; whole units only, none below the floor. */
export function citizensDesertionQuantity(citizens: number): number {
  const count = Math.max(0, Math.floor(Number(citizens) || 0));
  if (count < CITIZENS_DESERTION_MIN_POPULATION) return 0;
  return Math.floor(count * CITIZENS_DESERTION_RATE);
}

/**
 * Deserters from the whole trained army today (1% of the total, whole units,
 * at least 1 when the army has 100+ units). Computed on the army total, never
 * per row, so splitting an army into many small stacks cannot evade desertion.
 */
export function armyDesertionQuantity(totalTrainedArmy: number): number {
  const total = Math.max(0, Math.floor(Number(totalTrainedArmy) || 0));
  const base = Math.floor(total * TRAINED_DESERTION_RATE);
  return total >= TRAINED_DESERTION_MIN_ARMY ? Math.max(1, base) : base;
}

/**
 * Splits `totalToTake` across row sizes proportionally (largest-remainder
 * method): every row pays its exact share floored, the leftover units go to
 * the rows with the largest fractional remainders (ties to the earlier row).
 * Never takes a row below 0, and never takes more than the row holds or more
 * than the pool has in total.
 */
export function distributeDesertion(
  rowQuantities: Array<number>,
  totalToTake: number,
): Array<number> {
  const rows = rowQuantities.map((quantity) =>
    Math.max(0, Math.floor(Number(quantity) || 0)),
  );
  const pool = rows.reduce((sum, quantity) => sum + quantity, 0);
  const take = Math.max(
    0,
    Math.min(Math.floor(Number(totalToTake) || 0), pool),
  );
  if (take === 0) return rows.map(() => 0);
  const shares = rows.map((quantity) => (take * quantity) / pool);
  const takes = shares.map((share) => Math.floor(share));
  let leftover = take - takes.reduce((sum, value) => sum + value, 0);
  const byRemainder = rows
    .map((quantity, index) => ({
      index,
      remainder: shares[index] - takes[index],
      capacity: quantity - takes[index],
    }))
    .filter((row) => row.capacity > 0)
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const row of byRemainder) {
    if (leftover <= 0) break;
    takes[row.index] += 1;
    leftover -= 1;
  }
  return takes;
}

/** Army size the desertion floor guarantees the player keeps (75% of the floor). */
export function armyDesertionGuaranteedRemaining(
  desertionFloor: number,
): number {
  return Math.floor(
    Math.max(0, Number(desertionFloor) || 0) * ARMY_DESERTION_FLOOR_SHARE,
  );
}

/** How many trained units may desert today before hitting the 75% floor. */
export function armyDesertionAllowance(
  currentTrainedArmy: number,
  desertionFloor: number,
): number {
  return Math.max(
    0,
    Math.max(0, Math.floor(Number(currentTrainedArmy) || 0)) -
      armyDesertionGuaranteedRemaining(desertionFloor),
  );
}

/**
 * Mercenaries walking out today (10% of all survivors across the kingdom's
 * active contracts, whole units, at least 1 when 10+ survive). Computed on
 * the whole survivor pool, so several small contracts cannot evade the loss.
 */
export function mercenaryDesertionQuantity(totalSurviving: number): number {
  const total = Math.max(0, Math.floor(Number(totalSurviving) || 0));
  const base = Math.floor(total * MERCENARY_DESERTION_RATE);
  return total >= MERCENARY_DESERTION_MIN_SURVIVORS ? Math.max(1, base) : base;
}

/** Splits a day's trained deserters into defectors and abandoners. */
export function splitDefectors(deserters: number): {
  defect: number;
  abandon: number;
} {
  const total = Math.max(0, Math.floor(Number(deserters) || 0));
  const defect = Math.floor(total * DEFECTOR_SHARE);
  return { defect, abandon: total - defect };
}

/** Max units a recipient may still receive from defections today. */
export function defectorRecipientDailyCap(
  recipientTrainedArmy: number,
): number {
  return Math.floor(
    Math.max(0, Math.floor(Number(recipientTrainedArmy) || 0)) *
      DEFECTOR_RECIPIENT_DAILY_CAP_SHARE,
  );
}

/** Defender power multiplier from today's defense pressure (#204): max(0.85, 1 - 0.0025 * pressure). */
export function defenderFatigueMultiplier(
  defensePressureToday: number,
): number {
  const pressure = Math.max(0, Number(defensePressureToday) || 0);
  return Math.max(
    DEFENDER_FATIGUE_MIN_MULTIPLIER,
    1 - DEFENDER_FATIGUE_PER_PRESSURE * pressure,
  );
}

/** The same fatigue expressed as a whole percent power loss, for battle reports. */
export function defenderFatiguePercent(defensePressureToday: number): number {
  return Math.round(
    (1 - defenderFatigueMultiplier(defensePressureToday)) * 100,
  );
}

/**
 * Defense pressure after a repelled attack. Repelling costs stamina too, so
 * the garrison nets the attack's turns minus turns/divisor (i.e.
 * +ceil(turns/2)) pressure, and pressure never drops below its pre-attack
 * value: half the attack is refunded, the pressure earlier attackers built
 * today is not.
 */
export function repelledPressureRecovery(
  currentPressure: number,
  attackTurns: number,
): number {
  const pressure = Math.max(0, Math.floor(Number(currentPressure) || 0));
  const turns = Math.max(0, Math.floor(Number(attackTurns) || 0));
  const netGain =
    turns - Math.floor(turns / DEFENDER_REPELLED_RECOVERY_DIVISOR);
  return Math.max(pressure, pressure + netGain);
}

/** Why a (receiver, loser) pair tripped the defector-farming signal. */
export type DefectorFarmingReason = 'DAYS' | 'SHARE';
/** Mirrors the prisma SignalSeverity enum without importing it (client-safe). */
export type DefectorFarmingSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type DefectorFarmingAssessment = {
  triggered: boolean;
  reasons: DefectorFarmingReason[];
  /** Distinct OT days the receiver collected this loser's defectors. */
  distinctDays: number;
  /** Defectors to the receiver divided by everything the loser lost to desertion. */
  share: number;
  /** Weight rises with days, share and a shared login pattern. */
  score: number;
  severity: DefectorFarmingSeverity;
};

/** Severity for a defector-farming score; untriggered scores read LOW. */
export function defectorFarmingSeverity(
  score: number,
): DefectorFarmingSeverity {
  const weight = Math.max(0, Math.floor(Number(score) || 0));
  return weight >= 7
    ? 'CRITICAL'
    : weight >= 5
      ? 'HIGH'
      : weight >= 3
        ? 'MEDIUM'
        : 'LOW';
}

/**
 * Threshold math for the defector-farming cheat signal (#205). A pair
 * signals when the receiver collected the loser's defectors on
 * DEFECTOR_FARMING_MIN_DAYS or more distinct OT days, OR took at least
 * DEFECTOR_FARMING_MIN_SHARE of everything the loser lost to desertion in
 * the window. A shared login IP/device pattern only ever adds weight — it
 * never triggers a pair on its own. Pure: the daily morale pass feeds it
 * counted rows, never raw database reads.
 */
export function assessDefectorFarming(input: {
  distinctDays: number;
  defectedToReceiver: number;
  totalLostToDesertion: number;
  sharedLoginPattern?: boolean;
}): DefectorFarmingAssessment {
  const days = Math.max(0, Math.floor(Number(input.distinctDays) || 0));
  const received = Math.max(
    0,
    Math.floor(Number(input.defectedToReceiver) || 0),
  );
  const total = Math.max(
    0,
    Math.floor(Number(input.totalLostToDesertion) || 0),
  );
  const share = received > 0 && total > 0 ? received / total : 0;
  const reasons: DefectorFarmingReason[] = [];
  // A day only counts when something was actually collected, so a pair that
  // received nothing can never signal.
  if (received > 0 && days >= DEFECTOR_FARMING_MIN_DAYS) reasons.push('DAYS');
  if (received > 0 && share >= DEFECTOR_FARMING_MIN_SHARE)
    reasons.push('SHARE');
  const triggered = reasons.length > 0;
  let score = 0;
  if (reasons.includes('DAYS'))
    score += 1 + Math.max(0, days - DEFECTOR_FARMING_MIN_DAYS);
  if (reasons.includes('SHARE'))
    score += share >= DEFECTOR_FARMING_DOMINANT_SHARE ? 2 : 1;
  if (triggered && input.sharedLoginPattern) score += 2;
  const severity: DefectorFarmingSeverity = triggered
    ? defectorFarmingSeverity(score)
    : 'LOW';
  return { triggered, reasons, distinctDays: days, share, score, severity };
}
