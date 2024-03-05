'use server';

import { Fortifications, UnitTypes, WeaponTypes } from '@/constants';
import prisma from '@/lib/prisma';
import BattleResult from '@/models/BattleResult';
import BattleSimulationResult from '@/models/BattleSimulationResult';
import UserModel from '@/models/Users';
import type { BattleUnits, ItemType, PlayerItem, PlayerUnit } from '@/types/typings';
import mtRand from '@/utils/mtrand';
import { calculateStrength, computeAmpFactor } from '@/utils/attackFunctions';
import { SpyUserModel } from '@/models/SpyUser';

function getKillingStrength(user: UserModel, attacker: boolean): number {
  return calculateStrength(user, attacker ? 'OFFENSE' : 'DEFENSE');
}

function getDefenseStrength(user: UserModel, defender: boolean): number {
  return calculateStrength(user, defender ? 'DEFENSE' : 'OFFENSE');
}


class IntelResult {
  //attacker: UserModel;
  //defender: UserModel;
  spiesSent: number;
  spiesLost: number;
  success: boolean;
  intelligenceGathered: {
    units: PlayerUnit[] | null;
    items: PlayerItem[] | null;
    fort_level: number | null;
    fort_hitpoints: number | null;
    //gold: number;
    goldInBank: number | null;
  };

  constructor(attacker: UserModel, defender: UserModel, spiesSent: number) {
    //this.attacker = JSON.parse(JSON.stringify(attacker));  // deep copy
    //this.defender = JSON.parse(JSON.stringify(defender));  // deep copy
    this.spiesSent = spiesSent;
    this.spiesLost = 0;
    this.success = false;
    this.intelligenceGathered = {
      units: [],
      items: [],
      fort_level: 0,
      fort_hitpoints: 0,
      //gold: 0,
      goldInBank: 0,
    };
  }
}

/**
 * Computes the unit factor based on the number of units of two opposing sides.
 * @param unitsA - The number of units on side A.
 * @param unitsB - The number of units on side B.
 * @returns The computed unit factor, clamped between 0.5 and 2.0.
 */
function computeUnitFactor(unitsA: number, unitsB: number): number {
  const factor = unitsA / unitsB;
  return Math.min(Math.max(factor, 0.5), 2.0);
}

/**
 * Filters an array of BattleUnits by a given type.
 * @param units - The array of BattleUnits to filter.
 * @param type - The type of BattleUnit to filter by.
 * @returns An array of BattleUnits that match the given type.
 */
function filterUnitsByType(units: BattleUnits[], type: string): BattleUnits[] {
  return units.filter((unit) => unit.type === type);
}

/**
 * Computes the number of casualties based on the given ratio, population, amplification factor, and unit factor.
 * @param ratio - The ratio of attacking units to defending units.
 * @param population - The population of the defending units.
 * @param ampFactor - The amplification factor.
 * @param unitFactor - The unit factor.
 * @returns The number of casualties.
 */
function computeCasualties(
  ratio: number,
  population: number,
  ampFactor: number,
  unitFactor: number,
  fortHitpoints?: number,
  defenderDS?: number,
  isDefender: boolean = false
): number {
  let baseValue: number;
  const randMultiplier = Math.max(
    0,
    mtRand(100000 * ratio - 10, 100000 * ratio - 5) / 100000
  );
  if (isDefender)
  {
    console.log('randMultiplier: ', randMultiplier)
    console.log('ratio: ', ratio);
  }
  
  if (ratio >= 5) {
    baseValue = mtRand(0.0015, 0.0018);
  } else if (ratio >= 4) {
    baseValue = mtRand(0.00115, 0.0013);
  } else if (ratio >= 3) {
    baseValue = mtRand(0.001, 0.00125);
  } else if (ratio >= 2) {
    baseValue = mtRand(0.0009, 0.00105);
  } else if (ratio >= 1) {
    baseValue = mtRand(0.00085, 0.00095);
  } else if (ratio >= 0.5) {
    baseValue = mtRand(0.0005, 0.0006);
  } else {
    baseValue = mtRand(0.0004, 0.00045);
  }
  if (isDefender) {
    console.log('baseValue: ', baseValue);
    console.log('population: ', population);
    console.log('ampFactor: ', ampFactor);
    console.log('unitFactor: ', unitFactor);
    console.log('fortHitpoints: ', fortHitpoints);
  }
  let fortDamageMultiplier = 1;
  let citizenCasualtyMultiplier = 1;

  if (isDefender && fortHitpoints) {
    fortDamageMultiplier = defenderDS === 0 && fortHitpoints > 0 ? 1.5 : 1;
    citizenCasualtyMultiplier = fortHitpoints <= 0 ? 1.5 : 1;
  }
  
  const casualties = Math.round(
    ((baseValue * 100000 * population * ampFactor * unitFactor) / 100000) *
      randMultiplier *
      fortDamageMultiplier *
      citizenCasualtyMultiplier
  );
  return Number.isNaN(casualties) ? 0 : Math.max(0, casualties);
}

