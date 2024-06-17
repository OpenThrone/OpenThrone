'use server';

import {
  getUserById,
  updateUserUnits,
  createAttackLog,
  updateUser,
  createBankHistory,
  canAttack,
} from '@/services/attack.service';
import { Fortifications, UnitTypes, ItemTypes } from '@/constants';
import prisma from '@/lib/prisma';
import BattleResult from '@/models/BattleResult';
import BattleSimulationResult from '@/models/BattleSimulationResult';
import UserModel from '@/models/Users';
import type { BattleUnits, ItemType, Item, PlayerUnit, UnitType } from '@/types/typings';
import mtRand from '@/utils/mtrand';
import { calculateStrength, computeAmpFactor, calculateLoot, computeUnitFactor, computeCasualties, getKillingStrength, getDefenseStrength, getFortificationBoost, computeDefenseCasualties, computeOffenseCasualties,  } from '@/utils/attackFunctions';
import { SpyUserModel } from '@/models/SpyUser';
import { stringifyObj } from '@/utils/numberFormatting';
import { AssassinationResult, IntelResult } from '@/utils/spyFunctions';

/**
 * Filters an array of BattleUnits by a given type.
 * @param units - The array of BattleUnits to filter.
 * @param type - The type of BattleUnit to filter by.
 * @returns An array of BattleUnits that match the given type.
 */
function filterUnitsByType(units: BattleUnits[], type: string): BattleUnits[] {
  return units.filter((unit) => unit.type === type);
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

export function simulateBattle(
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
    //const fortDefenseBoost = getFortificationBoost(fortHitpoints, fortification);

    const attackerKS = calculateStrength(attacker, 'OFFENSE');
    const defenderDS = calculateStrength(defender, 'DEFENSE');

    const defenderKS = calculateStrength(defender, 'DEFENSE');
    const attackerDS = calculateStrength(attacker, 'OFFENSE');

    const totalPopulation = defender.unitTotals.citizens + defender.unitTotals.workers + defender.unitTotals.defense;
    
    const TargetPop = Math.max(
      (defender.unitTotals.defense / totalPopulation >= 0.25 ? defender.unitTotals.defense : defender.unitTotals.defense + (defender.unitTotals.citizens + defender.unitTotals.workers) * 0.25),
      0
    );
    const CharPop = attacker.unitTotals.offense;
    const AmpFactor = computeAmpFactor(TargetPop);
    const offenseUnits = filterUnitsByType(attacker.units, 'OFFENSE');
    const defenseUnits = filterUnitsByType(defender.units, 'DEFENSE');
    const citizenUnits = filterUnitsByType(defender.units, 'CITIZEN');
    const workerUnits = filterUnitsByType(defender.units, 'WORKER');

    // Calculate the proportion of defense units for the defender
    const defenderDefenseProportion = defender.unitTotals.defense / totalPopulation;

    // Compute casualties for both attacker and defender
    const { attackerCasualties, defenderCasualties } = computeCasualties(
      attackerKS,
      defenderDS,
      defenderKS,
      attackerDS,
      CharPop,
      TargetPop,
      AmpFactor,
      defenderDefenseProportion,
      fortHitpoints,
      defenderDS,
    );

    // Attack fort first
    if (fortHitpoints > 0) {
      //if (defenderCasualties) fortHitpoints -= defenderCasualties;
      //else {
        if (attackerKS / defenderDS <= 0.05)
          fortHitpoints -= Math.floor(mtRand(0, 1));
        if (attackerKS / defenderDS > 0.05 && attackerKS / defenderDS <= 0.5)
          fortHitpoints -= Math.floor(mtRand(0, 3));
        else if (attackerKS / defenderDS > 0.5 && attackerKS / defenderDS <= 1.3)
          fortHitpoints -= Math.floor(mtRand(3, 8));
        else fortHitpoints -= Math.floor(mtRand(6, 12));
      //}
      if (fortHitpoints < 0) {
        fortHitpoints = 0;
      }
    }
    console.log('fortHitpoints: ', fortHitpoints)

    // Distribute casualties among defense units if fort is destroyed
    if (defender.unitTotals.defense / totalPopulation >= 0.25) {
      result.Losses.Defender.units.push(...result.distributeCasualties(defenseUnits, defenderCasualties));
    } else {
      const combinedUnits = [
        ...defenseUnits,
        ...citizenUnits,
        ...workerUnits
      ];
      result.Losses.Defender.units.push(...result.distributeCasualties(combinedUnits, defenderCasualties));
    }

    result.Losses.Attacker.units.push(...result.distributeCasualties(offenseUnits, attackerCasualties));
    // Update total losses
    result.Losses.Defender.total = result.Losses.Defender.units.reduce((sum, unit) => sum + unit.quantity, 0);
    result.Losses.Attacker.total = result.Losses.Attacker.units.reduce((sum, unit) => sum + unit.quantity, 0);

    result.fortHitpoints = Math.floor(fortHitpoints);
    result.turnsTaken = turn;
    result.experienceResult = computeExperience(
      attacker,
      defender,
      attackerKS / (defenderDS ? defenderDS : 1)
    );

    // Breaking the loop if one side has no units left
    if (attacker.unitTotals.offense <= 0) {
      break;
    }
  }
  return result;
}

