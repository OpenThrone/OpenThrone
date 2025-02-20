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
import { newCalculateStrength, simulateBattle } from '@/utils/attackFunctions';
import { stringifyObj } from '@/utils/numberFormatting';
import { AssassinationResult, InfiltrationResult, IntelResult, simulateAssassination, simulateInfiltration, simulateIntel } from '@/utils/spyFunctions';
import { getSocketIO } from '@/lib/socket';

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
  try {
    const prismaTx = await prisma.$transaction(async (tx) => {
      if (type === 'INTEL') {
        spyResults = simulateIntel(attacker, defender, spies);

      } else if (type === 'ASSASSINATE') {
        if (attacker.units.find((u) => u.type === 'SPY' && u.level === 3) === undefined || attacker.units.find((u) => u.type === 'SPY' && u.level === 2).quantity < spies) {
          console.log('Insufficient Assassins');
          return { status: 'failed', message: 'Insufficient Assassins' };
        }
        spyResults = simulateAssassination(attacker, defender, spies, unit);

        await updateUserUnits(defenderId,
          defender.units,
          tx
        );
        //return spyResults;
      } else if (type === 'INFILTRATE') {
        spyResults = simulateInfiltration(attacker, defender, spies);
        await updateUserUnits(defenderId,
          defender.units,
          tx
        );
        await updateFortHitpoints(defenderId, defender.fortHitpoints, tx);

      }
      if (spyResults.spiesLost > 0) {
        await updateUserUnits(attackerId,
          attacker.units,
          tx);
      }

      const attack_log = await createAttackLog({
        attacker_id: attackerId,
        defender_id: defenderId,
        timestamp: new Date().toISOString(),
        winner: Winner.id,
        type: type,
        stats: { spyResults },
      }, tx);

      await incrementUserStats(attackerId, {
        type: 'SPY',
        subtype: (attackerId === Winner.id) ? 'WON' : 'LOST',
      }, tx);
      await incrementUserStats(defenderId, {
        type: 'SENTRY',
        subtype: (defenderId === Winner.id) ? 'WON' : 'LOST',
      }, tx);

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
    });
    return prismaTx;
  } catch (ex) {
    console.error('Transaction failed: ', ex);
    return { status: 'failed', message: 'Transaction failed.' };
  }
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
    Attacker: JSON.parse(JSON.stringify(AttackPlayer)),
    Defender: JSON.parse(JSON.stringify(DefensePlayer)),
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
    const attack_log = await prisma.$transaction(async (tx) => {
      if (isAttackerWinner) {
        DefensePlayer.gold = BigInt(DefensePlayer.gold) - battleResults.pillagedGold;
        AttackPlayer.gold = BigInt(AttackPlayer.gold) + battleResults.pillagedGold;
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
      }, tx);

      if (isAttackerWinner) {
        await createBankHistory({
          gold_amount: battleResults.pillagedGold,
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

      const { killingStrength: attackerKS, defenseStrength: attackerDS } = newCalculateStrength(AttackPlayer, 'OFFENSE');
      const newAttOffense = AttackPlayer.getArmyStat('OFFENSE')
      const newAttDefense = AttackPlayer.getArmyStat('DEFENSE')
      const newAttSpying = AttackPlayer.getArmyStat('SPY')
      const newAttSentry = AttackPlayer.getArmyStat('SENTRY')
      const { killingStrength: defenderKS, defenseStrength: defenderDS } = newCalculateStrength(DefensePlayer, 'OFFENSE');
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
        //killing_str: attackerKS,
        //defense_str: attackerDS,
      },tx);

      await updateUser(defenderId, {
        gold: DefensePlayer.gold,
        fort_hitpoints: Math.max(DefensePlayer.fortHitpoints, 0),
        units: DefensePlayer.units,
        experience: Math.ceil(DefensePlayer.experience),
        offense: newDefOffense,
        defense: newDefDefense,
        spy: newDefSpying,
        sentry: newDefSentry,
        //killing_str: defenderKS,
        //defense_str: defenderDS,
      },tx);

      return attack_log;
    });

    // Move Socket.IO logic outside the transaction
    const io = getSocketIO();
    if (io) {
      if (attack_log) {
        io.to(`user-${defenderId}`).emit('attackNotification', {
          message: `You were attacked in battle ${attack_log.id}`,
          defenderId: defenderId,
        });
      } else {
        console.error('attack_log is undefined');
      }
    } else {
      console.error('Socket.IO not initialized');
    }

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
