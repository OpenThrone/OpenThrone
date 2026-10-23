import { z } from 'zod';

import { HouseUpgrades } from '@/constants';
import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import { SpyUser } from '@/models/SpyUser';
import {
  createAttackLog,
  getUserById,
  incrementUserStats,
  updateUser,
  updateUserUnits,
} from '@/services/AttackDataService';
import { getTargetAvailability } from '@/services/AttackValidationService';
import { hasForbiddenForceTarget } from '@/services/ForceLifecycle.service';
import { getRuntimeConfig } from '@/services/RuntimeConfig.service';
import type { UnitType } from '@/types/typings';
import {
  calculateDailyReplacementThroughput,
  calculateDefenderDailyCasualtyRemaining,
  clamp,
  getRaceIdentity,
  V5_COMBAT_CONSTANTS,
} from '@/utils/balance/v5Combat';
import {
  captureCombatUser,
  restoreBattleUser,
  sealCombatReplay,
  serializeCombatResult,
  type SpyReplay,
} from '@/utils/combatReplay';
import { lockEraLifecycleShared } from '@/utils/eraLifecycleLock';
import { logDebug, logError } from '@/utils/logger';
import { createCombatRandom } from '@/utils/serverRandom';
import {
  type AssassinationResult,
  CITIZEN_WORKERS_TARGET,
  type InfiltrationResult,
  type IntelResult,
} from '@/utils/spy/results';
import {
  simulateAssassination,
  simulateInfiltration,
  simulateIntel,
} from '@/utils/spyFunctions';
import { getOTDayKey, getOTStartDate } from '@/utils/timefunctions';

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
  // Spy pressure resets with the OT calendar day, like every other daily rule.
  const todayKey = getOTDayKey();
  const pressureDateKey = currentDate
    ? getOTDayKey(new Date(currentDate))
    : todayKey;
  return pressureDateKey === todayKey ? (currentPressure ?? 0) : 0;
}

type SerializedSpyResult = ReturnType<typeof serializeCombatResult>;

/** Strips roster row identities from an intel snapshot unit list. */
function stripRowIds(value: unknown) {
  if (!Array.isArray(value)) return value;
  return value.map((unit) => {
    if (!unit || typeof unit !== 'object') return unit;
    const {
      id: _id,
      userId: _userId,
      ...rest
    } = unit as Record<string, unknown>;
    return rest;
  });
}

/**
 * Attacker-facing copy of a spy result: failed missions hide the entry odds
 * (they invert to the defender's sentry strength) and intel snapshots drop DB
 * row ids, matching redactSpyResultsForViewer for attack-log readers.
 */
export function redactLiveSpyResult(
  result: SerializedSpyResult,
): SerializedSpyResult {
  const { successProbability, ...rest } = result;
  const out: Record<string, unknown> =
    result.success === true ? { ...rest, successProbability } : { ...rest };
  const intel = result.intelligenceGathered;
  if (intel && typeof intel === 'object' && !Array.isArray(intel)) {
    const gathered = intel as Record<string, unknown>;
    out.intelligenceGathered = {
      ...gathered,
      units: stripRowIds(gathered.units),
      mercenaries: stripRowIds(gathered.mercenaries),
    };
  }
  return out as SerializedSpyResult;
}

/** Interactive transaction budget; spy missions queue on the row locks inside it. */
const SPY_TX_TIMEOUT_MS = 20_000;

