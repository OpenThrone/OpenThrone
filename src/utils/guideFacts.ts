import { staminaDrainFactor } from '@/constants/ArmyStamina';
import { FEATURE_REQUIREMENTS } from '@/constants/FeatureUnlocks';
import { Fortifications } from '@/constants/Fortifications';
import { DEFENDER_FATIGUE_MIN_MULTIPLIER } from '@/constants/KingdomMorale';
import {
  RACIAL_PERK_TIERS,
  racialFortRequirement,
} from '@/constants/RacialPerks';
import { RUNTIME_SETTING_REGISTRY } from '@/constants/runtimeSettings';
import { EconomyUpgrades, HouseUpgrades } from '@/constants/Structure_Upgrades';
import { ATTACK_TURN_INTERVAL_MINUTES } from '@/constants/Turns';
import { UnitTypes } from '@/constants/Units';
import { levelXPArray } from '@/constants/XPLevels';
import type { RuntimeConfig } from '@/services/RuntimeConfig.service';
import { V5_COMBAT_CONSTANTS } from '@/utils/balance/v5Combat';
import { DEPOSIT_CAP_PERCENT } from '@/utils/bankLimits';
import { DEFAULT_ERA_START_SETTINGS } from '@/utils/eraStartSettings';
import {
  DEFAULT_STAMINA_RULES,
  staminaCost,
  staminaGuideValues,
  type StaminaRules,
} from '@/utils/stamina';

/**
 * Every number the public strategy guides print. Static rules are read from the
 * game constants; the values an admin can tune are read from the live runtime
 * config and fall back to the registry defaults, so the server-rendered page
 * (no config yet) and the hydrated page both match the code.
 */

/** Runtime settings the guides read. */
export type GuideConfig = Partial<
  Pick<
    RuntimeConfig,
    | 'stamina'
    | 'recruitDailyCap'
    | 'protectionDurationDays'
    | 'protectionLevelLimit'
    | 'depositCapPercent'
    | 'attackLevelRange'
    | 'pairDailyLimit'
  >
>;

/** Illustrative worker count used in the income worked example. */
export const GUIDE_EXAMPLE_WORKERS = 100;

const registryDefault = (key: keyof typeof RUNTIME_SETTING_REGISTRY): number =>
  Number(RUNTIME_SETTING_REGISTRY[key].fallback);

const unitCost = (type: string, level = 1): number =>
  UnitTypes.find((unit) => unit.type === type && unit.level === level)?.cost ??
  0;

const unitFortLevel = (name: string): number =>
  UnitTypes.find((unit) => unit.name === name)?.fortLevel ?? 0;

const percent = (share: number): number => Math.round(share * 1000) / 10;

const levelXp = (level: number): number =>
  levelXPArray.find((entry) => entry.level === level)?.xp ?? 0;