function simulateIntel(
  attacker: UserModel,
  defender: UserModel,
  spies: number
): any {
  spies = Math.max(1, Math.min(spies, 10));
  
  const fortification = Fortifications.find((fort) => fort.level === defender.fortLevel);
  if (!fortification) {
    return { status: 'failed', message: 'Fortification not found' };
  }
  let { fortHitpoints } = defender;

  
  const isSuccessful = attacker.spy > defender.sentry;
  const defenderSpyUnit = new SpyUserModel(defender, spies * 10)

  const result = new IntelResult(attacker, defender, spies);
  result.success = isSuccessful;
  result.spiesLost = isSuccessful ? 0 : spies;
  
  if (isSuccessful) {
    // Proceed with gathering intelligence
    const deathRiskFactor = Math.max(0, 1 - (attacker.spy / defender.sentry));
    let spiesLost = 0;
    for (let i = 0; i < spies; i++) {
      if (Math.random() < deathRiskFactor) {
        spiesLost++;
      }
    }
    const intelPercentage = Math.min((spies-spiesLost) * 10, 100);
    const intelKeys = Object.keys(new SpyUserModel(defender, (spies - spiesLost) * 10));
    const selectedKeys = intelKeys.slice(0, Math.ceil(intelKeys.length * intelPercentage / 100));
    const randomizedKeys = selectedKeys.sort(() => 0.5 - Math.random());

    result.intelligenceGathered = randomizedKeys.reduce((partialIntel, key) => {
      const initPartialIntel = partialIntel ?? {
        units: null,
        items: null,
        fort_level: null,
        fort_hitpoints: null,
        goldInBank: null,
      };

      if (key === 'units' || key === 'items') {
        const totalTypes = defender[key].length;
        const typesToInclude = Math.ceil(totalTypes * intelPercentage / 100);
        initPartialIntel[key] = defender[key].sort(() => 0.5 - Math.random()).slice(0, typesToInclude);
      } else {
        initPartialIntel[key] = defender[key];
      }
      return initPartialIntel;
    }, result.intelligenceGathered);
  }
  return result;
}
    
function simulateAssassination(
  attacker: UserModel,
  defender: UserModel,
  spies: number,
  unit: string
) {
  const isSuccessful = attacker.spy > defender.sentry;

  const result = new AssassinationResult(attacker, defender, spies, unit);
  result.success = isSuccessful;
  result.spiesLost = isSuccessful ? 0 : spies;

  if (isSuccessful) {

    const deathRiskFactor = Math.max(0, 1 - (attacker.spy / defender.sentry));
    
    let spiesLost = 0;
    for (let i = 0; i < spies; i++) {
      if (Math.random() < deathRiskFactor) {
        spiesLost++;
      }
    }
    let casualties = 0;
    let defenderUnitCount = () => {
      if (unit === 'OFFENSE') {
        return defender.unitTotals.offense;
      }
      if (unit === 'DEFENSE') {
        return defender.unitTotals.defense;
      }
      if (unit === 'CITIZEN/WORKERS') {
        return defender.unitTotals.citizens + defender.unitTotals.workers;
      }
      return 0;
    }

    // TODO: right now we're maxing at 10 casualities (2*#ofSpies), but we can increase this depending on some other params.
    for (let i = 0; i < Math.min(defenderUnitCount(), spies * 2); i++) {
      if (Math.random() < deathRiskFactor) {
        casualties++;
      }
    }
    result.unitsKilled = casualties;
    if (casualties > 0) {
      let defenderUnitType;
      if (unit !== 'CITIZEN/WORKERS') {
        defenderUnitType = defender.units.find((u) => u.type === unit && u.level === 1);
      } else {
        defenderUnitType = defender.units.find((u) => (u.type === 'WORKER' || u.type === 'CITIZEN') && u.level === 1);
      }
        if (defenderUnitType) {
          defenderUnitType.quantity -= casualties;
        }
    }
    result.spiesLost = spiesLost;
  }
  return result;
}

