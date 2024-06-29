'use server';

import {
  getUserById,
  updateUserUnits,
  createAttackLog,
  updateUser,
  createBankHistory,
  canAttack,
} from '@/services/attack.service';
import { Fortifications } from '@/constants';
import prisma from '@/lib/prisma';
import UserModel from '@/models/Users';
import { calculateClandestineStrength, computeSpyCasualties, simulateBattle  } from '@/utils/attackFunctions';
import { SpyUserModel } from '@/models/SpyUser';
import { stringifyObj } from '@/utils/numberFormatting';
import { AssassinationResult, InfiltrationResult, IntelResult } from '@/utils/spyFunctions';
import mtRand from '@/utils/mtrand';


export function simulateIntel(
  attacker: UserModel,
  defender: UserModel,
  spies: number
): any {
  spies = Math.max(1, Math.min(spies, 10));
  
  const fortification = Fortifications.find((fort) => fort.level === defender.fortLevel);
  if (!fortification) {
    return { status: 'failed', message: 'Fortification not found', defender: defender.fortLevel };
  }
  let { fortHitpoints } = defender;
  const isSuccessful = attacker.spy > defender.sentry;
  //const defenderSpyUnit = new SpyUserModel(defender, spies * 10)

  const result = new IntelResult(attacker, defender, spies);
  result.success = isSuccessful;
  result.spiesLost = isSuccessful ? 0 : spies;
  console.log('Intel Is Successful:', isSuccessful, 'Spies:', spies, 'Result:', result, 'Defender:', defender, 'Attacker:', attacker)
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
    const selectedKeysCount = Math.ceil(intelKeys.length * intelPercentage / 100);
    const randomizedKeys = intelKeys.sort(() => 0.5 - Math.random()).slice(0, selectedKeysCount);
    console.log('Random Keys:', randomizedKeys, 'Intel Percentage:', intelPercentage, 'Intel Keys:', intelKeys)

    result.intelligenceGathered = randomizedKeys.reduce((partialIntel, key) => {
      const initPartialIntel = partialIntel ?? {
        offense: 0,
        defense: 0,
        spyDefense: 0,
        spyOffense: 0,
        units: null,
        items: null,
        fortLevel: null,
        fortHitpoints: null,
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
    
export const simulateAssassination = (
  attacker: UserModel,
  defender: UserModel,
  spies: number,
  unit: string
) => {
  const isSuccessful = attacker.spy > defender.sentry;

  const result = new AssassinationResult(attacker, defender, spies, unit);
  result.success = isSuccessful;
  console.log('Assassination Result:', result, 'Is Successful:', isSuccessful, 'Spies:', spies, 'Unit:', unit);
  result.spiesLost = isSuccessful ? 0 : spies;

  if (isSuccessful) {
    //let spiesLost = 0;
    //for (let i = 0; i < spies; i++) {
      const spyRandom = Math.random();
      const { spyStrength: attackerKS, sentryStrength: attackerDS } = calculateClandestineStrength(attacker, 'SPY', 5);
      const { spyStrength: defenderKS, sentryStrength: defenderDS } = calculateClandestineStrength(defender, 'SENTRY', 5);
      
    //}
    //let casualties = 0;
    let defenderUnitCount = () => {
      if (unit === 'OFFENSE') {
        return Math.min(spies * 2, defender.unitTotals.offense);
      }
      if (unit === 'DEFENSE') {
        return Math.min(spies * 2, defender.unitTotals.defense);
      }
      if (unit === 'CITIZEN/WORKERS') {
        return Math.min(spies * 2, (defender.unitTotals.citizens + defender.unitTotals.workers));
      }
      return 0;
    }

    const { attackerCasualties, defenderCasualties } = computeSpyCasualties(attackerKS, attackerDS, defenderKS, defenderDS, spies, defenderUnitCount(), 1, 1);
    result.spiesLost = attackerCasualties;

    // TODO: right now we're maxing at 10 casualities (2*#ofSpies), but we can increase this depending on some other params.
    /*for (let i = 0; i < Math.min(defenderUnitCount(), spies * 2); i++) {
      const defenderRandom = Math.random();
      console.log('Defender Random:', defenderRandom, 'Death Risk Factor:', deathRiskFactor)
      if (defenderRandom > deathRiskFactor) {
        casualties++;
      }
    }*/
    result.unitsKilled = defenderCasualties;
    if (defenderCasualties > 0) {
      let defenderUnitType;
      if (unit !== 'CITIZEN/WORKERS') {
        defenderUnitType = defender.units.find((u) => u.type === unit && u.level === 1);
      } else {
        defenderUnitType = defender.units.find((u) => (u.type === 'WORKER' || u.type === 'CITIZEN') && u.level === 1);
      }
        if (defenderUnitType) {
          defenderUnitType.quantity -= defenderCasualties;
        }
    }
  }
  return result;
}

export const simulateInfiltration =
  (
    attacker: UserModel,
    defender: UserModel,
    spies: number
  ) => {
    const isSuccessful = attacker.spy > defender.sentry;

    const result = new InfiltrationResult(attacker, defender, spies);
    result.success = isSuccessful;
    result.spiesLost = isSuccessful ? 0 : spies;

    if (!isSuccessful) {
      const deathRiskFactor = Math.max(0, 1 - (attacker.spy / defender.sentry));

      let spiesLost = 0;
      for (let i = 0; i < spies; i++) {
        if (Math.random() < deathRiskFactor) {
          spiesLost++;
        }
      }
      result.spiesLost = spiesLost;
      return result
    } else {
      const startHP = result.defender.fortHitpoints;
      for (var i = 1; i <= spies; i++) {
        if (result.defender.fortHitpoints > 0) {
          if (result.attacker.spy / result.defender.sentry <= 0.05)
            result.defender.fortHitpoints -= Math.floor(mtRand(0, 2))
          else if (result.attacker.spy / result.defender.sentry > 0.05 && result.attacker.spy / result.defender.sentry <= 0.5)
            result.defender.fortHitpoints -= Math.floor(mtRand(3, 6));
          else if (result.attacker.spy / result.defender.sentry > 0.5 && result.attacker.spy / result.defender.sentry <= 1.3)
            result.defender.fortHitpoints -= Math.floor(mtRand(6, 16));
          else result.defender.fortHitpoints -= Math.floor(mtRand(12, 24));
          //}
          if (result.defender.fortHitpoints < 0) {
            result.defender.fortHitpoints = 0;
          }
        }
      }
          result.fortDmg += Number(startHP - result.defender.fortHitpoints);
        
      
      return result;
    }
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
      defender.units,
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
      message: 'You have attacked this player too many times in the last 24 hours.',
    }
  }

  const startOfAttack = {
    Attacker: JSON.parse(JSON.stringify(stringifyObj(AttackPlayer))),
    Defender: JSON.parse(JSON.stringify(stringifyObj(DefensePlayer))),
  };

  const battleResults = simulateBattle(
    AttackPlayer,
    DefensePlayer,
    attack_turns
  );

  DefensePlayer.fortHitpoints = battleResults.fortHitpoints;
  
  const isAttackerWinner = battleResults.experienceResult.Result === 'Win';

  AttackPlayer.experience += battleResults.experienceResult.Experience.Attacker;
  DefensePlayer.experience += battleResults.experienceResult.Experience.Defender;
  try {
    const attack_log = await prisma.$transaction(async (prisma) => {
      if (isAttackerWinner) {
        DefensePlayer.gold = BigInt(DefensePlayer.gold) - battleResults.pillagedGold;
        AttackPlayer.gold = BigInt(AttackPlayer.gold) + battleResults.pillagedGold;

        await createBankHistory({
          gold_amount: battleResults.pillagedGold,
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
          pillagedGold: isAttackerWinner ? battleResults.pillagedGold : BigInt(0),
          forthpAtStart: startOfAttack.Defender.fortHitpoints,
          forthpAtEnd: Math.max(DefensePlayer.fortHitpoints, 0),
          xpEarned: {
            attacker: Math.ceil(battleResults.experienceResult.Experience.Attacker),
            defender: Math.ceil(battleResults.experienceResult.Experience.Defender),
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
        fortDmgTotal: startOfAttack.Defender.fortHitpoints - Math.max(DefensePlayer.fortHitpoints, 0),
        BattleResults: battleResults,
      }),
    };
  } catch (error) {
    console.error('Transaction failed: ', error);
    return { status: 'failed', message: 'Transaction failed.' };
  }
}


