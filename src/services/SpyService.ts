import type { Prisma } from '@prisma/client';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { SpyUser } from '@/models/SpyUser';
import {
  createAttackLog,
  getUserById,
  incrementUserStats,
  updateUser,
  updateUserUnits,
} from '@/services/AttackDataService';
import type { UnitType } from '@/types/typings';
import {
  clamp,
  getRaceIdentity,
  V5_COMBAT_CONSTANTS,
} from '@/utils/balance/v5Combat';
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
  turns: z.number().int().positive().optional(),
  unit: z
    .union([z.enum(UNIT_TYPE_VALUES), z.literal(CITIZEN_WORKERS_TARGET)])
    .optional(),
});

const DEFAULT_ATTACK_LEVEL_RANGE = Number(
  process.env.NEXT_PUBLIC_ATTACK_LEVEL_RANGE ?? 5,
);

function getSpyMissionTurnBounds(type: 'INTEL' | 'ASSASSINATE' | 'INFILTRATE') {
  if (type === 'INTEL') {
    return { min: 1, max: V5_COMBAT_CONSTANTS.MAX_INTEL_TURNS };
  }
  if (type === 'INFILTRATE') {
    return {
      min: V5_COMBAT_CONSTANTS.MIN_INFILTRATION_TURNS,
      max: V5_COMBAT_CONSTANTS.MAX_SPY_MISSION_TURNS,
    };
  }
  return {
    min: V5_COMBAT_CONSTANTS.MIN_ASSASSINATION_TURNS,
    max: V5_COMBAT_CONSTANTS.MAX_SPY_MISSION_TURNS,
  };
}

function resolveSpyMissionTurns(
  type: 'INTEL' | 'ASSASSINATE' | 'INFILTRATE',
  turns?: number,
): number {
  const bounds = getSpyMissionTurnBounds(type);
  return clamp(
    Math.floor(Number(turns ?? bounds.min) || bounds.min),
    bounds.min,
    bounds.max,
  );
}

