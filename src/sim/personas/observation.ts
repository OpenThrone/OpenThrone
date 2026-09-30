/**
 * Imperfect-information observation builder (plan Todo 5).
 *
 * Projects the true simulation state into a {@link PersonaObservation} that
 * contains ONLY what a player can actually know: full self state plus
 * public/own-memory intel about opponents. Opponent exact gold, exact unit
 * counts, and exact fort HP are deliberately DROPPED here (or reduced to
 * bands), which is what enforces the "no hidden-data effect" guarantee at
 * the type boundary.
 *
 * The scenario runner (Todo 9) owns a parallel history tracker that supplies
 * the {@link PersonaThreatSignals}; those signals are NOT stored on the base
 * `PlayerState`, preserving the composition-over-bloating rule.
 */

import { EconomyUpgrades } from '../../constants/Structure_Upgrades';
import { calculateRepairCost, getPlayerPower } from '../economy';
import type { ActivityClass, FarmerVariant, Persona } from '../scenarioTypes';
import type { IntelResult, PlayerState } from '../types';
import type {
  FortStatusBand,
  GoldBand,
  PersonaFreshIntelSnapshot,
  PersonaObservation,
  PersonaPublicTargetIntel,
  PersonaSelfObservation,
  PowerBand,
} from './types';

/**
 * Rolling threat/economy signals maintained by the scenario runner in a
 * parallel map keyed by player id. Provided to the builder each tick.
 */
export interface PersonaThreatSignals {
  readonly incomeLastDay: number;
  readonly income7d: number;
  readonly lootGainedLastDay: number;
  readonly loot7d: number;
  readonly workersLostLastDay: number;
  readonly workersAssassinatedLastDay: number;
  readonly workersAssassinated7d: number;
  readonly attacksSufferedLastDay: number;
  readonly attacksSuffered7d: number;
  readonly fortBreachedLast7d: boolean;
  readonly fortBreachDaysAgo: number | null;
  readonly incomingAttackersLast7d: number;
  readonly daysSinceLastThreat: number;
  readonly allianceThreatLevel: number;
}

export interface BuildObservationOptions {
  readonly day: number;
  readonly tick: number;
  readonly ticksPerDay: number;
  readonly attackLevelRange: number;
  readonly currentDay: number;
  /** Era-horizon estimate of remaining productive ticks for payback math. */
  readonly expectedRemainingTicks: number;
  readonly signals: PersonaThreatSignals;
  /** Items/battle-upgrade coverage fraction in [0, 1] (self-visible). */
  readonly coverageFraction: number;
}

const ATTACK_LEVEL_BAND_EDGES: ReadonlyArray<{
  readonly min: number;
  readonly band: PowerBand;
}> = [
  { min: 1.5, band: 'much-weaker' },
  { min: 1.15, band: 'weaker' },
  { min: 0.87, band: 'even' },
  { min: 0.65, band: 'stronger' },
];

function classifyPowerRatio(ratio: number): PowerBand {
  if (!Number.isFinite(ratio) || ratio <= 0) return 'unknown';
  for (const edge of ATTACK_LEVEL_BAND_EDGES) {
    if (ratio >= edge.min) return edge.band;
  }
  return 'much-stronger';
}

function classifyFortStatus(target: PlayerState): FortStatusBand {
  if (target.fortMaxHp <= 0) return 'unknown';
  const integrity = target.fortHp / target.fortMaxHp;
  if (target.fortHp <= 0 || integrity < 0.25) return 'breached';
  if (integrity < 0.7) return 'damaged';
  return 'secure';
}

const GOLD_BAND_EDGES: ReadonlyArray<{
  readonly min: number;
  readonly band: GoldBand;
}> = [
  { min: 2_500_000, band: 'opulent' },
  { min: 750_000, band: 'wealthy' },
  { min: 200_000, band: 'rich' },
  { min: 40_000, band: 'modest' },
];

function classifyGoldBand(
  gold: number,
  level: number,
  freshGoldBand?: GoldBand,
): GoldBand {
  if (freshGoldBand && freshGoldBand !== 'unknown') return freshGoldBand;
  if (!Number.isFinite(gold) || gold < 0) {
    return level <= 4 ? 'poor' : 'modest';
  }
  for (const edge of GOLD_BAND_EDGES) {
    if (gold >= edge.min) return edge.band;
  }
  return 'poor';
}

function intelAgeToFreshness(
  ageDays: number | null,
): PersonaPublicTargetIntel['intelFreshness'] {
  if (ageDays == null) return 'none';
  if (ageDays <= 1) return 'fresh';
  if (ageDays <= 3) return 'decaying';
  return 'expired';
}

