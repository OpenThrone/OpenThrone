'use server';

import {
  getUserById,
  updateUserUnits,
  createAttackLog,
  updateUser,
  createBankHistory,
  canAttack,
  updateFortHitpoints,
  incrementUserStats,
} from '@/services/attack.service';
import prisma from '@/lib/prisma';
import UserModel from '@/models/Users';
import { simulateBattle } from '@/utils/attackFunctions';
import { stringifyObj } from '@/utils/numberFormatting';
import { AssassinationResult, InfiltrationResult, IntelResult, simulateAssassination, simulateInfiltration, simulateIntel } from '@/utils/spyFunctions';

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

  let spyResults: AssassinationResult | IntelResult | InfiltrationResult;
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
    //return spyResults;
  } else if(type === 'INFILTRATE') {
    spyResults = simulateInfiltration(attacker, defender, spies);
    spyLevel = 3;
    await updateUserUnits(defenderId,
      defender.units,
    );
    await updateFortHitpoints(defenderId, defender.fortHitpoints);

  }
  if (spyResults.spiesLost > 0) {
    await updateUserUnits(attackerId,
      attacker.units,
    );
  }

  const attack_log = await createAttackLog({
    attacker_id: attackerId,
    defender_id: defenderId,
    timestamp: new Date().toISOString(),
    winner: Winner.id,
    type: type,
    stats: { spyResults },
  });

  await incrementUserStats(attackerId, {
    type: 'SPY',
    subtype: (attackerId === Winner.id) ? 'WON' : 'LOST',
  });
  await incrementUserStats(defenderId, {
    type: 'SENTRY',
    subtype: (defenderId === Winner.id) ? 'WON' : 'LOST',
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

  if (!AttackPlayer.canAttack(DefensePlayer.level)) {
    return {
      status: 'failed',
      message: 'You can only attack within 25 levels of your own level.', //TODO: Revert to 5 levels
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

      await incrementUserStats(attackerId, {
        type: 'OFFENSE',
        subtype: (isAttackerWinner) ? 'WON' : 'LOST',
      });

      await incrementUserStats(defenderId, {
        type: 'DEFENSE',
        subtype: (!isAttackerWinner) ? 'WON' : 'LOST',
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