/** Provides spy service operations. */
export const SpyService = {
  simulateIntel,
  simulateAssassination,
  simulateInfiltration,
  CITIZEN_WORKERS_TARGET,

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

    if (validatedData.attackerId === validatedData.defenderId) {
      return {
        status: 'failed',
        message: 'You cannot run spy missions against yourself.',
        code: 'SELF_TARGET_FORBIDDEN',
      };
    }

    try {
      const config = await getRuntimeConfig();
      const enabled =
        type === 'INTEL'
          ? config.enableIntel
          : type === 'ASSASSINATE'
            ? config.enableAssassinations
            : config.enableInfiltrations;
      if (!enabled)
        return {
          status: 'failed',
          message: 'This spy mission is currently disabled.',
          code: 'MISSION_DISABLED',
        };
      return await prisma.$transaction(
        async (tx) => {
          await lockEraLifecycleShared(tx);
          // Lock both rows in id order; every check below reads the locked state.
          const firstId = Math.min(
            validatedData.attackerId,
            validatedData.defenderId,
          );
          const secondId = Math.max(
            validatedData.attackerId,
            validatedData.defenderId,
          );
          await tx.$queryRaw`SELECT id FROM users WHERE id IN (${firstId}, ${secondId}) ORDER BY id FOR UPDATE`;

          const attackerUser = await getUserById(validatedData.attackerId, tx);
          const defenderUser = await getUserById(validatedData.defenderId, tx);

          if (!attackerUser || !defenderUser) {
            return {
              status: 'failed',
              message: 'User not found',
              code: 'USER_NOT_FOUND',
            };
          }
          const availability = await getTargetAvailability(
            validatedData.defenderId,
            tx,
          );
          if (!availability.ok) {
            return {
              status: 'failed',
              message: 'This player cannot be targeted right now.',
              code: 'DEFENDER_UNAVAILABLE',
            };
          }
          if (
            await hasForbiddenForceTarget(
              tx,
              validatedData.attackerId,
              validatedData.defenderId,
            )
          )
            return {
              status: 'failed',
              message:
                'Return alliance troops before targeting a member of their alliance.',
              code: 'ALLIANCE_FORCE_TARGET_FORBIDDEN',
            };
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
            Math.abs(attacker.level - defender.level) > config.attackLevelRange
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

          let spyResults:
            | AssassinationResult
            | InfiltrationResult
            | IntelResult;
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
            if (validatedData.spies > maxPerMission) {
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
            if (validatedData.spies > maxPerMission) {
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
          if (validatedData.type === 'INTEL') {
            const dayAgo = new Date(new Date().getTime() - 86400000);
            // Same rolling 24h pair cap as infiltration/assassination.
            const intelAgainstDefender = await tx.attack_log.count({
              where: {
                attacker_id: validatedData.attackerId,
                defender_id: validatedData.defenderId,
                type: 'INTEL',
                timestamp: { gte: dayAgo },
              },
            });
            if (
              intelAgainstDefender >=
              V5_COMBAT_CONSTANTS.INTEL_MAX_PER_TARGET_PER_DAY
            ) {
              return {
                status: 'failed',
                message: 'You have targeted this player too many times today.',
                code: 'SPY_TARGET_DAILY_LIMIT',
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
            // Counted on the locked connection so concurrent missions see each other.
            const [missionsAgainstDefender, missionsToday] = await Promise.all([
              tx.attack_log.count({
                where: {
                  attacker_id: validatedData.attackerId,
                  defender_id: validatedData.defenderId,
                  type: validatedData.type,
                  timestamp: { gte: dayAgo },
                },
              }),
              tx.attack_log.count({
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
          let winnerId: number;
          const currentSpyPressure = getTodayPressure(
            defender.spyPressureDate,
            defender.spyPressureToday,
          );
          defender.spyPressureToday = currentSpyPressure;

          // Assassination dogpile protection: kills draw from the defender's
          // shared daily casualty allowance (battles included) and, per OT day,
          // all attackers together may take at most ASSASSINATION_DAILY_TYPE_SHARE
          // of the targeted unit type.
          let defenderDailyCasualtyRemaining: number | undefined;
          let targetTypeDailyRemaining: number | undefined;
          if (validatedData.type === 'ASSASSINATE' && validatedData.unit) {
            const startOfToday = getOTStartDate();
            const [todayLossesAgg, todayTypeAgg] = await Promise.all([
              tx.attack_log.aggregate({
                where: {
                  defender_id: validatedData.defenderId,
                  type: { in: ['attack', 'ASSASSINATE'] },
                  timestamp: { gte: startOfToday },
                },
                _sum: { defender_losses_total: true },
              }),
              tx.attack_log.aggregate({
                where: {
                  defender_id: validatedData.defenderId,
                  type: 'ASSASSINATE',
                  timestamp: { gte: startOfToday },
                  stats: {
                    path: ['spyResults', 'targetUnit'],
                    equals: validatedData.unit,
                  },
                },
                _sum: { defender_losses_total: true },
              }),
            ]);
            const lostToday = Number(
              todayLossesAgg?._sum?.defender_losses_total ?? 0,
            );
            const typeLostToday = Number(
              todayTypeAgg?._sum?.defender_losses_total ?? 0,
            );
            const houseUpgrade =
              HouseUpgrades[
                Math.max(
                  0,
                  Number(defenderUser.house_level ?? 0),
                ) as keyof typeof HouseUpgrades
              ] ?? HouseUpgrades[0];
            const dailyThroughput = calculateDailyReplacementThroughput({
              houseCitizens: Number(houseUpgrade?.citizensDaily ?? 1),
              race: defender.race,
            });
            defenderDailyCasualtyRemaining =
              calculateDefenderDailyCasualtyRemaining({
                dailyThroughput,
                casualtiesToday: lostToday,
              });
            const targetTypes =
              validatedData.unit === 'CITIZEN_WORKERS'
                ? ['CITIZEN', 'WORKER']
                : [validatedData.unit];
            const targetCount = [...defender.units, ...defender.mercenaries]
              .filter((unit) => targetTypes.includes(unit.type))
              .reduce((sum, unit) => sum + Math.max(0, unit.quantity || 0), 0);
            targetTypeDailyRemaining = Math.max(
              0,
              Math.floor(
                (targetCount + typeLostToday) *
                  V5_COMBAT_CONSTANTS.ASSASSINATION_DAILY_TYPE_SHARE,
              ) - typeLostToday,
            );
          }

          const combatRandom = createCombatRandom('spy');
          const replay: SpyReplay = {
            ...combatRandom.replay,
            domain: 'spy',
            attacker: captureCombatUser(attacker),
            defender: captureCombatUser(defender),
            turns: committedTurns,
            spies: validatedData.spies,
            mission: validatedData.type,
            ...(validatedData.unit ? { target: validatedData.unit } : {}),
            spyPressureToday: currentSpyPressure,
            ...(defenderDailyCasualtyRemaining !== undefined
              ? { defenderDailyCasualtyRemaining }
              : {}),
            ...(targetTypeDailyRemaining !== undefined
              ? { targetTypeDailyRemaining }
              : {}),
          };
          const sealedReplay = sealCombatReplay(replay);

          const missionOptions = {
            random: combatRandom.random,
            turns: committedTurns,
            spyPressureToday: currentSpyPressure,
            defenderDailyCasualtyRemaining,
            targetTypeDailyRemaining,
          };
          if (validatedData.type === 'INTEL') {
            spyResults = this.simulateIntel(
              attacker,
              defender,
              validatedData.spies,
              missionOptions,
            );
          } else if (validatedData.type === 'ASSASSINATE') {
            spyResults = this.simulateAssassination(
              attacker,
              defender,
              validatedData.spies,
              validatedData.unit,
              missionOptions,
            );
          } else {
            spyResults = this.simulateInfiltration(
              attacker,
              defender,
              validatedData.spies,
              missionOptions,
            );
          }
          // Persist each actual mutated roster once, including mercenaries.
          await updateUserUnits(
            validatedData.attackerId,
            [...attacker.units, ...attacker.mercenaries],
            tx,
          );
          await updateUserUnits(
            validatedData.defenderId,
            [...defender.units, ...defender.mercenaries],
            tx,
          );
          const attackerStats = restoreBattleUser(captureCombatUser(attacker));
          const defenderStats = restoreBattleUser(captureCombatUser(defender));
          winnerId = spyResults.success
            ? validatedData.attackerId
            : validatedData.defenderId;
          const serializedResult = serializeCombatResult(spyResults);

          const attack_log = await createAttackLog(
            {
              timestamp: new Date().toISOString(),
              winner: winnerId,
              type: validatedData.type,
              attacker_losses_total: spyResults.spiesLost ?? 0,
              defender_losses_total:
                'unitsKilled' in spyResults ? spyResults.unitsKilled : 0,
              stats: { spyResults: serializedResult, replay: sealedReplay },
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

          // Turns and stamina are deltas against the locked row. The stamina
          // cost is capped at what the attacker still has, so it never goes below 0.
          const raceIdentity = getRaceIdentity(attacker.race);
          const staminaCost = Math.min(
            attacker.stamina,
            Math.ceil(committedTurns * raceIdentity.moraleLossMultiplier),
          );
          await updateUser(
            validatedData.attackerId,
            {
              attack_turns: { decrement: committedTurns },
              stamina: { decrement: staminaCost },
              offense: attackerStats.offense,
              defense: attackerStats.defense,
              spy: attackerStats.spy,
              sentry: attackerStats.sentry,
            } satisfies Prisma.usersUpdateInput,
            tx,
          );
          await updateUser(
            validatedData.defenderId,
            {
              fort_hitpoints: Math.max(0, defender.fortHitpoints),
              offense: defenderStats.offense,
              defense: defenderStats.defense,
              spy: defenderStats.spy,
              sentry: defenderStats.sentry,
              spy_pressure_today: currentSpyPressure + committedTurns,
              spy_pressure_date: new Date(),
            } satisfies Prisma.usersUpdateInput,
            tx,
          );

          const attackerView = redactLiveSpyResult(serializedResult);
          return {
            status: 'success',
            result: attackerView,
            attack_log: attack_log.id,
            extra_variables: {
              spies: validatedData.spies,
              turns: committedTurns,
              spyResults: attackerView,
            },
          };
        },
        { timeout: SPY_TX_TIMEOUT_MS, maxWait: SPY_TX_TIMEOUT_MS },
      );
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