function buildFreshIntel(
  cached: IntelResult | undefined,
  attackerPower: number,
): {
  snapshot?: PersonaFreshIntelSnapshot;
  goldBand: GoldBand;
  defenseBand: PowerBand;
} {
  if (!cached?.success || !cached.defenderInfo) {
    return { goldBand: 'unknown', defenseBand: 'unknown' };
  }
  const info = cached.defenderInfo;
  const integrity = info.fortMaxHp > 0 ? info.fortHp / info.fortMaxHp : 0;
  const defensePower =
    info.units.guard * 3 + info.units.archer * 15 + info.units.royalGuard * 40;
  const ratio = attackerPower / Math.max(1, defensePower);
  return {
    snapshot: {
      fortIntegrityFraction: Math.max(0, Math.min(1, integrity)),
      observedDefenseBand: classifyPowerRatio(ratio),
      observedGoldBand: classifyGoldBand(info.gold, 0),
    },
    goldBand: classifyGoldBand(info.gold, 0),
    defenseBand: classifyPowerRatio(ratio),
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function resolveGoldPerWorkerPerTurn(economyLevel: number): number {
  const economy =
    EconomyUpgrades.find((entry) => entry.level === economyLevel) ??
    EconomyUpgrades[0];
  return economy?.goldPerWorker ?? 0;
}

/**
 * Builds the imperfect-information observation for `player`. Reads the
 * player's OWN full state plus `signals`; for every other player reads ONLY
 * public fields (level, power-derived band, fort-status band, gold band) and
 * the player's own spy cache / attack memory. No exact hidden opponent
 * quantity is reachable through the returned observation.
 */
export function buildPersonaObservation(
  player: PlayerState,
  population: ReadonlyArray<PlayerState>,
  persona: Persona,
  farmerVariant: FarmerVariant | undefined,
  activityClass: ActivityClass,
  options: BuildObservationOptions,
): PersonaObservation {
  const attackerPower = getPlayerPower(player);
  const totalWealth = player.gold + player.goldInBank;
  const bankExposure = totalWealth > 0 ? player.gold / totalWealth : 0;
  const repairCost = calculateRepairCost(
    player.fortHp,
    player.fortMaxHp,
    player.fortLevel,
  );

  const self: PersonaSelfObservation = {
    playerId: player.id,
    persona,
    farmerVariant,
    activityClass,
    day: options.day,
    tick: options.tick,
    ticksPerDay: options.ticksPerDay,
    remainingTicksToday: Math.max(0, options.ticksPerDay - options.tick),
    expectedRemainingTicks: Math.max(
      0,
      Math.floor(options.expectedRemainingTicks),
    ),
    gold: player.gold,
    goldInBank: player.goldInBank,
    bankExposure: clamp01(bankExposure),
    attackTurns: player.attackTurns,
    stamina: player.stamina,
    level: player.level,
    citizensAvailable: player.units.citizen,
    units: { ...player.units },
    coverageFraction: clamp01(options.coverageFraction),
    fortLevel: player.fortLevel,
    fortHp: player.fortHp,
    fortMaxHp: player.fortMaxHp,
    spyLevel: player.spyLevel,
    sentryLevel: player.sentryLevel,
    economyLevel: player.economyLevel,
    repairCost: Math.max(0, Math.floor(repairCost)),
    goldPerWorkerPerTurn: resolveGoldPerWorkerPerTurn(player.economyLevel),
    incomeLastDay: options.signals.incomeLastDay,
    income7d: options.signals.income7d,
    lootGainedLastDay: options.signals.lootGainedLastDay,
    loot7d: options.signals.loot7d,
    workersLostLastDay: options.signals.workersLostLastDay,
    workersAssassinatedLastDay: options.signals.workersAssassinatedLastDay,
    workersAssassinated7d: options.signals.workersAssassinated7d,
    attacksSufferedLastDay: options.signals.attacksSufferedLastDay,
    attacksSuffered7d: options.signals.attacksSuffered7d,
    fortBreachedLast7d: options.signals.fortBreachedLast7d,
    fortBreachDaysAgo: options.signals.fortBreachDaysAgo,
    incomingAttackersLast7d: options.signals.incomingAttackersLast7d,
    daysSinceLastThreat: options.signals.daysSinceLastThreat,
    allianceThreatLevel: clamp01(options.signals.allianceThreatLevel),
  };

  const targets: PersonaPublicTargetIntel[] = [];
  for (const target of population) {
    if (target.id === player.id) continue;
    if (target.status === 'defeated') continue;

    const withinAttackRange =
      player.level >= target.level - options.attackLevelRange &&
      player.level <= target.level + options.attackLevelRange;

    const cached = player.intelCache.get(target.id);
    const intelAgeDays =
      cached?.day != null ? Math.max(0, options.currentDay - cached.day) : null;
    const intelFreshness = intelAgeToFreshness(intelAgeDays);
    const fresh = buildFreshIntel(cached, attackerPower);

    const targetPower = getPlayerPower(target);
    const ratio = attackerPower / Math.max(1, targetPower);
    const powerBand = classifyPowerRatio(ratio);
    const fortStatusBand = classifyFortStatus(target);
    const goldBand = classifyGoldBand(
      target.gold,
      target.level,
      fresh.goldBand,
    );

    const targetMemory = player.targetMemory.get(target.id);
    const observedLoot = targetMemory?.lastLoot ?? 0;
    const recentlyAttackedByMe =
      (player.attackHistory.get(target.id)?.length ?? 0) > 0 ||
      (targetMemory?.attacks ?? 0) > 0;
    const attackedMeRecently =
      (player.incomingAttackHistory.get(target.id)?.length ?? 0) > 0;

    const intel: PersonaPublicTargetIntel = {
      targetId: target.id,
      level: target.level,
      withinAttackRange,
      powerBand,
      fortStatusBand,
      goldBand,
      observedLoot,
      intelFreshness,
      recentlyAttackedByMe,
      attackedMeRecently,
      freshIntel: intelFreshness === 'fresh' ? fresh.snapshot : undefined,
    };
    targets.push(intel);
  }

  return { self, targets };
}

export const EMPTY_THREAT_SIGNALS: PersonaThreatSignals = {
  incomeLastDay: 0,
  income7d: 0,
  lootGainedLastDay: 0,
  loot7d: 0,
  workersLostLastDay: 0,
  workersAssassinatedLastDay: 0,
  workersAssassinated7d: 0,
  attacksSufferedLastDay: 0,
  attacksSuffered7d: 0,
  fortBreachedLast7d: false,
  fortBreachDaysAgo: null,
  incomingAttackersLast7d: 0,
  daysSinceLastThreat: 0,
  allianceThreatLevel: 0,
};