function getTodayPressure(
  currentDate: Date | string | null,
  currentPressure: number,
): number {
  const todayKey = new Date().toISOString().slice(0, 10);
  const pressureDateKey = currentDate
    ? new Date(currentDate).toISOString().slice(0, 10)
    : todayKey;
  return pressureDateKey === todayKey ? (currentPressure ?? 0) : 0;
}

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
    turns?: number,
  ) {
    const validatedData = SpyMissionSchema.parse({
      attackerId,
      defenderId,
      spies,
      type,
      unit,
      turns,
    });
    const committedTurns = resolveSpyMissionTurns(type, turns);
    logDebug('Spy mission initiated', validatedData);

    const attackerUser = await getUserById(validatedData.attackerId);
    const defenderUser = await getUserById(validatedData.defenderId);

    if (!attackerUser || !defenderUser) {
      return {
        status: 'failed',
        message: 'User not found',
        code: 'USER_NOT_FOUND',
      };
    }
    const attacker = new SpyUser(attackerUser);
    const defender = new SpyUser(defenderUser);

    if (validatedData.type === 'ASSASSINATE' && !validatedData.unit) {
      return {
        status: 'failed',
        message: 'Assassination requires a target unit.',
        code: 'ASSASSINATION_TARGET_REQUIRED',
      };
    }
    if (attacker.unitTotals.spies < validatedData.spies) {
      return {
        status: 'failed',
        message: 'Insufficient spies',
        code: 'INSUFFICIENT_SPIES',
      };
    }
    if (
      Math.abs(attacker.level - defender.level) > DEFAULT_ATTACK_LEVEL_RANGE
    ) {
      return {
        status: 'failed',
        message: 'Target is outside your spy mission range.',
        code: 'TARGET_OUT_OF_RANGE',
      };
    }
    if (attacker.attackTurns < committedTurns) {
      return {
        status: 'failed',
        message: 'Insufficient attack turns',
        code: 'INSUFFICIENT_ATTACK_TURNS',
      };
    }
    if (attacker.stamina < committedTurns) {
      return {
        status: 'failed',
        message: 'Insufficient stamina',
        code: 'INSUFFICIENT_STAMINA',
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
    if (
      validatedData.type === 'INFILTRATE' ||
      validatedData.type === 'ASSASSINATE'
    ) {
      const dayAgo = new Date(new Date().getTime() - 86400000);
      const limits =
        validatedData.type === 'INFILTRATE'
          ? attacker.spyLimits.infil
          : attacker.spyLimits.assass;
      const [missionsAgainstDefender, missionsToday] = await Promise.all([
        prisma.attack_log.count({
          where: {
            attacker_id: validatedData.attackerId,
            defender_id: validatedData.defenderId,
            type: validatedData.type,
            timestamp: { gte: dayAgo },
          },
        }),
        prisma.attack_log.count({
          where: {
            attacker_id: validatedData.attackerId,
            type: validatedData.type,
            timestamp: { gte: dayAgo },
          },
        }),
      ]);
      if (missionsAgainstDefender >= limits.perUser) {
        return {
          status: 'failed',
          message: 'You have targeted this player too many times today.',
          code: 'SPY_TARGET_DAILY_LIMIT',
        };
      }
      if (missionsToday >= limits.perDay) {
        return {
          status: 'failed',
          message: 'You have used too many spy missions today.',
          code: 'SPY_DAILY_LIMIT',
        };
      }
    }
    let winnerId = attacker.spy > defender.sentry ? attacker.id : defender.id;
    logDebug('Initial spy mission pressure calculated', {
      winnerId,
      attackerSpy: attacker.spy,
      defenderSentry: defender.sentry,
    });

    try {
      const prismaTx = await prisma.$transaction(async (tx) => {
        const currentSpyPressure = getTodayPressure(
          defender.spyPressureDate,
          defender.spyPressureToday,
        );
        if (validatedData.type === 'INTEL') {
          spyResults = this.simulateIntel(
            attacker,
            defender,
            validatedData.spies,
            {
              turns: committedTurns,
              spyPressureToday: currentSpyPressure,
            },
          );
        } else if (validatedData.type === 'ASSASSINATE') {
          spyResults = this.simulateAssassination(
            attacker,
            defender,
            validatedData.spies,
            validatedData.unit,
            {
              turns: committedTurns,
              spyPressureToday: currentSpyPressure,
            },
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
            {
              turns: committedTurns,
              spyPressureToday: currentSpyPressure,
            },
          );
          await updateUserUnits(
            validatedData.defenderId,
            defender.units as any as import('@/types/typings').PlayerUnit[],
            tx,
          );
          await updateUser(
            validatedData.defenderId,
            { fort_hitpoints: Math.max(0, defender.fortHitpoints) },
            tx,
          );
        }
        winnerId = spyResults.success
          ? validatedData.attackerId
          : validatedData.defenderId;

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
            winner: winnerId,
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
            subtype: validatedData.attackerId === winnerId ? 'WON' : 'LOST',
          },
          tx,
        );
        logDebug('Incremented attacker stats', {
          attackerId,
          subtype: validatedData.attackerId === winnerId ? 'WON' : 'LOST',
        });

        await incrementUserStats(
          validatedData.defenderId,
          {
            type: 'SENTRY',
            subtype: validatedData.defenderId === winnerId ? 'WON' : 'LOST',
          },
          tx,
        );
        logDebug('Incremented defender stats', {
          defenderId,
          subtype: validatedData.defenderId === winnerId ? 'WON' : 'LOST',
        });

        const raceIdentity = getRaceIdentity(attacker.race);
        await updateUser(
          validatedData.attackerId,
          {
            attack_turns: Math.max(0, attacker.attackTurns - committedTurns),
            stamina: Math.max(
              0,
              attacker.stamina -
                Math.ceil(committedTurns * raceIdentity.moraleLossMultiplier),
            ),
          } satisfies Prisma.usersUpdateInput,
          tx,
        );
        await updateUser(
          validatedData.defenderId,
          {
            spy_pressure_today: currentSpyPressure + committedTurns,
            spy_pressure_date: new Date(),
          } satisfies Prisma.usersUpdateInput,
          tx,
        );

        return {
          status: 'success',
          result: spyResults,
          attack_log: attack_log.id,
          extra_variables: {
            spies: validatedData.spies,
            turns: committedTurns,
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