/**
 * Distributes casualties among the given units.
 * @param units - An array of BattleUnits to distribute casualties among.
 * @param casualties - The total number of casualties to distribute.
 * @returns The number of casualties that were successfully distributed.
 */
function distributeCasualties(
  units: BattleUnits[],
  casualties: number
): number {
  let distributedCasualties = 0;
  for (const unit of units) {
    const unitCasualties = Math.min(
      unit.quantity,
      casualties - distributedCasualties
    );
    distributedCasualties += unitCasualties;
    unit.quantity -= unitCasualties;

    if (distributedCasualties >= casualties) {
      break;
    }
  }

  return distributedCasualties;
}

function computeExperience(
  attacker: UserModel,
  defender: UserModel,
  offenseToDefenseRatio: number
): BattleSimulationResult {
  const result = new BattleSimulationResult();

  const DefUnitRatio =
    defender.unitTotals.defense / Math.max(defender.population, 1);
  let OffUnitRatio = attacker.unitTotals.offense / attacker.population;
  if (OffUnitRatio > 0.1) {
    OffUnitRatio = 0.1;
  }

  let PhysOffToDefRatio = offenseToDefenseRatio;
  let PhysDefToOffRatio = 1 / PhysOffToDefRatio;
  if (PhysDefToOffRatio < 0.3) {
    PhysDefToOffRatio = 0.3;
  }
  if (PhysOffToDefRatio < 0.3) {
    PhysOffToDefRatio = 0.3;
  }

  const AmpFactor = mtRand(97, 103) / 100;
  console.log('Phys : ', PhysOffToDefRatio);
  if (PhysOffToDefRatio >= 1) {
    // Attacker Wins
    result.Result = 'Win';
    result.Experience.Attacker = Math.round(
      (140 + PhysDefToOffRatio * 220 + OffUnitRatio * 100) * AmpFactor
    );
    result.Experience.Defender = Math.round(
      (20 + PhysDefToOffRatio * 40 + DefUnitRatio * 15) * AmpFactor
    );
  } else {
    // Defender Wins
    result.Result = 'Lost';
    result.Experience.Attacker = Math.round(
      (80 + PhysOffToDefRatio * 50 + OffUnitRatio * 25) * AmpFactor
    );
    result.Experience.Defender = Math.round(
      (30 + PhysOffToDefRatio * 45 + DefUnitRatio * 20) * AmpFactor
    );
  }
  if (PhysOffToDefRatio < 0.33) {
    result.Experience.Attacker = 0;
    result.Experience.Defender = 0;
  }

  return result;
}

