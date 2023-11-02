'use server';

import { Fortifications, UnitTypes, WeaponTypes } from '@/constants';
import prisma from '@/lib/prisma';
import BattleResult from '@/models/BattleResult';
import BattleSimulationResult from '@/models/BattleSimulationResult';
import UserModel from '@/models/Users';
import type { BattleUnits } from '@/types/typings';

/**
 * Generates a random number between the given minimum and maximum values (inclusive).
 * @param min The minimum value of the range.
 * @param max The maximum value of the range.
 * @returns A random number between the given minimum and maximum values (inclusive).
 */
function mtRand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Calculates the killing strength of a user's units.
 * @param user - The user whose units' killing strength will be calculated.
 * @param attacker - A boolean indicating whether the user is the attacker or defender.
 * @returns The total killing strength of the user's units.
 */
function getKillingStrength(user: UserModel, attacker: boolean): number {
  let ks = 0;
  if (attacker) {
    for (const unit of user.units.filter((u) => u.type === 'OFFENSE')) {
      const defense = UnitTypes.find(
        (u) => u.level === unit.level && u.type === unit.type
      );
      for (const defenseItem of user.items.filter(
        (i) => i.type !== 'WEAPON' && i.level === unit.level
      )) {
        const protection = WeaponTypes.find(
          (w) => w.level === defenseItem.level && w.type === defenseItem.type
        );
        if (protection) {
          if (defenseItem.quantity > unit.quantity) {
            ks += protection.bonus * unit.quantity;
            break;
          } else {
            ks += protection.bonus * defenseItem.quantity;
          }
        }
      }
      if (defense) {
        ks += defense.bonus * unit.quantity;
      }
    }
  } else {
    for (const unit of user.units.filter((u) => u.type === 'DEFENSE')) {
      const defense = UnitTypes.find(
        (u) => u.level === unit.level && u.type === unit.type
      );
      for (const defenseItem of user.items.filter(
        (i) => i.type !== 'WEAPON' && i.level === unit.level
      )) {
        const protection = WeaponTypes.find(
          (w) => w.level === defenseItem.level && w.type === defenseItem.type
        );
        if (protection) {
          if (defenseItem.quantity > unit.quantity) {
            ks += protection.bonus * unit.quantity;
            break;
          } else {
            ks += protection.bonus * defenseItem.quantity;
          }
        }
      }
      if (defense) {
        ks += defense.bonus * unit.quantity;
      }
    }
  }
  return ks;
}

/**
 * Calculates the defense strength of a user.
 * @param user - The user for whom to calculate the defense strength.
 * @param defender - A boolean indicating whether the user is a defender or not.
 * @returns The defense strength of the user.
 */
function getDefenseStrength(user: UserModel, defender: boolean): number {
  let ds = 0;
  if (defender) {
    for (const unit of user.units.filter((u) => u.type === 'DEFENSE')) {
      const defense = UnitTypes.find(
        (u) => u.level === unit.level && u.type === unit.type
      );
      for (const defenseItem of user.items.filter(
        (i) => i.type !== 'WEAPON' && i.level === unit.level
      )) {
        const protection = WeaponTypes.find(
          (w) => w.level === defenseItem.level && w.type === defenseItem.type
        );
        if (protection) {
          if (unit.quantity) {
            if (defenseItem.quantity > unit.quantity) {
              ds += protection.bonus * unit.quantity;
              break;
            } else {
              ds += protection.bonus * defenseItem.quantity;
            }
          }
        }
      }
      if (defense) {
        ds += defense.bonus * unit.quantity;
      }
    }
  } else {
    for (const unit of user.units.filter((u) => u.type === 'OFFENSE')) {
      const defense = UnitTypes.find(
        (u) => u.level === unit.level && u.type === unit.type
      );
      for (const defenseItem of user.items.filter(
        (i) => i.type !== 'WEAPON' && i.level === unit.level
      )) {
        const protection = WeaponTypes.find(
          (w) => w.level === defenseItem.level && w.type === defenseItem.type
        );
        if (protection) {
          if (defenseItem.quantity > unit.quantity) {
            ds += protection.bonus * unit.quantity;
            break;
          } else {
            ds += protection.bonus * defenseItem.quantity;
          }
        }
      }
      if (defense) {
        ds += defense.bonus * unit.quantity;
      }
    }
  }
  return ds;
}

