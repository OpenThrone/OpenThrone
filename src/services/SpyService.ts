import { z } from 'zod';

import prisma from '@/lib/prisma';
import { SpyUser } from '@/models/SpyUser';
import {
  createAttackLog,
  getUserById,
  incrementUserStats,
  updateUserUnits,
} from '@/services/AttackDataService';
import type { UnitType } from '@/types/typings';
import { logDebug, logError } from '@/utils/logger';
import { stringifyObj } from '@/utils/numberFormatting';
import { CITIZEN_WORKERS_TARGET } from '@/utils/spy/results';
import {
  calculateClandestineStrength,
  calculateDefenseAgainstAssassination,
  computeSpyAmpFactor,
  computeSpyCasualties,
  simulateAssassination,
  simulateInfiltration,
  simulateIntel,
} from '@/utils/spyFunctions';

const UNIT_TYPE_VALUES = [
  'CITIZEN',
  'WORKER',
  'OFFENSE',
  'DEFENSE',
  'SPY',
  'SENTRY',
] as const satisfies readonly UnitType[];

const SpyMissionSchema = z.object({
  attackerId: z.number().int().positive(),
  defenderId: z.number().int().positive(),
  spies: z.number().int().positive(),
  type: z.enum(['INTEL', 'ASSASSINATE', 'INFILTRATE']),
  unit: z
    .union([z.enum(UNIT_TYPE_VALUES), z.literal(CITIZEN_WORKERS_TARGET)])
    .optional(),
});

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
  async executeSpyMission(
    attackerId: number,
    defenderId: number,
    spies: number,
    type: 'INTEL' | 'ASSASSINATE' | 'INFILTRATE',
    unit?: UnitType | typeof CITIZEN_WORKERS_TARGET,
  ) {
    const validatedData = SpyMissionSchema.parse({
      attackerId,
      defenderId,
      spies,
      type,
      unit,
    });
    logDebug('Spy mission initiated', validatedData);

    const attackerUser = await getUserById(validatedData.attackerId);
    const defenderUser = await getUserById(validatedData.defenderId);
    const attacker = new SpyUser(attackerUser);
    const defender = new SpyUser(defenderUser);

    if (!attacker || !defender) {
      return {
        status: 'failed',
        message: 'User not found',
        code: 'USER_NOT_FOUND',
      };
    }
    if (attacker.unitTotals.spies < validatedData.spies) {
      return {
        status: 'failed',
        message: 'Insufficient spies',
        code: 'INSUFFICIENT_SPIES',
      };
    }

    let spyResults: any;
    if (attacker.spy === 0) {
      return {
        status: 'failed',
        message: 'Insufficient Spy Offense',
        code: 'INSUFFICIENT_SPY_OFFENSE',
      };
    }

    if (validatedData.type === 'INFILTRATE') {
      const maxPerMission = attacker.spyLimits.infil.perMission || 0;
      const maxPerUser = attacker.spyLimits.infil.perUser || 0;
      if (maxPerMission <= 0 || maxPerUser <= 0) {
        return {
          status: 'failed',
          message: 'Infiltration is not unlocked.',
          code: 'INFILTRATION_LOCKED',
        };
      }
      if (validatedData.spies > Math.min(maxPerMission, maxPerUser)) {
        return {
          status: 'failed',
          message: 'Too many infiltrators sent.',
          code: 'INFILTRATION_LIMIT_EXCEEDED',
        };
      }
      if (attacker.unitTotals.infiltrators < validatedData.spies) {
        return {
          status: 'failed',
          message: 'Insufficient infiltrators',
          code: 'INSUFFICIENT_INFILTRATORS',
        };
      }
    }

    if (validatedData.type === 'ASSASSINATE') {
      const maxPerMission = attacker.spyLimits.assass.perMission || 0;
      const maxPerUser = attacker.spyLimits.assass.perUser || 0;
      if (maxPerMission <= 0 || maxPerUser <= 0) {
        return {
          status: 'failed',
          message: 'Assassination is not unlocked.',
          code: 'ASSASSINATION_LOCKED',
        };
      }
      if (validatedData.spies > Math.min(maxPerMission, maxPerUser)) {
        return {
          status: 'failed',
          message: 'Too many assassins sent.',
          code: 'ASSASSINATION_LIMIT_EXCEEDED',
        };
      }
      if (attacker.unitTotals.assassins < validatedData.spies) {
        return {
          status: 'failed',
          message: 'Insufficient assassins',
          code: 'INSUFFICIENT_ASSASSINS',
        };
      }
    }
    const Winner = attacker.spy > defender.sentry ? attacker : defender;
    logDebug('Spy mission winner determined', {
      winnerId: Winner.id,
      attackerSpy: attacker.spy,
      defenderSentry: defender.sentry,
    });

    try {
      const prismaTx = await prisma.$transaction(async (tx) => {
        if (validatedData.type === 'INTEL') {
          spyResults = this.simulateIntel(
            attacker,
            defender,
            validatedData.spies,
          );
        } else if (validatedData.type === 'ASSASSINATE') {
          spyResults = this.simulateAssassination(
            attacker,
            defender,
            validatedData.spies,
            validatedData.unit,
          );

          await updateUserUnits(
            validatedData.defenderId,
            defender.units as any as import('@/types/typings').PlayerUnit[],
            tx,
          );
        } else if (validatedData.type === 'INFILTRATE') {
          spyResults = this.simulateInfiltration(
            attacker,
            defender,
            validatedData.spies,
          );
          await updateUserUnits(
            validatedData.defenderId,
            defender.units as any as import('@/types/typings').PlayerUnit[],
            tx,
          );
        }

        logDebug('Check if spies are lost', {
          spiesLost: spyResults.spiesLost,
        });
        if (spyResults.spiesLost > 0) {
          logDebug('Updating attacker units after spy mission', {
            attackerId,
            spiesLost: spyResults.spiesLost,
          });
          await updateUserUnits(
            validatedData.attackerId,
            attacker.units as any as import('@/types/typings').PlayerUnit[],
            tx,
          );
        }

        const attack_log = await createAttackLog(
          {
            timestamp: new Date().toISOString(),
            winner: Winner.id,
            type: validatedData.type,
            // Stringify complex results for JSON storage
            stats: { spyResults: stringifyObj(spyResults) },
            // Connect to users via relation fields instead of setting IDs directly
            attackerPlayer: { connect: { id: validatedData.attackerId } },
            defenderPlayer: { connect: { id: validatedData.defenderId } },
          },
          tx,
        );
        logDebug('Attack log created', { attackLogId: attack_log.id });

        await incrementUserStats(
          validatedData.attackerId,
          {
            type: 'SPY',
            subtype: validatedData.attackerId === Winner.id ? 'WON' : 'LOST',
          },
          tx,
        );
        logDebug('Incremented attacker stats', {
          attackerId,
          subtype: validatedData.attackerId === Winner.id ? 'WON' : 'LOST',
        });

        await incrementUserStats(
          validatedData.defenderId,
          {
            type: 'SENTRY',
            subtype: validatedData.defenderId === Winner.id ? 'WON' : 'LOST',
          },
          tx,
        );
        logDebug('Incremented defender stats', {
          defenderId,
          subtype: validatedData.defenderId === Winner.id ? 'WON' : 'LOST',
        });

        return {
          status: 'success',
          result: spyResults,
          attack_log: attack_log.id,
          extra_variables: {
            spies: validatedData.spies,
            spyResults,
          },
        };
      });
      return prismaTx;
    } catch (ex) {
      logError('Transaction failed: ', ex);
      return {
        status: 'failed',
        message: 'Transaction failed.',
        code: 'TRANSACTION_FAILED',
      };
    }
  },
};

export default SpyService;