function simulateBattle(
  attacker: UserModel,
  defender: UserModel,
  attackTurns: number
): any {
  const result = new BattleResult(attacker, defender);
  // Ensure attack_turns is within [1, 10]
  attackTurns = Math.max(1, Math.min(attackTurns, 10));

  const fortification = Fortifications[defender.fortLevel || 0];
  if (!fortification) {
    return { status: 'failed', message: 'Fortification not found' };
  }
  let { fortHitpoints } = defender;

  for (let turn = 1; turn <= attackTurns; turn++) {
    // Calculate defense boost from fortifications
    const fortDefenseBoost =
      (fortHitpoints / fortification.hitpoints) *
      fortification?.defenseBonusPercentage;

    const attackerKS = getKillingStrength(attacker, true);
    const defenderstrength = getDefenseStrength(defender, true);
    const defenderDS =
      defenderstrength * (1 + fortDefenseBoost / 100);

    const defenderKS = getKillingStrength(defender, false);
    const attackerDS = getDefenseStrength(attacker, false);

    const offenseToDefenseRatio =
      defenderDS === 0 ? 1 : attackerKS / defenderDS;
    const counterAttackRatio = attackerDS === 0 ? 1 : defenderKS / attackerDS;

    const TargetPop = Math.max(
      defender.unitTotals.defense,// + defender.unitTotals.citizens,
      1
    );
    const CharPop = attacker.unitTotals.offense;
    const AmpFactor = computeAmpFactor(TargetPop);

    const offenseUnits = filterUnitsByType(attacker.units, 'OFFENSE');
    const defenseUnits = filterUnitsByType(defender.units, 'DEFENSE');
    const citizenUnits = filterUnitsByType(defender.units, 'CITIZEN');

    const OffUnitFactor = computeUnitFactor(
      defender.unitTotals.defense,
      attacker.unitTotals.offense
    );
    const DefUnitFactor =
      attacker.unitTotals.offense === 0 ? 0 : 1 / OffUnitFactor;

    const DefCalcCas = computeCasualties(
      offenseToDefenseRatio,
      TargetPop,
      AmpFactor,
      DefUnitFactor,
      defender.fortHitpoints,
      defenderDS,
      true
    );

    const AttCalcCas = computeCasualties(
      counterAttackRatio,
      CharPop,
      AmpFactor,
      OffUnitFactor
    );

    // Attack fort first
    if (fortHitpoints > 0) {
      if (DefCalcCas) fortHitpoints -= DefCalcCas;
      else {
        if (offenseToDefenseRatio <= 0.05)
          fortHitpoints -= Math.floor(mtRand(0,1));
        if (offenseToDefenseRatio > 0.05 && offenseToDefenseRatio <= 0.5)
          fortHitpoints -= Math.floor(mtRand(0, 3));
        else if (offenseToDefenseRatio > 0.5 && offenseToDefenseRatio <= 1.3)
          fortHitpoints -= Math.floor(mtRand(3, 8));
        else fortHitpoints -= Math.floor(mtRand(6, 12));
      }
      if (fortHitpoints < 0) {
        fortHitpoints = 0;
      }
    }
    if (fortHitpoints < 0) {
      fortHitpoints = 0;
    }
    
    // Distribute casualties among defense units if fort is destroyed
    result.Losses.Defender.total += distributeCasualties(defenseUnits, DefCalcCas);
    // If all defense units are depleted, attack the citizen units
    if (defenseUnits.every((unit) => unit.quantity === 0)) {
      result.Losses.Defender.total += distributeCasualties(citizenUnits, DefCalcCas);
    }

    result.Losses.Attacker.total += distributeCasualties(offenseUnits, AttCalcCas);

    result.fortHitpoints = Math.floor(fortHitpoints);
    result.turnsTaken = turn;
    result.experienceResult = computeExperience(
      attacker,
      defender,
      offenseToDefenseRatio
    );

    // Update attacker and defender models with the calculated experience
    attacker.experience += result.experienceResult.Experience.Attacker;
    defender.experience += result.experienceResult.Experience.Defender;

    // Breaking the loop if one side has no units left
    if (attacker.unitTotals.offense <= 0) {
      break;
    }
  }
  return result;
}
function getSentryStrength(user: UserModel, spies:number): number {
  let strength = 0;
  let numSentries = 0;
  const sentryUnits = user.units.find((u) => u.type === 'SENTRY' && u.level === 1);
  if (sentryUnits) {
    numSentries = Math.min(sentryUnits.quantity, spies);
    if (numSentries === 0) 
      return 0;
    const unitType = UnitTypes.find((unitType) => unitType.type === sentryUnits.type && unitType.level === 1);
    if (unitType) {
      strength += unitType.bonus * numSentries;
    }
    const sentryWeapons = user.items.filter((item) => item.type === 'WEAPON' && item.usage === sentryUnits.type.toString() && item.level === 1);
    if (sentryWeapons) {
      sentryWeapons.forEach((item) => {
        const bonus = WeaponTypes.find((w) => w.level === item.level && w.usage === item.usage && w.type === item.type);
        strength += bonus?.bonus * Math.min(item.quantity, numSentries);
      });
    }
  }
  return strength;
}

