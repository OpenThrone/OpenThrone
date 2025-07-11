'use server';

import type { UnitType } from '@/types/typings';
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
import { calculateStrength, simulateBattle } from '@/utils/attackFunctions';
//import { simulateBattleV2 } from '@/utils/attackFunctionsv2';
import { stringifyObj } from '@/utils/numberFormatting';
import { AssassinationResult, InfiltrationResult, IntelResult, simulateAssassination, simulateInfiltration, simulateIntel } from '@/utils/spyFunctions';
import { logDebug, logError } from '@/utils/logger';
import { deepClone } from '@/utils/utilities';

/**
 * Handles spy missions (Intel, Assassinate, Infiltrate) between two users.
 * @param attackerId - The ID of the attacking user.
 * @param defenderId - The ID of the defending user.
 * @param spies - The number of spies sent on the mission.
 * @param type - The type of spy mission ('INTEL', 'ASSASSINATE', 'INFILTRATE').
 * @param unit - (Optional) The specific unit type targeted for assassination (UnitType or "CITIZEN_WORKERS").
 * @returns An object indicating the status ('success' or 'failed'), results, and attack log ID.
 */
export async function spyHandler(attackerId: number, defenderId: number, spies: number, type: string, unit?: UnitType | "CITIZEN_WORKERS") {
  logDebug('Spy mission initiated', { attackerId, defenderId, spies, type, unit });
  const attackerUser = await getUserById(attackerId);
  const defenderUser = await getUserById(defenderId);
  const attacker = new UserModel(attackerUser);
  const defender = new UserModel(defenderUser);
  if (!attacker || !defender) {
    return { status: 'failed', message: 'User not found', code: 'USER_NOT_FOUND' };
  }
  if (attacker.unitTotals.spies < spies) {
    return { status: 'failed', message: 'Insufficient spies', code: 'INSUFFICIENT_SPIES' };
  }

  let spyResults: AssassinationResult | IntelResult | InfiltrationResult;
  if (attacker.spy === 0) {
    return { status: 'failed', message: 'Insufficient Spy Offense', code: 'INSUFFICIENT_SPY_OFFENSE' };
  }
  const Winner = attacker.spy > defender.sentry ? attacker : defender;
  logDebug('Spy mission winner determined', { winnerId: Winner.id, attackerSpy: attacker.spy, defenderSentry: defender.sentry });
  try {
    const prismaTx = await prisma.$transaction(async (tx) => {
      if (type === 'INTEL') {
        spyResults = simulateIntel(attacker, defender, spies);
      } else if (type === 'ASSASSINATE') {
        if (attacker.units.find((u) => u.type === 'SPY' && u.level === 3) === undefined || attacker.units.find((u) => u.type === 'SPY' && u.level === 2).quantity < spies) {
          logError('Insufficient Assassins');
          return { status: 'failed', message: 'Insufficient Assassins' };
        }
        spyResults = simulateAssassination(attacker, defender, spies, unit);

        await updateUserUnits(defenderId,
          defender.units,
          tx
        );
      } else if (type === 'INFILTRATE') {
        spyResults = simulateInfiltration(attacker, defender, spies);
        await updateUserUnits(defenderId,
          defender.units,
          tx
        );
        await updateFortHitpoints(defenderId, defender.fortHitpoints, tx);

      }

      logDebug('Check if spies are lost', { spiesLost: spyResults.spiesLost });
      if (spyResults.spiesLost > 0) {
        logDebug('Updating attacker units after spy mission', { attackerId, spiesLost: spyResults.spiesLost });
        await updateUserUnits(attackerId,
          attacker.units,
          tx);
      }

      const attack_log = await createAttackLog({
        timestamp: new Date().toISOString(),
        winner: Winner.id,
        type: type,
        // Stringify complex results for JSON storage
        stats: { spyResults: stringifyObj(spyResults) },
        // Connect to users via relation fields instead of setting IDs directly
        attackerPlayer: { connect: { id: attackerId } },
        defenderPlayer: { connect: { id: defenderId } },
      }, tx);
      logDebug('Attack log created', { attackLogId: attack_log.id });

      await incrementUserStats(attackerId, {
        type: 'SPY',
        subtype: (attackerId === Winner.id) ? 'WON' : 'LOST',
      }, tx);
      logDebug('Incremented attacker stats', { attackerId, subtype: (attackerId === Winner.id) ? 'WON' : 'LOST' });
      await incrementUserStats(defenderId, {
        type: 'SENTRY',
        subtype: (defenderId === Winner.id) ? 'WON' : 'LOST',
      }, tx);
      logDebug('Incremented defender stats', { defenderId, subtype: (defenderId === Winner.id) ? 'WON' : 'LOST' });

      return {
        status: 'success',
        result: spyResults,
        attack_log: attack_log.id,
        extra_variables: {
          spies,
          spyResults,
        },
      };
    });
    return prismaTx;
  } catch (ex) {
    logError('Transaction failed: ', ex);
    return { status: 'failed', message: 'Transaction failed.', code: 'TRANSACTION_FAILED' };
  }
}

