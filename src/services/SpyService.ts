import {
  computeSpyAmpFactor,
  simulateIntel,
  simulateAssassination,
  simulateInfiltration,
  computeSpyCasualties,
  calculateClandestineStrength,
  calculateDefenseAgainstAssassination,
} from '@/utils/spyFunctions';
import { CITIZEN_WORKERS_TARGET } from '@/utils/spy/results';
import prisma from '@/lib/prisma';
import UserModel from '@/models/Users';
import { getUserById, updateUserUnits, createAttackLog, incrementUserStats } from '@/services/AttackDataService';
import { logDebug, logError } from '@/utils/logger';
import { stringifyObj } from '@/utils/numberFormatting';
import type { UnitType } from '@/types/typings';

export const SpyService = {
  computeSpyAmpFactor,
  simulateIntel,
  simulateAssassination,
  simulateInfiltration,
  computeSpyCasualties,
  calculateClandestineStrength,
  calculateDefenseAgainstAssassination,
  CITIZEN_WORKERS_TARGET,

  /**
   * Handles spy missions (Intel, Assassinate, Infiltrate) between two users.
   * @param attackerId - The ID of the attacking user.
   * @param defenderId - The ID of the defending user.
   * @param spies - The number of spies sent on the mission.
   * @param type - The type of spy mission ('INTEL', 'ASSASSINATE', 'INFILTRATE').
   * @param unit - (Optional) The specific unit type targeted for assassination (UnitType or "CITIZEN_WORKERS").
   * @returns An object indicating the status ('success' or 'failed'), results, and attack log ID.
   */
  async executeSpyMission(attackerId: number, defenderId: number, spies: number, type: 'INTEL' | 'ASSASSINATE' | 'INFILTRATE', unit?: UnitType | typeof CITIZEN_WORKERS_TARGET) {
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

    let spyResults: any;
    if (attacker.spy === 0) {
      return { status: 'failed', message: 'Insufficient Spy Offense', code: 'INSUFFICIENT_SPY_OFFENSE' };
    }
    const Winner = attacker.spy > defender.sentry ? attacker : defender;
    logDebug('Spy mission winner determined', { winnerId: Winner.id, attackerSpy: attacker.spy, defenderSentry: defender.sentry });
    
    try {
      const prismaTx = await prisma.$transaction(async (tx) => {
        if (type === 'INTEL') {
          spyResults = this.simulateIntel(attacker, defender, spies);
        } else if (type === 'ASSASSINATE') {
          if (attacker.units.find((u) => u.type === 'SPY' && u.level === 3) === undefined || attacker.units.find((u) => u.type === 'SPY' && u.level === 2).quantity < spies) {
            logError('Insufficient Assassins');
            return { status: 'failed', message: 'Insufficient Assassins' };
          }
          spyResults = this.simulateAssassination(attacker, defender, spies, unit);

          await updateUserUnits(defenderId,
            defender.units as any as import('@/types/typings').PlayerUnit[],
            tx
          );
        } else if (type === 'INFILTRATE') {
          spyResults = this.simulateInfiltration(attacker, defender, spies);
          await updateUserUnits(defenderId,
            defender.units as any as import('@/types/typings').PlayerUnit[],
            tx
          );
        }

        logDebug('Check if spies are lost', { spiesLost: spyResults.spiesLost });
        if (spyResults.spiesLost > 0) {
          logDebug('Updating attacker units after spy mission', { attackerId, spiesLost: spyResults.spiesLost });
          await updateUserUnits(attackerId,
            attacker.units as any as import('@/types/typings').PlayerUnit[],
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
};

export default SpyService;