/**
 * Computes the amplification factor based on the target population.
 * @param targetPop The target population.
 * @returns The amplification factor.
 */
function computeAmpFactor(targetPop: number): number {
  let ampFactor = 0.4;

  const breakpoints = [
    { limit: 1000, factor: 1.6 },
    { limit: 5000, factor: 1.5 },
    { limit: 10000, factor: 1.35 },
    { limit: 50000, factor: 1.2 },
    { limit: 100000, factor: 0.95 },
    { limit: 150000, factor: 0.75 },
  ];

  for (const bp of breakpoints) {
    if (targetPop <= bp.limit) {
      ampFactor *= bp.factor;
      break;
    }
  }

  return ampFactor;
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
  /*console.log('baseValue: ', baseValue);
  console.log('population: ', population);
  console.log('ampFactor: ', ampFactor);
  console.log('unitFactor: ', unitFactor);*/
  let fortDamageMultiplier = 1;
  let citizenCasualtyMultiplier = 1;

  if (isDefender) {
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

  const fortification = Fortifications[defender.fortLevel];
  let { fortHitpoints } = defender;

  for (let turn = 1; turn <= attackTurns; turn++) {
    // Calculate defense boost from fortifications
    const fortDefenseBoost =
      (fortHitpoints / fortification?.hitpoints) *
      fortification?.defenseBonusPercentage;

    const attackerKS = getKillingStrength(attacker, true);
    const defenderstrength = getDefenseStrength(defender, true);
    const defenderDS =
      defenderstrength * (1 + fortDefenseBoost / 100);

    const defenderKS = getKillingStrength(defender, false);
    const attackerDS = getDefenseStrength(attacker, false);

    console.log('attackerKS: ', attackerKS);
    console.log('defenderDS: ', defenderDS);
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
    console.log('Attacker Cas: ', AttCalcCas);
    console.log('FortHP: ', fortHitpoints);
    console.log('OffenseToDefenseRatio', offenseToDefenseRatio);
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
    if(fortHitpoints === 0){
      fortHitpoints -= Math.floor(mtRand(0, 10));
    }
    console.log('FortHP: ', fortHitpoints);
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

export async function attackHandler(
  attackerId,
  defenderId,
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
        forthpAtEnd: DefensePlayer.fortHitpoints,
        xpEarned: XP + battleResults.experienceResult.Experience.Attacker,
        turns: attack_turns,
        attacker_units: AttackPlayer.units,
        defender_units: DefensePlayer.units,
        // attacker_losses: battleResults.Results.attacker_losses,
        // defender_losses: battleResults.Results.defender_losses
      },
    },
  });

  await prisma.users.update({
    where: { id: attackerId },
    data: {
      gold: AttackPlayer.gold,
      attack_turns: AttackPlayer.attackTurns - attack_turns,
      experience: AttackPlayer.experience,
      units: AttackPlayer.units,
    },
  });
  await prisma.users.update({
    where: { id: defenderId },
    data: {
      gold: DefensePlayer.gold,
      fort_hitpoints: DefensePlayer.fortHitpoints,
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
      // 'fortDamagePercentage': modifiedFortDamagePercentage,
      // 'fortDmg': calculatedFortDmg,
      // 'offenseToDefenseRatio': scaledOffenseToDefenseRatio,
      // 'DmgPerTurn': DmgPerTurn,
      BattleResults: battleResults,
    },
  };
}