/**
 * Handles standard attacks between two users.
 * @param attackerId - The ID of the attacking user.
 * @param defenderId - The ID of the defending user.
 * @param attack_turns - The number of attack turns to use.
 * @returns An object indicating the status ('success' or 'failed'), results, and attack log ID.
 */
export async function attackHandler(
  attackerId: number,
  defenderId: number,
  attack_turns: number
) {
  const attackerUser = await getUserById(attackerId);
  const defenderUser = await getUserById(defenderId);
  const attacker = new UserModel(attackerUser);
  const defender = new UserModel(defenderUser);

  if(process.env.NEXT_PUBLIC_ENABLE_ATTACKING === 'false') {
    return { status: 'failed', message: 'Attacking is currently disabled.', code: 'ATTACKING_DISABLED' };
  }
  logDebug('Attack initiated', { attackerId, defenderId, attack_turns });
  // Check if both users exist and if the attacker has enough attack turns
  if (!attacker || !defender) {
    return { status: 'failed', message: 'User not found', code: 'USER_NOT_FOUND' };
  }
  if (attacker.attackTurns < attack_turns) {
    return { status: 'failed', message: 'Insufficient attack turns', code: 'INSUFFICIENT_ATTACK_TURNS' };
  }

  const AttackPlayer = new UserModel(attackerUser);
  const DefensePlayer = new UserModel(defenderUser);

  // Enhanced strength calculation with unit-item allocation and battle upgrades
  const { killingStrength: attackerOffenseKS, defenseStrength: attackerOffenseDS } = calculateStrength(
    AttackPlayer,
    'OFFENSE',
    false
  );

  if (attackerOffenseKS <= 0) {
    return {
      status: 'failed',
      message: 'Attack unsuccessful due to negligible offense.',
      code: 'NEGLIGIBLE_OFFENSE',
    };
  }

  if (!AttackPlayer.canAttack(DefensePlayer.level)) {
    return {
      status: 'failed',
      message: `You can only attack within ${process.env.NEXT_PUBLIC_ATTACK_LEVEL_RANGE} levels of your own level.`,
      code: 'LEVEL_RANGE_EXCEEDED',
    }
  }

  if (await canAttack(AttackPlayer, DefensePlayer) === false) {
    return {
      status: 'failed',
      message: 'You have attacked this player too many times in the last 24 hours.',
      code: 'TOO_MANY_ATTACKS',
    }
  }

  const startOfAttack = {
    Attacker: stringifyObj(deepClone(AttackPlayer)),
    Defender: stringifyObj(deepClone(DefensePlayer)),
  };

  // Enhanced battle simulation with all factors
  /*const battleResults = (process.env.NEXT_PUBLIC_ATTACK_VERSION === '2' ? await simulateBattleV2(
    AttackPlayer,
    DefensePlayer,
    attack_turns
  ) :*/ const battleResults = await simulateBattle(
    AttackPlayer,
    DefensePlayer,
    DefensePlayer.fortHitpoints,
    attack_turns
  )//);


  DefensePlayer.fortHitpoints -= (startOfAttack.Defender.fortHitpoints - battleResults.finalFortHP);

  const isAttackerWinner = battleResults.result === 'WIN';

  AttackPlayer.experience += battleResults.experienceGained.attacker;
  DefensePlayer.experience += battleResults.experienceGained.defender;

  try {
    const attack_log = await prisma.$transaction(async (tx) => {
      if (isAttackerWinner) {
        DefensePlayer.gold = BigInt(DefensePlayer.gold) - BigInt(battleResults.pillagedGold.toString());
        AttackPlayer.gold = BigInt(AttackPlayer.gold) + BigInt(battleResults.pillagedGold.toString());
      }

      const attack_log = await createAttackLog({        timestamp: new Date().toISOString(),
        winner: isAttackerWinner ? attackerId : defenderId,
        stats: {
          startOfAttack,
          endTurns: AttackPlayer.attackTurns,
          offensePointsAtEnd: attackerOffenseKS,
          defensePointsAtEnd: DefensePlayer.defense,
          // Convert BigInt to string for JSON compatibility
          pillagedGold: isAttackerWinner ? battleResults.pillagedGold.toString() : '0',
          forthpAtStart: startOfAttack.Defender.fortHitpoints,
          forthpAtEnd: Math.max(DefensePlayer.fortHitpoints, 0),
          // Stringify potentially complex objects within stats
          xpEarned: JSON.stringify(battleResults.experienceGained),
          turns: attack_turns,
          attacker_units: JSON.stringify(AttackPlayer.units),
          defender_units: JSON.stringify(DefensePlayer.units),
          attacker_losses: JSON.stringify(battleResults.Losses.Attacker),
          defender_losses: JSON.stringify(battleResults.Losses.Defender),
        },
        // Connect to users via relation fields
        attackerPlayer: { connect: { id: attackerId } },
        defenderPlayer: { connect: { id: defenderId } },
      }, tx);

      if (isAttackerWinner) {
        // Ensure gold_amount is passed as primitive bigint or number
        const goldAmount = typeof battleResults.pillagedGold === 'bigint'
            ? battleResults.pillagedGold
            : BigInt(battleResults.pillagedGold.toString()); // Convert BigInt object or number to primitive bigint
        await createBankHistory({
          gold_amount: goldAmount,
          from_user_id: defenderId,
          from_user_account_type: 'HAND',
          to_user_id: attackerId,
          to_user_account_type: 'HAND',
          date_time: new Date().toISOString(),
          history_type: 'WAR_SPOILS',
          stats: { type: 'ATTACK', attackID: attack_log.id },
        }, tx);
      }

      await incrementUserStats(attackerId, {
        type: 'OFFENSE',
        subtype: (isAttackerWinner) ? 'WON' : 'LOST',
      }, tx);

      await incrementUserStats(defenderId, {
        type: 'DEFENSE',
        subtype: (!isAttackerWinner) ? 'WON' : 'LOST',
      }, tx);

      // Recalculate final stats for both players after casualties
      const { killingStrength: finalAttackerKS, defenseStrength: finalAttackerDS } = calculateStrength(
        AttackPlayer,
        'OFFENSE',
        false,
      );
      const newAttOffense = AttackPlayer.getArmyStat('OFFENSE')
      const newAttDefense = AttackPlayer.getArmyStat('DEFENSE')
      const newAttSpying = AttackPlayer.getArmyStat('SPY')
      const newAttSentry = AttackPlayer.getArmyStat('SENTRY')

      const { killingStrength: finalDefenderKS, defenseStrength: finalDefenderDS } = calculateStrength(
        DefensePlayer,
        'DEFENSE',
        false,
      );
      const newDefOffense = DefensePlayer.getArmyStat('OFFENSE')
      const newDefDefense = DefensePlayer.getArmyStat('DEFENSE')
      const newDefSpying = DefensePlayer.getArmyStat('SPY')
      const newDefSentry = DefensePlayer.getArmyStat('SENTRY')

      await updateUser(attackerId, {
        gold: AttackPlayer.gold,
        attack_turns: AttackPlayer.attackTurns - attack_turns,
        experience: Math.ceil(AttackPlayer.experience),
        units: AttackPlayer.units,
        offense: newAttOffense,
        defense: newAttDefense,
        spy: newAttSpying,
        sentry: newAttSentry,
      }, tx);

      await updateUser(defenderId, {
        gold: DefensePlayer.gold,
        fort_hitpoints: Math.max(DefensePlayer.fortHitpoints, 0),
        units: DefensePlayer.units,
        experience: Math.ceil(DefensePlayer.experience),
        offense: newDefOffense,
        defense: newDefDefense,
        spy: newDefSpying,
        sentry: newDefSentry,
      }, tx);

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
    logError('Transaction failed: ', error);
    return { status: 'failed', message: 'Transaction failed.', code: 'TRANSACTION_FAILED' };
  }
}