export interface GuideFacts {
  start: { gold: number; citizens: number; attackTurns: number };
  turnMinutes: number;
  turnsPerDay: number;
  costs: { worker: number; soldier: number; guard: number; spy: number };
  /** Whole units the starting gold buys of the dearest and cheapest role. */
  startBuys: { workers: number; soldiers: number };
  income: {
    farmPerWorker: number;
    manorPerTurn: number;
    workerPaybackTurns: number;
    workerPaybackHours: number;
    exampleWorkers: number;
    exampleWorkerGold: number;
    examplePerTurn: number;
    examplePerDay: number;
  };
  protection: {
    days: number;
    level: number;
    levelXp: number;
    lossCapPercent: number;
  };
  recruitDailyCap: number;
  housing: {
    baseDaily: number;
    nextDaily: number;
    nextCost: number;
    nextFortLevel: number;
  };
  bank: { capPercent: number; depositsPerDay: number };
  unlocks: {
    knightFortLevel: number;
    knightCost: number;
    /** Economy upgrade indexes (see tables.economy) that open each feature. */
    goldTransferEconomy: number;
    mercenaryHallEconomy: number;
  };
  racial: {
    firstFortLevel: number;
    goblinFirstFortLevel: number;
    firstCost: number;
  };
  combat: {
    maxTurns: number;
    levelRange: number;
    pairDailyLimit: number;
    maxLootPercent: number;
    fortShieldedLootPercent: number;
    woundedPercent: number;
    woundedHealPercent: number;
    fatiguePercent: number;
    stackLossCapPercent: number;
  };
  spy: {
    missionMaxTurns: number;
    intelMaxTurns: number;
    infiltrationMinTurns: number;
    assassinationMinTurns: number;
    intelPerTargetPerDay: number;
  };
  stamina: ReturnType<typeof staminaGuideValues> & {
    enabled: boolean;
    maxDrainReductionPercent: number;
    /** Cost of the same turns spent as separate one-turn attacks. */
    singlesExample: number;
  };
  tables: {
    economy: Array<{
      index: number;
      name: string;
      cost: number;
      fortLevel: number;
      goldPerWorker: number;
      depositsPerDay: number;
    }>;
    housing: Array<{
      index: number;
      name: string;
      cost: number;
      fortLevel: number;
      citizensDaily: number;
    }>;
    fortifications: Array<{
      level: number;
      name: string;
      cost: number;
      goldPerTurn: number;
      hitpoints: number;
    }>;
  };
}

