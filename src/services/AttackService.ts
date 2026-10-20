import { HouseUpgrades, UnitTypes } from '@/constants';
import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import { BattleUser } from '@/models/BattleUser';
import {
  divertIncomeToLoans,
  settleLoanTreasuryCredits,
} from '@/services/AllianceLoan.service';
import {
  createAttackLog,
  createBankHistory,
  getUserById,
  incrementUserStats,
  updateUser,
  updateUserUnits,
} from '@/services/AttackDataService';
import { enqueueBattleAlert } from '@/services/BattleNotification.service';
import {
  applyProtectionContext,
  loadProtectionContext,
} from '@/services/BattleProtection.service';
import { getGameEventModifiers } from '@/services/GameEventRuntime.service';
import { getRuntimeConfig } from '@/services/RuntimeConfig.service';
import { combatSnapshot } from '@/utils/adminCombat';
import {
  calculateBattleExperience,
  calculateFortDamage,
  calculateLoot,
  calculateStrength,
  executeAttack,
  newComputeCasualties,
  simulateBattle,
} from '@/utils/attackFunctions';
import {
  computeBattleWinProbabilityProxy,
  totalCombatPower,
} from '@/utils/balance/effectiveStats';
import {
  calculateDailyReplacementThroughput,
  calculateDefenderDailyCasualtyRemaining,
  calculateDefenderDailyGoldRemaining,
  V5_COMBAT_CONSTANTS,
} from '@/utils/balance/v5Combat';
import {
  type AttackReplay,
  captureCombatUser,
  sealCombatReplay,
} from '@/utils/combatReplay';
import { logDebug, logError } from '@/utils/logger';
import { stringifyObj } from '@/utils/numberFormatting';
import { createCombatRandom } from '@/utils/serverRandom';
import { getOTDayKey, getOTStartDate } from '@/utils/timefunctions';

/** Same per-pair cap as AttackValidationService.canAttack (5 per 24 hours). */
const MAX_PAIR_ATTACKS_PER_DAY = 5;
/** Interactive transaction budget; attacks queue on the row locks inside it. */
const ATTACK_TX_TIMEOUT_MS = 20_000;

function buildContributionSlice(
  breakdown: {
    baseStats: {
      MeleeAtkPower: number;
      MeleeDefPower: number;
      RangedAtkPower: number;
      RangedDefPower: number;
    };
    itemStats: {
      MeleeAtkPower: number;
      MeleeDefPower: number;
      RangedAtkPower: number;
      RangedDefPower: number;
    };
    upgradeStats: {
      MeleeAtkPower: number;
      MeleeDefPower: number;
      RangedAtkPower: number;
      RangedDefPower: number;
    };
    totalStats: {
      MeleeAtkPower: number;
      MeleeDefPower: number;
      RangedAtkPower: number;
      RangedDefPower: number;
    };
  },
  bonusPercent: number,
) {
  return {
    basePower: totalCombatPower(breakdown.baseStats),
    itemPower: totalCombatPower(breakdown.itemStats),
    structureContributionPower: totalCombatPower(breakdown.upgradeStats),
    bonusPercent,
    totalPower: totalCombatPower(breakdown.totalStats),
  };
}