function getSpyStrength(user: UserModel, attacker: boolean, spies: number): number {
  let strength = 0;
  let numSpies = 0;
  const spyUnits = user.units.find((u) => (attacker ? u.type === 'SPY' : u.type === 'SENTRY') && u.level === 1);
  if (spyUnits) {
    numSpies = Math.min(spyUnits.quantity, spies);
    const unitType = UnitTypes.find((unitType) => unitType.type === spyUnits.type && unitType.level === 1);
    if (unitType) {
      strength += unitType.bonus * numSpies;
    }
    const spyWeapons = user.items.filter((item) => item.type === 'WEAPON' && item.usage === spyUnits.type.toString() && item.level === 1);
    spyWeapons.forEach((item) => {
      const bonus = WeaponTypes.find((w) => w.level === item.level && w.usage === item.usage && w.type === item.type);
      strength += bonus?.bonus * Math.min(item.quantity, numSpies);
    });
  }
  return strength;
}
function simulateIntel(
  attacker: UserModel,
  defender: UserModel,
  spies: number
): any {
  //const result = new BattleResult(attacker, defender);
  // Ensure attack_turns is within [1, 10]
  spies = Math.max(1, Math.min(spies, 10));
  const fortification = Fortifications[defender.fortLevel];
  if (!fortification) {
    return { status: 'failed', message: 'Fortification not found' };
  }
  let { fortHitpoints } = defender;

  for (let turn = 1; turn <= spies; turn++) {
    // Calculate defense boost from fortifications
    const fortDefenseBoost =
      (fortHitpoints / fortification?.hitpoints) *
      fortification?.defenseBonusPercentage;

    const attackerKS = getSpyStrength(attacker, true, spies);
    console.log('attackerKS: ', attackerKS);
    console.log('FortDefenseBoost: ', fortDefenseBoost);
    const defenderstrength = getSentryStrength(defender, spies);
    const defenderDS =
      defenderstrength * (1 + fortDefenseBoost / 100);
    console.log('defenderDS: ', defenderDS);
    console.log('defenderStrength: ', defenderstrength);
    const offenseToDefenseRatio =
      defenderDS === 0 ? 1 : attackerKS / defenderDS;
    const counterAttackRatio = attackerKS === 0 ? 1 : defenderDS / attackerKS;
    console.log('offenseToDefenseRatio: ', offenseToDefenseRatio);
    //const counterAttackRatio = attackerDS === 0 ? 1 : defenderKS / attackerDS;

    const TargetPop = Math.max(
      defender.unitTotals.sentries,// + defender.unitTotals.citizens,
      0
    );
    const CharPop = Math.max(
      attacker.unitTotals.spies,
      1
    );
    console.log('TargetPop: ', TargetPop);
    console.log('CharPop: ', CharPop);
    const AmpFactor = computeAmpFactor(TargetPop);
    console.log('AmpFactor: ', AmpFactor);

    const OffUnitFactor = computeUnitFactor(
      defender.unitTotals.defense,
      attacker.unitTotals.offense
    );
    const DefUnitFactor =
      attacker.unitTotals.offense === 0 ? 0 : 1 / OffUnitFactor;

    const DefCalcCas = computeCasualties(
      offenseToDefenseRatio,
      TargetPop,
      AmpFactor,
      DefUnitFactor,
      defender.fortHitpoints,
      defenderDS,
      true
    );

    const AttCalcCas = computeCasualties(
      counterAttackRatio,
      CharPop,
      AmpFactor,
      OffUnitFactor
    );

    console.log('DefCalcCas: ', DefCalcCas);
    console.log('AttCalcCas: ', AttCalcCas);

    //Distribution of casualties

    // Breaking the loop if one side has no units left
    if (attacker.unitTotals.offense <= 0) {
      break;
    }
  }
  const isSuccessful = attacker.spy > defender.sentry;
  const defenderSpyUnit = new SpyUserModel(defender, spies * 10)

  const result: IntelResult = {
    success: isSuccessful,
    //attacker: attacker,
    //defender: defender,
    spiesSent: spies,
    spiesLost: isSuccessful ? 0 : spies,
    intelligenceGathered: defenderSpyUnit
  };

  if (isSuccessful) {
    const intelPercentage = Math.min(spies * 10, 100);
    const intelKeys = Object.keys(new SpyUserModel(defender, spies * 10));
    const selectedKeys = intelKeys.slice(0, Math.ceil(intelKeys.length * intelPercentage / 100));
    // Randomize the order of selected keys
    const randomizedKeys = selectedKeys.sort(() => 0.5 - Math.random());

    result.intelligenceGathered = randomizedKeys.reduce((partialIntel, key) => {
      if (key === 'units' || key === 'items') {
        // Determine the number of unit/item types to include
        const totalTypes = defender[key].length;
        const typesToInclude = Math.ceil(totalTypes * intelPercentage / 100);

        // Randomly select the unit/item types to include
        const selectedTypes = defender[key]
          .sort(() => 0.5 - Math.random()) // Shuffle array
          .slice(0, typesToInclude); // Take the first N types

        // Include the selected types with their full quantities
        partialIntel[key] = selectedTypes;
      } else {
        partialIntel[key] = defender[key];
      }
      return partialIntel;
    }, {});
  }
  return result;
}
    
