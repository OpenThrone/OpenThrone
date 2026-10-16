import type { ItemType, UnitTotalsType, UnitType } from '@/types/typings';
import type { CombatStrengthUser } from '@/utils/combatStrength';

export const CITIZEN_WORKERS_TARGET = 'CITIZEN_WORKERS';

export type SpyRosterUnit = {
  id?: number;
  userId?: number;
  type: UnitType;
  level: number;
  quantity: number;
  isMercenary?: boolean;
};

type SpyInventoryItem = {
  id?: number | string;
  userId?: number;
  usage: string;
  type: ItemType;
  level: number;
  quantity: number;
};

/** Mutable mission rosters; derived model getters are optional, not authoritative. */
export type SpyMissionUser = Omit<
  CombatStrengthUser,
  'units' | 'mercenaries' | 'items'
> & {
  id?: number | string;
  level?: number;
  units: SpyRosterUnit[];
  mercenaries?: SpyRosterUnit[];
  items: SpyInventoryItem[];
  fortHitpoints?: number;
  gold?: bigint | number;
  goldInBank?: bigint | number;
  spy?: number;
  sentry?: number;
  offense?: number;
  defense?: number;
  spyPressureToday?: number;
  unitTotals?: UnitTotalsType;
  spyLimits?: {
    infil: { perMission: number };
    assass: { perMission: number };
  };
};

export type SpyUnitLoss = {
  type: UnitType;
  level: number;
  quantity: number;
  mercenary: boolean;
};

/** Null means unobserved; selected quantities and fields are exact snapshots. */
export type SpyIntelligence = {
  offense: number | null;
  defense: number | null;
  spyOffense: number | null;
  spyDefense: number | null;
  units: SpyRosterUnit[] | null;
  mercenaries: SpyRosterUnit[] | null;
  items: SpyInventoryItem[] | null;
  fortLevel: number | null;
  fortHitpoints: number | null;
  defenseBonus: number | null;
  spyLevel: number | null;
  sentryLevel: number | null;
  gold: bigint | number | null;
  goldInBank: bigint | number | null;
};

class SpyMissionResult {
  spiesSent: number;

  spiesLost = 0;

  success = false;

  turns = 1;

  successProbability = 0;

  probabilityModel = 'LOGISTIC' as const;

  spyLosses: SpyUnitLoss[] = [];

  attackerLevel?: number;

  defenderLevel?: number;

  constructor(
    spiesSent: number,
    attackerLevel?: number,
    defenderLevel?: number,
  ) {
    this.spiesSent = spiesSent;
    this.attackerLevel = attackerLevel;
    this.defenderLevel = defenderLevel;
  }
}

export class AssassinationResult extends SpyMissionResult {
  unitsKilled = 0;

  targetUnit: UnitType | typeof CITIZEN_WORKERS_TARGET;

  experienceGained = 0;

  goldStolen = 0;

  targetLosses: SpyUnitLoss[] = [];

  constructor(
    attacker: SpyMissionUser,
    defender: SpyMissionUser,
    spies: number,
    target: UnitType | typeof CITIZEN_WORKERS_TARGET = CITIZEN_WORKERS_TARGET,
  ) {
    super(spies, attacker.level, defender.level);
    this.targetUnit = target;
  }
}

export class IntelResult extends SpyMissionResult {
  intelPercentage = 0;

  intelligenceGathered: SpyIntelligence | null = null;
}

export class InfiltrationResult extends SpyMissionResult {
  fortDmg = 0;
}