/** Builds the guide numbers from the constants and the (optional) live config. */
export function buildGuideFacts(config: GuideConfig = {}): GuideFacts {
  const startGold = Number(DEFAULT_ERA_START_SETTINGS.gold);
  const workerCost = unitCost('WORKER');
  const soldierCost = unitCost('OFFENSE');
  const farm = EconomyUpgrades[0];
  const manor = Fortifications[0];
  const paybackTurns = farm.goldPerWorker
    ? Math.ceil(workerCost / farm.goldPerWorker)
    : 0;
  const examplePerTurn =
    GUIDE_EXAMPLE_WORKERS * farm.goldPerWorker + manor.goldPerTurn;
  const turnsPerDay = Math.round((24 * 60) / ATTACK_TURN_INTERVAL_MINUTES);
  const level =
    config.protectionLevelLimit ?? registryDefault('era.protectionLevelLimit');
  const rules: StaminaRules = config.stamina ?? DEFAULT_STAMINA_RULES;
  const house0 = HouseUpgrades[0];
  const house1 = HouseUpgrades[1];
  const lootCap = V5_COMBAT_CONSTANTS.MAX_GOLD_PILLAGE_SHARE;

  return {
    start: {
      gold: startGold,
      citizens: DEFAULT_ERA_START_SETTINGS.citizens,
      attackTurns: DEFAULT_ERA_START_SETTINGS.attackTurns,
    },
    turnMinutes: ATTACK_TURN_INTERVAL_MINUTES,
    turnsPerDay,
    costs: {
      worker: workerCost,
      soldier: soldierCost,
      guard: unitCost('DEFENSE'),
      spy: unitCost('SPY'),
    },
    startBuys: {
      workers: workerCost ? Math.floor(startGold / workerCost) : 0,
      soldiers: soldierCost ? Math.floor(startGold / soldierCost) : 0,
    },
    income: {
      farmPerWorker: farm.goldPerWorker,
      manorPerTurn: manor.goldPerTurn,
      workerPaybackTurns: paybackTurns,
      workerPaybackHours: (paybackTurns * ATTACK_TURN_INTERVAL_MINUTES) / 60,
      exampleWorkers: GUIDE_EXAMPLE_WORKERS,
      exampleWorkerGold: GUIDE_EXAMPLE_WORKERS * farm.goldPerWorker,
      examplePerTurn,
      examplePerDay: examplePerTurn * turnsPerDay,
    },
    protection: {
      days:
        config.protectionDurationDays ??
        registryDefault('era.protectionDurationDays'),
      level,
      levelXp: levelXp(level),
      lossCapPercent: percent(V5_COMBAT_CONSTANTS.PROTECTED_LOSS_CAP_SHARE),
    },
    recruitDailyCap:
      config.recruitDailyCap ?? registryDefault('recruit.internalDailyCap'),
    housing: {
      baseDaily: house0.citizensDaily,
      nextDaily: house1.citizensDaily,
      nextCost: house1.cost,
      nextFortLevel: house1.fortLevel,
    },
    bank: {
      capPercent: config.depositCapPercent ?? DEPOSIT_CAP_PERCENT,
      depositsPerDay: farm.depositsPerDay,
    },
    unlocks: {
      knightFortLevel: unitFortLevel('Knight'),
      knightCost: unitCost('OFFENSE', 2),
      goldTransferEconomy: FEATURE_REQUIREMENTS.GOLD_TRANSFER.economyLevel ?? 0,
      mercenaryHallEconomy:
        FEATURE_REQUIREMENTS.MERCENARY_HALL.economyLevel ?? 0,
    },
    racial: {
      firstFortLevel: racialFortRequirement('ELF', 1),
      goblinFirstFortLevel: racialFortRequirement('GOBLIN', 1),
      firstCost: RACIAL_PERK_TIERS[0].cost,
    },
    combat: {
      maxTurns: V5_COMBAT_CONSTANTS.MAX_ATTACK_TURNS,
      levelRange:
        config.attackLevelRange ?? registryDefault('ATTACK_LEVEL_RANGE'),
      pairDailyLimit:
        config.pairDailyLimit ?? registryDefault('combat.pairDailyLimit'),
      maxLootPercent: percent(lootCap),
      fortShieldedLootPercent: percent(
        lootCap * V5_COMBAT_CONSTANTS.FORT_LOOT_CAP_FLOOR_SHARE,
      ),
      woundedPercent: percent(V5_COMBAT_CONSTANTS.WOUNDED_SHARE),
      woundedHealPercent: percent(V5_COMBAT_CONSTANTS.WOUNDED_HEAL_RATE_DAILY),
      fatiguePercent: percent(1 - DEFENDER_FATIGUE_MIN_MULTIPLIER),
      stackLossCapPercent: percent(V5_COMBAT_CONSTANTS.PER_STACK_CASUALTY_CAP),
    },
    spy: {
      missionMaxTurns: V5_COMBAT_CONSTANTS.MAX_SPY_MISSION_TURNS,
      intelMaxTurns: V5_COMBAT_CONSTANTS.MAX_INTEL_TURNS,
      infiltrationMinTurns: V5_COMBAT_CONSTANTS.MIN_INFILTRATION_TURNS,
      assassinationMinTurns: V5_COMBAT_CONSTANTS.MIN_ASSASSINATION_TURNS,
      intelPerTargetPerDay: V5_COMBAT_CONSTANTS.INTEL_MAX_PER_TARGET_PER_DAY,
    },
    stamina: {
      ...staminaGuideValues(rules),
      enabled: rules.enabled,
      singlesExample: staminaCost(1, rules) * staminaGuideValues(rules).turns,
      maxDrainReductionPercent: percent(
        1 - staminaDrainFactor(Number.MAX_SAFE_INTEGER),
      ),
    },
    tables: {
      economy: EconomyUpgrades.map((upgrade) => ({
        index: upgrade.index,
        name: upgrade.name,
        cost: upgrade.cost,
        fortLevel: upgrade.fortLevel,
        goldPerWorker: upgrade.goldPerWorker,
        depositsPerDay: upgrade.depositsPerDay,
      })),
      housing: Object.values(HouseUpgrades).map((upgrade) => ({
        index: upgrade.index,
        name: upgrade.name,
        cost: upgrade.cost,
        fortLevel: upgrade.fortLevel,
        citizensDaily: upgrade.citizensDaily,
      })),
      fortifications: Fortifications.slice(0, 6).map((fort) => ({
        level: fort.level,
        name: fort.name,
        cost: fort.cost,
        goldPerTurn: fort.goldPerTurn,
        hitpoints: fort.hitpoints,
      })),
    },
  };
}
