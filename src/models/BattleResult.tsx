import type { BattleUnits } from '@/types/typings';

/** Only public combat state may cross the engine's outcome boundary. */
interface BattleActorInput {
  id?: number | string;
  displayName?: string;
  race?: string;
  class?: string;
  experience?: number;
  level?: number;
  population?: number;
  fortLevel?: number;
  fortHitpoints?: number;
  houseLevel?: number;
  gold?: bigint;
  attackTurns?: number;
  stamina?: number;
  offense?: number;
  defense?: number;
  spy?: number;
  sentry?: number;
  attackBonus?: number;
  defenseBonus?: number;
  spyBonus?: number;
  sentryBonus?: number;
  units?: BattleUnits[];
  mercenaries?: BattleUnits[];
}

interface BattleActorSnapshot extends Omit<
  BattleActorInput,
  'gold' | 'units' | 'mercenaries'
> {
  gold: string;
  units: BattleUnits[];
  mercenaries: BattleUnits[];
}

function captureBattleActor(user: BattleActorInput): BattleActorSnapshot {
  return {
    id: user.id,
    displayName: user.displayName,
    race: user.race,
    class: user.class,
    experience: user.experience,
    level: user.level,
    population: user.population,
    fortLevel: user.fortLevel,
    fortHitpoints: user.fortHitpoints,
    houseLevel: user.houseLevel,
    gold: (user.gold ?? 0n).toString(),
    attackTurns: user.attackTurns,
    stamina: user.stamina,
    offense: user.offense,
    defense: user.defense,
    spy: user.spy,
    sentry: user.sentry,
    attackBonus: user.attackBonus,
    defenseBonus: user.defenseBonus,
    spyBonus: user.spyBonus,
    sentryBonus: user.sentryBonus,
    units: (user.units ?? []).map(
      ({ id, userId, type, level, quantity, isMercenary, currentHP }) => ({
        id,
        userId,
        type,
        level,
        quantity,
        isMercenary,
        currentHP,
      }),
    ),
    mercenaries: (user.mercenaries ?? []).map(
      ({ id, userId, type, level, quantity, isMercenary, currentHP }) => ({
        id,
        userId,
        type,
        level,
        quantity,
        isMercenary,
        currentHP,
      }),
    ),
  };
}

/** A group of recovering units of one type/level. */
interface WoundedUnitGroup {
  type: string;
  level: number;
  quantity: number;
  isMercenary: boolean;
}

/** Models battle result behavior and derived game data. */
class BattleResult {
  attacker: BattleActorSnapshot;

  defender: BattleActorSnapshot;

  fortHitpoints: number;

  turnsTaken: number;

  pillagedGold: bigint;

  experienceGained: { attacker: number; defender: number };

  finalFortHP: number;

  fortDamaged: boolean;

  result: 'WIN' | 'LOSS' | 'UNDECIDED';

  casualtySummary: {
    attacker: Array<{
      type: string;
      level: number;
      quantity: number;
      description: string;
    }>;
    defender: Array<{
      type: string;
      level: number;
      quantity: number;
      description: string;
    }>;
    attackerTotal: number;
    defenderTotal: number;
    fortDamage: number;
    mitigation?: {
      averageMultiplier: number;
      minMultiplier: number;
      maxMultiplier: number;
      samples: number;
    };
    fortBreached?: boolean;
    battleStats?: { attacker: any; defender: any };
    wounded?: {
      attacker: WoundedUnitGroup[];
      defender: WoundedUnitGroup[];
    };
    routedStacks?: BattleResult['routedStacks'];
  };

  mitigationLog: Array<{
    turn: number;
    source: 'ATTACKER' | 'DEFENDER';
    attackType: 'MELEE' | 'RANGED';
    rawDamage: number;
    mitigatedDamage: number;
    fortSoakMultiplier: number;
    mitigationMultiplier: number;
    fortHpStart: number;
    fortHpEnd: number;
    fortHpRatio: number;
    defenderFortLevel?: number;
    defenderFortMitigationPct?: number;
    defenderCasualtyBonusPct?: number;
    defenderStructureMitigationPct?: number;
    totalMitigationPct?: number;
    fortBreached: boolean;
    includeCitz: boolean;
    includeOffense: boolean;
  }>;

  Losses: {
    Attacker: {
      total: number;
      units: BattleUnits[];
    };
    Defender: {
      total: number;
      units: BattleUnits[];
    };
  };

  /** Units removed from rosters but recovering: return via daily healing. */
  wounded: {
    attacker: WoundedUnitGroup[];
    defender: WoundedUnitGroup[];
  };

  /** Stacks that hit the per-battle casualty cap and were forced to withdraw. */
  routedStacks: Array<{
    side: 'Attacker' | 'Defender';
    type: string;
    level: number;
    lost: number;
    initialQuantity: number;
  }>;

  /** Single source of truth for the raid verdict; result/XP/logs derive from it. */
  canonicalOutcome?: {
    winner: 'ATTACKER' | 'DEFENDER';
    reason:
      | 'DEFENSE_WIPED'
      | 'FORT_BREACHED'
      | 'ASSAULT_SUCCEEDED'
      | 'ATTACKER_REPELLED'
      | 'DEFENDER_HELD';
    attackerValueLost: number;
    defenderValueLost: number;
    fortValueDamage: number;
    pillagedGoldValue: number;
    netGainValue: number;
    defenseUnitsBroken: number;
    assaultSucceeded: boolean;
  };

  defenderStats: {
    defenseRemaining: number;
    meleeAtkPower: number;
    meleeDefPower: number;
    rangedAtkPower: number;
    rangedDefPower: number;
  };

  attackerStats: {
    offenseRemaining: number;
    meleeAtkPower: number;
    meleeDefPower: number;
    rangedAtkPower: number;
    rangedDefPower: number;
  };

  constructor(attacker: BattleActorInput, defender: BattleActorInput) {
    this.attacker = captureBattleActor(attacker);
    this.defender = captureBattleActor(defender);
    this.fortHitpoints = 0;
    this.turnsTaken = 0;
    this.pillagedGold = BigInt(0);
    this.experienceGained = { attacker: 0, defender: 0 };
    this.finalFortHP = 0;
    this.fortDamaged = false;
    this.result = 'UNDECIDED'; // Default value, will be set by calculateAndApplyExperience
    this.mitigationLog = [];
    this.wounded = { attacker: [], defender: [] };
    this.routedStacks = [];
    this.Losses = {
      Attacker: {
        total: 0,
        units: [],
      },
      Defender: {
        total: 0,
        units: [],
      },
    };
  }
}

export default BattleResult;