function simulateAssassination() {
  return {}
}

function simulateInfiltration() {
  return {};
}

export async function spyHandler(attackerId: number, defenderId: number, spies: number, type: string) { 
  const attacker: UserModel = new UserModel(await prisma?.users.findUnique({
    where: { id: attackerId },
  }));
  const defender: UserModel = new UserModel(await prisma?.users.findUnique({
    where: { id: defenderId },
  }));
  if (!attacker || !defender) {
    return { status: 'failed', message: 'User not found' };
  }
  if (attacker.unitTotals.spies < spies) {
    return { status: 'failed', message: 'Insufficient spies' };
  }

  let spyResults = {}
  console.log('type: ', type)
  if (attacker.spy === 0) {
    return { status: 'failed', message: 'Insufficient Spy Offense' };
  }
  const Winner = attacker.spy > defender.sentry ? attacker : defender;
 
  if (type === 'INTEL') {
    spyResults = simulateIntel(attacker, defender, spies);
  } else if (type === 'ASSASSINATION') {
    spyResults = simulateAssassination();
  } else {
    spyResults = simulateInfiltration();
  }
  console.log('Winner: ', Winner.displayName)
  console.log('spyResults: ', spyResults)
  //AttackPlayer.spies -= spies;
  //AttackPlayer.experience += spyResults.experienceResult.Experience.Attacker;
  //AttackPlayer.gold += spyResults.goldStolen;
  //AttackPlayer.units = spyResults.units;

  /*await prisma.users.update({
    where: { id: attackerId },
    data: {
      gold: AttackPlayer.gold,
      experience: AttackPlayer.experience,
      units: AttackPlayer.units,
    },
  });*/

  return {
    status: 'success',
    result: spyResults,
    attacker: attacker,
    defender: defender,
    extra_variables: {
      spies,
      spyResults,
    },
  };
}