/** Provides attack service operations. */
export const AttackService = {
  simulateBattle,
  calculateStrength,
  calculateLoot,
  calculateFortDamage,
  calculateBattleExperience,
  newComputeCasualties,

  /**
   * Handles standard attacks between two users.
   *
   * Every read, rule check and write runs on one interactive transaction after
   * both account rows are locked (FOR UPDATE, ordered by id). Concurrent
   * missions touching either account therefore queue instead of reading the
   * same pre-attack balances. Gold, turns and stamina are persisted as deltas.
   * @param attackerId - The ID of the attacking user.
   * @param defenderId - The ID of the defending user.
   * @param attack_turns - The number of attack turns to use.
   * @returns An object indicating the status ('success' or 'failed'), results, and attack log ID.
   */
  async executeAttack(
    attackerId: number,
    defenderId: number,
    attack_turns: number,
    options: {
      confirmAllianceAttack?: boolean;
    } = {},
  ) {
    logDebug('Attack initiated', { attackerId, defenderId, attack_turns });

    try {
      const committedTurns = Math.min(
        Math.max(1, Math.floor(Number(attack_turns) || 0)),
        V5_COMBAT_CONSTANTS.MAX_ATTACK_TURNS,
      );

      if (committedTurns !== attack_turns) {
        return {
          status: 'failed',
          message: `Attacks must spend between 1 and ${V5_COMBAT_CONSTANTS.MAX_ATTACK_TURNS} turns.`,
          code: 'INVALID_ATTACK_TURNS',
        };
      }

      if (attackerId === defenderId) {
        return {
          status: 'failed',
          message: 'You cannot attack yourself.',
          code: 'SELF_TARGET_FORBIDDEN',
        };
      }

      const runtimeConfig = await getRuntimeConfig();
      const eventModifiers = await getGameEventModifiers();
      if (!runtimeConfig.enableAttacking) {
        return {
          status: 'failed',
          message: 'Attacking is currently disabled.',
          code: 'ATTACKING_DISABLED',
        };
      }

      try {
        const outcome = await prisma.$transaction(
          async (tx) => {
            // Lock both rows in id order so opposing missions cannot deadlock.
            const firstId = Math.min(attackerId, defenderId);
            const secondId = Math.max(attackerId, defenderId);
            await tx.$queryRaw`SELECT id FROM users WHERE id IN (${firstId}, ${secondId}) ORDER BY id FOR UPDATE`;

            const attackerUser = await getUserById(attackerId, tx);
            const defenderUser = await getUserById(defenderId, tx);

            if (!attackerUser) {
              logError(`Attacker not found with ID: ${attackerId}`);
              return {
                status: 'failed',
                message: 'Attacker user not found',
                code: 'ATTACKER_NOT_FOUND',
              };
            }

            if (!defenderUser) {
              logError(`Defender not found with ID: ${defenderId}`);
              return {
                status: 'failed',
                message: 'Defender user not found',
                code: 'DEFENDER_NOT_FOUND',
              };
            }

            const attacker = new BattleUser(attackerUser);
            const defender = new BattleUser(defenderUser);
            // One shared protection rule (utils/battleProtection.ts) for both sides.
            const protectionContext = await loadProtectionContext(tx);
            applyProtectionContext(protectionContext, attacker, defender);

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

            const AttackPlayer = attacker;
            const DefensePlayer = defender;

            // Enhanced strength calculation with unit-item allocation and battle upgrades
            const attackerStrengthObj = calculateStrength(
              AttackPlayer,
              'OFFENSE',
              false,
            );
            const defenderStrengthObj = calculateStrength(
              DefensePlayer,
              'DEFENSE',
              false,
            );
            const attackerOffenseKS =
              attackerStrengthObj.totalStats.MeleeAtkPower;
            const attackerContribution = buildContributionSlice(
              attackerStrengthObj as any,
              Number(AttackPlayer.attackBonus || 0),
            );
            const defenderContribution = buildContributionSlice(
              defenderStrengthObj as any,
              Number(DefensePlayer.defenseBonus || 0),
            );
            const winProbabilityProxy = computeBattleWinProbabilityProxy(
              attackerContribution.totalPower,
              defenderContribution.totalPower,
            );

            if (attackerOffenseKS <= 0) {
              return {
                status: 'failed',
                message: 'Attack unsuccessful due to negligible offense.',
                code: 'NEGLIGIBLE_OFFENSE',
              };
            }

            if (
              Math.abs(AttackPlayer.level - DefensePlayer.level) >
              runtimeConfig.attackLevelRange
            ) {
              return {
                status: 'failed',
                message: `You can only attack within ${runtimeConfig.attackLevelRange} levels of your own level.`,
                code: 'LEVEL_RANGE_EXCEEDED',
              };
            }

            // Pair cap, counted on the locked connection (see canAttack).
            const pairAttacks = await tx.attack_log.count({
              where: {
                attacker_id: attackerId,
                defender_id: defenderId,
                type: 'attack',
                timestamp: {
                  gte: new Date(Date.now() - 1000 * 60 * 60 * 24),
                },
              },
            });
            if (pairAttacks >= MAX_PAIR_ATTACKS_PER_DAY) {
              return {
                status: 'failed',
                message:
                  'You have attacked this player too many times in the last 24 hours.',
                code: 'TOO_MANY_ATTACKS',
              };
            }

            // Friendly fire stays allowed but must be acknowledged after
            // the other refusal checks have passed.
            if (!options.confirmAllianceAttack) {
              const sharedMembership = await tx.alliance_memberships.findFirst({
                where: {
                  user_id: attackerId,
                  alliance: { members: { some: { user_id: defenderId } } },
                },
                orderBy: { alliance_id: 'asc' },
                select: { alliance: { select: { id: true, name: true } } },
              });
              if (sharedMembership?.alliance) {
                const allianceName = sharedMembership.alliance.name;
                return {
                  status: 'failed',
                  message: `This player is a fellow member of your alliance "${allianceName}". Confirm to attack them anyway.`,
                  code: 'ALLIANCE_MEMBER_CONFIRMATION_REQUIRED',
                  extra_variables: {
                    allianceId: sharedMembership.alliance.id,
                    allianceName,
                  },
                };
              }
            }

            // Dogpile protection: the defender can only lose DAILY_CASUALTY_RECOVERY
            // days of rebuild throughput across ALL attackers today. Reduce that
            // allowance by what earlier attackers already took.
            // Daily rules follow the OT calendar day, not UTC.
            const startOfToday = getOTStartDate();
            // Assassinations draw from the same pool as battle losses.
            const todayLossesAgg = await tx.attack_log.aggregate({
              where: {
                defender_id: defenderId,
                type: { in: ['attack', 'ASSASSINATE'] },
                timestamp: { gte: startOfToday },
              },
              _sum: { defender_losses_total: true, pillaged_gold: true },
            });
            const todayDefenderLosses = Number(
              todayLossesAgg._sum.defender_losses_total ?? 0,
            );
            const defenderHouseUpgrade =
              HouseUpgrades[
                Math.max(
                  0,
                  Number(defenderUser.house_level ?? 1),
                ) as keyof typeof HouseUpgrades
              ] ?? HouseUpgrades[0];
            const defenderDailyThroughput = calculateDailyReplacementThroughput(
              {
                houseCitizens: Number(defenderHouseUpgrade?.citizensDaily ?? 1),
                race: DefensePlayer.race,
              },
            );
            const defenderDailyAllowanceRemaining =
              calculateDefenderDailyCasualtyRemaining({
                dailyThroughput: defenderDailyThroughput,
                casualtiesToday: todayDefenderLosses,
              });
            const todayKey = getOTDayKey();
            const pressureDateKey = DefensePlayer.defensePressureDate
              ? getOTDayKey(new Date(DefensePlayer.defensePressureDate))
              : todayKey;
            const currentDefensePressure =
              pressureDateKey === todayKey
                ? DefensePlayer.defensePressureToday
                : 0;
            DefensePlayer.defensePressureToday = currentDefensePressure;
            if (
              AttackPlayer.defensePressureDate &&
              getOTDayKey(new Date(AttackPlayer.defensePressureDate)) !==
                todayKey
            ) {
              AttackPlayer.defensePressureToday = 0;
            }

            // Treasury dogpile protection for protected defenders only: all attackers
            // combined may take at most DAILY_GOLD_PILLAGE_SHARE_CAP of their on-hand
            // gold per day. Unprotected treasuries have no daily ceiling.
            const todayGoldTaken = BigInt(
              todayLossesAgg._sum.pillaged_gold ?? 0,
            );
            const defenderDailyGoldRemaining =
              calculateDefenderDailyGoldRemaining({
                goldOnHand: BigInt(DefensePlayer.gold),
                goldTakenToday: todayGoldTaken,
                isDefenderProtected: DefensePlayer.isProtected(),
              });

            const defenderGoldAtStart = BigInt(DefensePlayer.gold);
            const defenderProtected = DefensePlayer.isProtected();
            const combatRandom = createCombatRandom('attack');
            const startOfAttack = {
              Attacker: captureCombatUser(AttackPlayer),
              Defender: captureCombatUser(DefensePlayer),
            };
            const replay: AttackReplay = {
              ...combatRandom.replay,
              domain: 'attack',
              attacker: startOfAttack.Attacker,
              defender: startOfAttack.Defender,
              turns: committedTurns,
              defenderProtected,
              defenderDailyCasualtyRemaining: defenderDailyAllowanceRemaining,
              defenderDailyGoldRemaining: defenderDailyGoldRemaining.toString(),
            };
            const sealedReplay = sealCombatReplay(replay);

            // Enhanced battle simulation with all factors
            const resolvedBattle = await executeAttack(
              AttackPlayer,
              DefensePlayer,
              committedTurns,
              defenderProtected,
              {
                random: combatRandom.random,
                defenderDailyCasualtyRemaining: defenderDailyAllowanceRemaining,
                defenderDailyGoldRemaining,
              },
            );

            const getUnitHp = (type: string, level: number) =>
              UnitTypes.find((u) => u.type === type && u.level === level)?.hp ??
              0;

            const calculateHpDamageFromLosses = (losses: {
              units?: Array<{ type: string; level: number; quantity: number }>;
            }) =>
              (losses?.units ?? []).reduce(
                (sum, loss) =>
                  sum + getUnitHp(loss.type, loss.level) * loss.quantity,
                0,
              );

            const attackerUnitDamageDealt = calculateHpDamageFromLosses(
              resolvedBattle.Losses.Defender,
            );
            const defenderUnitDamageDealt = calculateHpDamageFromLosses(
              resolvedBattle.Losses.Attacker,
            );

            // executeAttack mutates BattleUser unit quantities while recording Losses.
            // Do not subtract Losses again here, or persisted/logged units lose twice.

            // Commitment is the cost; no obsolete max-turn morale surcharge.
            // The row lock makes the checks above authoritative, so this is a delta.
            AttackPlayer.stamina = Math.max(
              0,
              AttackPlayer.stamina - committedTurns,
            );
            AttackPlayer.attackTurns -= committedTurns;

            const fortHpAtStart =
              Number(startOfAttack.Defender.fortHitpoints ?? 0) || 0;
            const fortHpAtEnd = Math.max(
              0,
              Number(resolvedBattle.finalFortHP ?? fortHpAtStart) || 0,
            );
            const attackerFortDamageDealt = Math.max(
              0,
              fortHpAtStart - fortHpAtEnd,
            );
            DefensePlayer.fortHitpoints = fortHpAtEnd;

            const isAttackerWinner = resolvedBattle.result === 'WIN';

            resolvedBattle.experienceGained.attacker = Math.min(
              2147483647 - AttackPlayer.experience,
              Math.floor(
                resolvedBattle.experienceGained.attacker *
                  eventModifiers.xpMultiplier,
              ),
            );
            resolvedBattle.experienceGained.defender = Math.min(
              2147483647 - DefensePlayer.experience,
              Math.floor(
                resolvedBattle.experienceGained.defender *
                  eventModifiers.xpMultiplier,
              ),
            );
            logDebug('XP Distribution:', {
              isAttackerWinner,
              attackerXP: resolvedBattle.experienceGained.attacker,
              defenderXP: resolvedBattle.experienceGained.defender,
              attackerName: AttackPlayer.displayName,
              defenderName: DefensePlayer.displayName,
            });

            AttackPlayer.experience += resolvedBattle.experienceGained.attacker;
            DefensePlayer.experience +=
              resolvedBattle.experienceGained.defender;

            // The engine reduces its working treasury while simulating phases.
            // Persist the one transfer, validated against the locked treasury.
            const pillage = BigInt(resolvedBattle.pillagedGold);
            if (pillage < 0n || pillage > defenderGoldAtStart) {
              throw new Error('Battle pillage violates the captured treasury');
            }

            // Logs, outcome economics and bank history share the engine's amount.
            const attackerLossesTotal =
              resolvedBattle.Losses.Attacker.total +
              (resolvedBattle.wounded?.attacker ?? []).reduce(
                (sum, loss) => sum + loss.quantity,
                0,
              );
            const defenderLossesTotal =
              resolvedBattle.Losses.Defender.total +
              (resolvedBattle.wounded?.defender ?? []).reduce(
                (sum, loss) => sum + loss.quantity,
                0,
              );

            const attack_log = await createAttackLog(
              {
                timestamp: new Date().toISOString(),
                winner: isAttackerWinner ? attackerId : defenderId,
                pillaged_gold: resolvedBattle.pillagedGold
                  ? BigInt(String(resolvedBattle.pillagedGold))
                  : BigInt(0),
                attacker_losses_total: attackerLossesTotal,
                defender_losses_total: defenderLossesTotal,
                stats: {
                  adminSnapshots: {
                    version: 1,
                    before: {
                      attacker: combatSnapshot(startOfAttack.Attacker),
                      defender: combatSnapshot(startOfAttack.Defender),
                    },
                    after: {
                      // Persisted gold changes are deltas from the locked rows.
                      attacker: {
                        ...combatSnapshot(captureCombatUser(AttackPlayer)),
                        gold: (
                          BigInt(startOfAttack.Attacker.gold) + pillage
                        ).toString(),
                      },
                      defender: {
                        ...combatSnapshot(captureCombatUser(DefensePlayer)),
                        gold: (defenderGoldAtStart - pillage).toString(),
                      },
                    },
                  },
                  startOfAttack: {
                    Attacker: {
                      experience: startOfAttack.Attacker.experience,
                      units: [
                        ...startOfAttack.Attacker.units,
                        ...startOfAttack.Attacker.mercenaries,
                      ]
                        .filter((unit) => unit.type === 'OFFENSE')
                        .map(({ type, level, quantity }) => ({
                          type,
                          level,
                          quantity,
                        })),
                    },
                    Defender: { experience: startOfAttack.Defender.experience },
                  },
                  replay: sealedReplay,
                  endTurns: AttackPlayer.attackTurns,
                  attackerDamageDealt:
                    attackerUnitDamageDealt + attackerFortDamageDealt,
                  attackerUnitDamageDealt,
                  attackerFortDamageDealt,
                  defenderDamageDealt: defenderUnitDamageDealt,
                  defenderUnitDamageDealt,
                  defensePointsAtEnd: DefensePlayer.defense,
                  // Convert BigInt to string for JSON compatibility
                  pillagedGold: resolvedBattle.pillagedGold.toString(),
                  forthpAtStart: fortHpAtStart,
                  forthpAtEnd: fortHpAtEnd,
                  // Stringify potentially complex objects within stats
                  xpEarned: JSON.stringify(resolvedBattle.experienceGained),
                  turns: committedTurns,
                  attacker_units: JSON.stringify(
                    AttackPlayer.getUnitsForDbUpdate(),
                  ),
                  defender_units: JSON.stringify(
                    DefensePlayer.getUnitsForDbUpdate(),
                  ),
                  attacker_mercenaries: JSON.stringify(
                    AttackPlayer.getMercenariesForDbUpdate(),
                  ),
                  defender_mercenaries: JSON.stringify(
                    DefensePlayer.getMercenariesForDbUpdate(),
                  ),
                  attacker_losses: JSON.stringify(
                    resolvedBattle.Losses.Attacker,
                  ),
                  defender_losses: JSON.stringify(
                    resolvedBattle.Losses.Defender,
                  ),
                  wounded: JSON.stringify(
                    (resolvedBattle as any).wounded ?? {
                      attacker: [],
                      defender: [],
                    },
                  ),
                  routed_stacks: JSON.stringify(
                    (resolvedBattle as any).routedStacks ?? [],
                  ),
                  defender_daily_allowance_remaining:
                    defenderDailyAllowanceRemaining,
                  canonical_outcome:
                    (resolvedBattle as any).canonicalOutcome ?? null,
                  defender_daily_gold_remaining:
                    defenderDailyGoldRemaining.toString(),
                  mitigation_log: JSON.stringify(
                    (resolvedBattle as any).mitigationLog ?? [],
                  ),
                  mitigation_summary: JSON.stringify(
                    (resolvedBattle as any).casualtySummary?.mitigation ?? null,
                  ),
                  battle_contributions: {
                    attacker: attackerContribution,
                    defender: defenderContribution,
                    mitigation:
                      (resolvedBattle as any).casualtySummary?.mitigation ??
                      null,
                  },
                  win_probability_proxy: winProbabilityProxy,
                  fort_breached: !!((resolvedBattle as any).finalFortHP <= 0),
                  defender_fort_level: DefensePlayer.fortLevel,
                  defender_protected: defenderProtected,
                },
                // Connect to users via relation fields
                attackerPlayer: { connect: { id: attackerId } },
                defenderPlayer: { connect: { id: defenderId } },
              },
              tx,
            );

            // Record bank history for the actual carried-off pillage amount
            if (pillage > BigInt(0)) {
              await createBankHistory(
                {
                  gold_amount: pillage,
                  from_user_id: defenderId,
                  from_user_account_type: 'HAND',
                  to_user_id: attackerId,
                  to_user_account_type: 'HAND',
                  date_time: new Date().toISOString(),
                  history_type: 'WAR_SPOILS',
                  stats: { type: 'ATTACK', attackID: attack_log.id },
                },
                tx,
              );
            }

            // Persist updated unit counts for both players
            await updateUserUnits(
              attackerId,
              [
                ...AttackPlayer.getUnitsForDbUpdate(),
                ...AttackPlayer.getMercenariesForDbUpdate(),
              ],
              tx,
            );
            await updateUserUnits(
              defenderId,
              [
                ...DefensePlayer.getUnitsForDbUpdate(),
                ...DefensePlayer.getMercenariesForDbUpdate(),
              ],
              tx,
            );

            // Move wounded units (removed from rosters by the battle) into the
            // recovering pool; daily cron healing returns them to active duty.
            const persistWounded = async (
              userId: number,
              wounded:
                | Array<{
                    type: string;
                    level: number;
                    quantity: number;
                    isMercenary: boolean;
                  }>
                | undefined,
            ): Promise<void> => {
              if (!wounded?.length) return;
              const existingUser = await tx.users.findUnique({
                where: { id: userId },
                select: { wounded_units: true },
              });
              const existing = Array.isArray(existingUser?.wounded_units)
                ? (existingUser?.wounded_units as Array<{
                    type?: string;
                    level?: number;
                    quantity?: number;
                    isMercenary?: boolean;
                    woundedAt?: string;
                  }>)
                : [];
              const merged = [...existing];
              for (const group of wounded) {
                const match = merged.find(
                  (m) =>
                    m?.type === group.type &&
                    m?.level === group.level &&
                    !!m?.isMercenary === !!group.isMercenary,
                );
                if (match) {
                  match.quantity = Number(match.quantity ?? 0) + group.quantity;
                } else {
                  merged.push({
                    ...group,
                    woundedAt: new Date().toISOString(),
                  });
                }
              }
              await tx.users.update({
                where: { id: userId },
                data: { wounded_units: merged },
              });
            };
            await persistWounded(
              attackerId,
              (resolvedBattle as any).wounded?.attacker,
            );
            await persistWounded(
              defenderId,
              (resolvedBattle as any).wounded?.defender,
            );

            // Increment stats for both users
            await incrementUserStats(
              attackerId,
              {
                type: 'OFFENSE',
                subtype: isAttackerWinner ? 'WON' : 'LOST',
              },
              tx,
            );

            await incrementUserStats(
              defenderId,
              {
                type: 'DEFENSE',
                subtype: !isAttackerWinner ? 'WON' : 'LOST',
              },
              tx,
            );

            // Use the new public method to get detailed stats with totalStats property
            const newAttOffense = AttackPlayer.getDetailedArmyStat('OFFENSE');
            const newAttDefense = AttackPlayer.getDetailedArmyStat('DEFENSE');
            const newAttSpying = AttackPlayer.getDetailedArmyStat('SPY');
            const newAttSentry = AttackPlayer.getDetailedArmyStat('SENTRY');

            // Use the new public method to get detailed stats with totalStats property
            const newDefOffense = DefensePlayer.getDetailedArmyStat('OFFENSE');
            const newDefDefense = DefensePlayer.getDetailedArmyStat('DEFENSE');
            const newDefSpying = DefensePlayer.getDetailedArmyStat('SPY');
            const newDefSentry = DefensePlayer.getDetailedArmyStat('SENTRY');

            // An attacker with an open alliance loan sends a share of the
            // pillage to the treasury; the attacker row is locked above.
            const loanRepayment = await divertIncomeToLoans(
              tx,
              attackerId,
              pillage,
              'pillage',
            );

            // Gold, turns and stamina are relative to the locked row, never absolute.
            await updateUser(
              attackerId,
              {
                gold: { increment: pillage - loanRepayment },
                attack_turns: { decrement: committedTurns },
                stamina: { decrement: committedTurns },
                experience: Math.ceil(AttackPlayer.experience),
                offense: newAttOffense.totalStats.MeleeAtkPower,
                defense: newAttDefense.totalStats.MeleeDefPower,
                spy: newAttSpying.totalStats.MeleeAtkPower,
                sentry: newAttSentry.totalStats.MeleeDefPower,
              } satisfies Prisma.usersUpdateInput,
              tx,
            );

            await updateUser(
              defenderId,
              {
                gold: { decrement: pillage },
                fort_hitpoints: Math.max(DefensePlayer.fortHitpoints, 0),
                experience: Math.ceil(DefensePlayer.experience),
                offense: newDefOffense.totalStats.MeleeAtkPower,
                defense: newDefDefense.totalStats.MeleeDefPower,
                spy: newDefSpying.totalStats.MeleeAtkPower,
                sentry: newDefSentry.totalStats.MeleeDefPower,
                defense_pressure_today: currentDefensePressure + committedTurns,
                defense_pressure_date: new Date(),
              } satisfies Prisma.usersUpdateInput,
              tx,
            );

            // The outbox insert commits with combat; SMTP runs later in the worker.
            await enqueueBattleAlert(tx, {
              defenderId,
              attackerName: AttackPlayer.displayName,
              attackLogId: attack_log.id,
              defenderWon: !isAttackerWinner,
            });

            return {
              status: 'success',
              result: isAttackerWinner,
              attack_log: attack_log.id,
              extra_variables: stringifyObj({
                fortDmgTotal: fortHpAtStart - fortHpAtEnd,
                BattleResults: resolvedBattle,
              }),
            };
          },
          { timeout: ATTACK_TX_TIMEOUT_MS, maxWait: ATTACK_TX_TIMEOUT_MS },
        );
        // Pillage diverted to a loan is parked on the loan; move it into the
        // treasury now under the alliance lock (logs and swallows its errors).
        await settleLoanTreasuryCredits();
        return outcome;
      } catch (error) {
        logError('Transaction failed: ', error);
        return {
          status: 'failed',
          message: 'Transaction failed.',
          code: 'TRANSACTION_FAILED',
        };
      }
    } catch (error) {
      logError('Attack execution failed: ', error);
      return {
        status: 'failed',
        message: 'Attack execution failed.',
        code: 'ATTACK_EXECUTION_FAILED',
      };
    }
  },
};