function simulateInfiltration() {
  return {};
}

export async function spyHandler(attackerId: number, defenderId: number, spies: number, type: string, unit?: string) { 
  const attackerUser = await getUserById(attackerId);
  const defenderUser = await getUserById(defenderId);
  const attacker = new UserModel(attackerUser);
  const defender = new UserModel(defenderUser);
  if (!attacker || !defender) {
    return { status: 'failed', message: 'User not found' };
  }
  if (attacker.unitTotals.spies < spies) {
    return { status: 'failed', message: 'Insufficient spies' };
  }

  let spyResults: AssassinationResult | IntelResult;
  if (attacker.spy === 0) {
    return { status: 'failed', message: 'Insufficient Spy Offense' };
  }
  const Winner = attacker.spy > defender.sentry ? attacker : defender;
  let spyLevel = 1;
  if (type === 'INTEL') {
    spyResults = simulateIntel(attacker, defender, spies);
    
  } else if (type === 'ASSASSINATE') {
    spyResults = simulateAssassination(attacker, defender, spies, unit);

    spyLevel = 2;
    await updateUserUnits(defenderId,
      { units: defender.units },
    );
    console.log('done update');
    console.log(defender.unitTotals);
    //return spyResults;
  } else {
    spyResults = simulateInfiltration();
  }

  /*if (spyResults.spiesLost > 0) {
    attacker.units.find((u) => u.type === 'SPY' && u.level === spyLevel).quantity -= spyResults.spiesLost;
  }*/
  

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

  const attack_log = await createAttackLog({
      attacker_id: attackerId,
      defender_id: defenderId,
      timestamp: new Date().toISOString(),
      winner: Winner.id,
      type: type,
      stats: {spyResults},
  });

  return {
    status: 'success',
    result: spyResults,
    attack_log: attack_log.id,
    //attacker: attacker,
    //defender: defender,
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
  const attackerUser = await getUserById(attackerId);
  const defenderUser = await getUserById(defenderId);
  const attacker = new UserModel(attackerUser);
  const defender = new UserModel(defenderUser);
  if (!attacker || !defender) {
    return { status: 'failed', message: 'User not found' };
  }
  if (attacker.attackTurns < attack_turns) {
    return { status: 'failed', message: 'Insufficient attack turns' };
  }

  const AttackPlayer = new UserModel(attackerUser);
  const DefensePlayer = new UserModel(defenderUser);

  if (AttackPlayer.offense <= 0) {
    return {
      status: 'failed',
      message: 'Attack unsuccessful due to negligible offense.',
    };
  }

  if (AttackPlayer.level > DefensePlayer.level + 5 || AttackPlayer.level < DefensePlayer.level - 5) {
    return {
      status: 'failed',
      message: 'You can only attack within 5 levels of your own level.',
    }
  }

  if (await canAttack(AttackPlayer, DefensePlayer) === false) {
    return {
      status: 'failed',
      message: 'You have attacked too many times in the last 24 hours.',
    }
  }

  const startOfAttack = {
    Attacker: JSON.parse(JSON.stringify(stringifyObj(AttackPlayer))),
    Defender: JSON.parse(JSON.stringify(stringifyObj(DefensePlayer))),
  };

  let GoldPerTurn = Number(0.8 / 10);
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
  //const checkPillaged = ((BigInt(Math.round(GoldPerTurn * 10000))) * BigInt(DefensePlayer.gold.toString()) / BigInt(10000)) * BigInt(attack_turns.toString());
  const loot = calculateLoot(attacker, defender, attack_turns);

  /*
  const pillagedGold = checkPillaged < BigInt(DefensePlayer.gold.toString())
    ? checkPillaged
    : BigInt(DefensePlayer.gold.toString());
*/
  const BaseXP = 1000;
  const LevelDifference = DefensePlayer.level - AttackPlayer.level;
  const LevelDifferenceBonus = LevelDifference > 0 ? LevelDifference * 0.05 * BaseXP : 0;
  const FortDestructionBonus = DefensePlayer.fortHitpoints <= 0 ? 0.5 * BaseXP : 0;
  const TurnsUsedMultiplier = attack_turns / 10;
  let XP = BaseXP + LevelDifferenceBonus + FortDestructionBonus;
  XP *= TurnsUsedMultiplier;
  AttackPlayer.experience += (isAttackerWinner ? XP * (75 / 100) : XP * (25 / 100)) + battleResults.experienceResult.Experience.Attacker;
  DefensePlayer.experience += (!isAttackerWinner ? XP * (75 / 100) : XP * (25 / 100)) + battleResults.experienceResult.Experience.Defender;

  try {
    const attack_log = await prisma.$transaction(async (prisma) => {
      if (isAttackerWinner) {
        DefensePlayer.gold = BigInt(DefensePlayer.gold) - loot;
        AttackPlayer.gold = BigInt(AttackPlayer.gold) + loot;

        await createBankHistory({
          gold_amount: loot,
          from_user_id: defenderId,
          from_user_account_type: 'HAND',
          to_user_id: attackerId,
          to_user_account_type: 'HAND',
          date_time: new Date().toISOString(),
          history_type: 'WAR_SPOILS',
        });
      }

      const attack_log = await createAttackLog({
        attacker_id: attackerId,
        defender_id: defenderId,
        timestamp: new Date().toISOString(),
        winner: isAttackerWinner ? attackerId : defenderId,
        stats: {
          startOfAttack,
          endTurns: AttackPlayer.attackTurns,
          offensePointsAtEnd: AttackPlayer.offense,
          defensePointsAtEnd: DefensePlayer.defense,
          pillagedGold: isAttackerWinner ? loot : BigInt(0),
          forthpAtStart: startOfAttack.Defender.fortHitpoints,
          forthpAtEnd: Math.max(DefensePlayer.fortHitpoints, 0),
          xpEarned: {
            attacker: Math.ceil((isAttackerWinner ? XP * (75 / 100) : XP * (25 / 100)) + battleResults.experienceResult.Experience.Attacker),
            defender: Math.ceil((!isAttackerWinner ? XP * (75 / 100) : XP * (25 / 100)) + battleResults.experienceResult.Experience.Defender),
          },
          turns: attack_turns,
          attacker_units: AttackPlayer.units,
          defender_units: DefensePlayer.units,
          attacker_losses: battleResults.Losses.Attacker,
          defender_losses: battleResults.Losses.Defender,
        },
      });

      await updateUser(attackerId, {
        gold: AttackPlayer.gold,
        attack_turns: AttackPlayer.attackTurns - attack_turns,
        experience: Math.ceil(AttackPlayer.experience),
        units: AttackPlayer.units,
      });

      await updateUser(defenderId, {
        gold: DefensePlayer.gold,
        fort_hitpoints: Math.max(DefensePlayer.fortHitpoints, 0),
        units: DefensePlayer.units,
        experience: Math.ceil(DefensePlayer.experience),
      });

      return attack_log;
    });

    return {
      status: 'success',
      result: isAttackerWinner,
      attack_log: attack_log.id,
      extra_variables: stringifyObj({
        loot,
        XP,
        GoldPerTurn,
        levelDifference,
        fortDmgTotal: startOfAttack.Defender.fortHitpoints - Math.max(DefensePlayer.fortHitpoints, 0),
        BattleResults: battleResults,
      }),
    };
  } catch (error) {
    console.error('Transaction failed: ', error);
    return { status: 'failed', message: 'Transaction failed.' };
  }
}