export async function attackHandler(
  attackerId: number,
  defenderId: number,
  attack_turns: number
) {
  const attacker: UserModel = await prisma?.users.findUnique({
    where: { id: attackerId },
  });
  const defender: UserModel = await prisma?.users.findUnique({
    where: { id: defenderId },
  });
  if (!attacker || !defender) {
    return { status: 'failed', message: 'User not found' };
  }
  if (attacker.attackTurns < attack_turns) {
    return { status: 'failed', message: 'Insufficient attack turns' };
  }

  const AttackPlayer = new UserModel(attacker);
  const DefensePlayer = new UserModel(defender);

  // Check if attacker's offense is negligible
  if (AttackPlayer.offense <= 0) {
    return {
      status: 'failed',
      message: 'Attack unsuccessful due to negligible offense.',
    };
  }

  const startOfAttack = {
    Attacker: JSON.parse(JSON.stringify(AttackPlayer)),
    Defender: JSON.parse(JSON.stringify(DefensePlayer)),
  };

  let GoldPerTurn = 0.8 / 10;

  const levelDifference = DefensePlayer.level - AttackPlayer.level;
  switch (levelDifference) {
    case 0:
      GoldPerTurn *= 0.05;
      break;
    case 1:
      GoldPerTurn *= 0.15;
      break;
    case 2:
      GoldPerTurn *= 0.35;
      break;
    case 3:
      GoldPerTurn *= 0.55;
      break;
    case 4:
      GoldPerTurn *= 0.75;
      break;
    default:
      if (levelDifference >= 5) GoldPerTurn *= 0.95;
      break;
  }
  const battleResults = simulateBattle(
    AttackPlayer,
    DefensePlayer,
    attack_turns
  );

  DefensePlayer.fortHitpoints = battleResults.fortHitpoints;

  if (DefensePlayer.fortHitpoints <= 0) {
    GoldPerTurn *= 1.05;
  }
  const isAttackerWinner = battleResults.experienceResult.Result === 'Win';
  
  const pillagedGold = Math.floor(Math.min(
    GoldPerTurn * DefensePlayer.gold * attack_turns,
    DefensePlayer.gold
    )
  );
  const BaseXP = 1000;
  const LevelDifference = DefensePlayer.level - AttackPlayer.level;
  const LevelDifferenceBonus =
    LevelDifference > 0 ? LevelDifference * 0.05 * BaseXP : 0;
  const FortDestructionBonus =
    DefensePlayer.fortHitpoints <= 0 ? 0.5 * BaseXP : 0;
  const TurnsUsedMultiplier = attack_turns / 10;

  let XP = BaseXP + LevelDifferenceBonus + FortDestructionBonus;
  XP *= TurnsUsedMultiplier;

  AttackPlayer.experience += XP;
  if (isAttackerWinner) {
    DefensePlayer.gold -= pillagedGold;
    AttackPlayer.gold += pillagedGold;

    await prisma.bank_history.create({
      data: {
        gold_amount: pillagedGold,
        from_user_id: defenderId,
        from_user_account_type: 'HAND',
        to_user_id: attackerId,
        to_user_account_type: 'HAND',
        date_time: new Date().toISOString(),
        history_type: 'WAR_SPOILS',
      },
    });
  }
  const attack_log = await prisma.attack_log.create({
    data: {
      attacker_id: attackerId,
      defender_id: defenderId,
      timestamp: new Date().toISOString(),
      winner: isAttackerWinner ? attackerId : defenderId,
      stats: {
        startOfAttack,
        // startTurns: startTurns,
        endTurns: AttackPlayer.attackTurns,
        offensePointsAtEnd: AttackPlayer.offense,
        defensePointsAtEnd: DefensePlayer.defense,
        pillagedGold: isAttackerWinner ? pillagedGold : 0,
        // fortDamage: calculatedFortDmg,
        forthpAtStart: startOfAttack.Defender.fortHitpoints,
        forthpAtEnd: Math.max(DefensePlayer.fortHitpoints, 0),
        xpEarned: XP + battleResults.experienceResult.Experience.Attacker,
        turns: attack_turns,
        attacker_units: AttackPlayer.units,
        defender_units: DefensePlayer.units,
        attacker_losses: battleResults.Losses.Attacker,
        defender_losses: battleResults.Losses.Defender
      },
    },
  });

  await prisma.users.update({
    where: { id: attackerId },
    data: {
      gold: AttackPlayer.gold,
      attack_turns: AttackPlayer.attackTurns - attack_turns,
      experience: startOfAttack.Attacker.experience + (XP + battleResults.experienceResult.Experience.Attacker),
      units: AttackPlayer.units,
    },
  });
  await prisma.users.update({
    where: { id: defenderId },
    data: {
      gold: DefensePlayer.gold,
      fort_hitpoints: Math.max(DefensePlayer.fortHitpoints, 0),
      units: DefensePlayer.units,
    },
  });

  return {
    status: 'success',
    result: isAttackerWinner,
    attacker: AttackPlayer,
    defender: DefensePlayer,
    attack_log: attack_log.id,
    extra_variables: {
      pillagedGold,
      XP,
      GoldPerTurn,
      levelDifference,
      'fortDmgTotal': startOfAttack.Defender.fortHitpoints - (Math.max(DefensePlayer.fortHitpoints, 0)),
      // 'fortDamagePercentage': modifiedFortDamagePercentage,
      // 'fortDmg': calculatedFortDmg,
      // 'offenseToDefenseRatio': scaledOffenseToDefenseRatio,
      // 'DmgPerTurn': DmgPerTurn,
      BattleResults: battleResults,
    },
  };
}
