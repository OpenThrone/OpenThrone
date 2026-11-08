import { randomUUID } from 'crypto';

import { HouseUpgrades, UnitTypes } from '@/constants';
import { hasFeature } from '@/constants/FeatureUnlocks';
import {
  applyMoraleDelta,
  KINGDOM_MORALE_DEFAULT,
  MORALE_DEFENSE_LOST,
  MORALE_DEFENSE_WON,
  repelledPressureRecovery,
} from '@/constants/KingdomMorale';
import {
  disciplineMoraleFloor,
  raidersCapturePercent,
} from '@/constants/RacialPerks';
import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import { BattleUser } from '@/models/BattleUser';
import UserModel from '@/models/Users';
import {
  divertIncomeToLoansDetailed,
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
import { CaptiveService } from '@/services/Captives.service';
import { enqueueDiscordAlert } from '@/services/discord/DiscordAlerts.service';
import { siteUrl } from '@/services/discord/DiscordApi';
import { hasForbiddenForceTarget } from '@/services/ForceLifecycle.service';
import { divertForcePillageInTx } from '@/services/ForcePillage.service';
import { getBattleGameEventContext } from '@/services/GameEventRuntime.service';
import {
  reanimatedUnitsTotal,
  type ReanimationBattleOutcome,
  ReanimationService,
} from '@/services/Reanimation.service';
import { getRuntimeConfig } from '@/services/RuntimeConfig.service';
import { SanctuaryService } from '@/services/Sanctuary.service';
import { getActiveAccountStatus } from '@/services/User.service';
import { combatSnapshot } from '@/utils/adminCombat';
import { recomputeStoredStatsInTx } from '@/utils/adminRecomputeStats';
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
import { lockEraLifecycleShared } from '@/utils/eraLifecycleLock';
import { gameDaysAtLevel, levelReachedAtUpdate } from '@/utils/levelReachedAt';
import { logDebug, logError } from '@/utils/logger';
import { stringifyObj } from '@/utils/numberFormatting';
import { formatPairCapWait } from '@/utils/pairCapMessage';
import { createCombatRandom } from '@/utils/serverRandom';
import {
  DEFAULT_STAMINA_RULES,
  projectStamina,
  staminaCost,
} from '@/utils/stamina';
import {
  getGameDayKey,
  getGameDayMs,
  getGameDayStart,
} from '@/utils/timefunctions';

/**
 * Pair-cap refusal text. The cap is a rolling game-day window, so the message
 * says when the next attack on this kingdom opens (#359).
 */
export function formatPairCapMessage(
  limit: number,
  opensAt: Date | null,
  now: Date = new Date(),
): string {
  const base = `You have reached the limit of ${limit} attacks on this player per rolling game day.`;
  if (!opensAt) return base;
  return `${base} You can attack them again in ${formatPairCapWait(opensAt, now)}.`;
}

/** Same per-pair cap as AttackValidationService.canAttack (5 per 24 hours). */
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

      const { modifiers: eventModifiers, snapshot: gameEvents } =
        await getBattleGameEventContext();

      try {
        const outcome = await prisma.$transaction(
          async (tx) => {
            await lockEraLifecycleShared(tx);
            const runtimeConfig = await getRuntimeConfig(tx);
            if (!runtimeConfig.enableAttacking) {
              return {
                status: 'failed',
                message: 'Attacking is currently disabled.',
                code: 'ATTACKING_DISABLED',
              };
            }

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

            if (await hasForbiddenForceTarget(tx, attackerId, defenderId))
              return {
                status: 'failed',
                message:
                  'Return alliance troops before targeting a member of their alliance.',
                code: 'ALLIANCE_FORCE_TARGET_FORBIDDEN',
              };
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

            const rules = runtimeConfig.stamina ?? DEFAULT_STAMINA_RULES;
            const projected = projectStamina(attackerUser, rules);
            attacker.stamina = rules.enabled ? projected.stamina : 100;
            const cost = Math.min(
              projected.stamina,
              staminaCost(
                committedTurns,
                rules,
                new UserModel(attackerUser).offensiveLevel,
              ),
            );

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
            const pairWindow = {
              attacker_id: attackerId,
              defender_id: defenderId,
              type: 'attack',
              voidedAt: null,
              timestamp: {
                gte: new Date(Date.now() - getGameDayMs()),
              },
            };
            const pairAttacks = await tx.attack_log.count({
              where: pairWindow,
            });
            const pairLimit = runtimeConfig.pairDailyLimit ?? 5;
            if (pairAttacks >= pairLimit) {
              // The window is rolling: a slot opens when the attack that put
              // the pair over the cap ages out, not at a day boundary (#359).
              const freeing = await tx.attack_log.findFirst({
                where: pairWindow,
                orderBy: { timestamp: 'asc' },
                skip: pairAttacks - pairLimit,
                select: { timestamp: true },
              });
              const opensAt = freeing?.timestamp
                ? new Date(
                    new Date(freeing.timestamp).getTime() + getGameDayMs(),
                  )
                : null;
              return {
                status: 'failed',
                message: formatPairCapMessage(pairLimit, opensAt),
                code: 'TOO_MANY_ATTACKS',
                ...(opensAt
                  ? {
                      extra_variables: {
                        limit: pairLimit,
                        nextAttackAt: opensAt.toISOString(),
                      },
                    }
                  : {}),
              };
            }

            // Friendly fire stays allowed but must be acknowledged after
            // the other refusal checks have passed.
            if (!options.confirmAllianceAttack) {
              const sharedMembership = await tx.alliance_memberships.findFirst({
                where: {
                  user_id: attackerId,
                  // A RESERVED alliance is not an alliance in play (#13).
                  alliance: {
                    status: 'ACTIVE',
                    members: { some: { user_id: defenderId } },
                  },
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
            const startOfToday = getGameDayStart();
            // Assassinations draw from the same pool as battle losses.
            const todayLossesAgg = await tx.attack_log.aggregate({
              where: {
                defender_id: defenderId,
                type: { in: ['attack', 'ASSASSINATE'] },
                // A voided battle's casualties and loot were compensated.
                voidedAt: null,
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
            const todayKey = getGameDayKey();
            const pressureDateKey = DefensePlayer.defensePressureDate
              ? getGameDayKey(new Date(DefensePlayer.defensePressureDate))
              : todayKey;
            const currentDefensePressure =
              pressureDateKey === todayKey
                ? DefensePlayer.defensePressureToday
                : 0;
            // Garrison fatigue reads this; with ENABLE_GARRISON_FATIGUE off the
            // battle (and its replay) sees no pressure. Today's pressure is
            // still recorded from currentDefensePressure below.
            DefensePlayer.defensePressureToday =
              runtimeConfig.enableGarrisonFatigue ? currentDefensePressure : 0;
            if (
              AttackPlayer.defensePressureDate &&
              getGameDayKey(new Date(AttackPlayer.defensePressureDate)) !==
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
            // Why the defender was (or was not) protected, for diagnostics.
            const defenderProtectionStatus =
              DefensePlayer.getProtectionStatus();
            const defenderProtection = defenderProtectionStatus
              ? {
                  protected: defenderProtectionStatus.protected,
                  reason: defenderProtectionStatus.reason,
                  endsAt:
                    defenderProtectionStatus.endsAt?.toISOString() ?? null,
                  level: defenderProtectionStatus.level,
                  levelLimit: defenderProtectionStatus.levelLimit,
                  population: defenderProtectionStatus.population,
                  populationThreshold:
                    defenderProtectionStatus.populationThreshold,
                }
              : null;
            const combatRandom = createCombatRandom('attack');
            // Anti-camping XP ramp (combat-v11, #334): game days the defender
            // has held their level, fixed now and sealed into the replay.
            const battleTime = new Date();
            const defenderGameDaysAtLevel = gameDaysAtLevel(
              defenderUser.level_reached_at,
              battleTime,
            );
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
              staminaPenaltyThreshold: rules.penaltyThreshold,
              staminaMinMultiplier: rules.minOffensePercent / 100,
              defenderGameDaysAtLevel,
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
                staminaPenaltyThreshold: rules.penaltyThreshold,
                staminaMinMultiplier: rules.minOffensePercent / 100,
                defenderGameDaysAtLevel,
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

            // HP of units killed outright (losses after the wounded split), not
            // the damage dealt; see stats.damage_audit for damage in/applied/capped.
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
            AttackPlayer.stamina = Math.max(0, AttackPlayer.stamina - cost);
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

            // Kingdom morale (#205) exemptions are computed once, before the
            // log is written, because the captive hook below needs the same
            // verdict: protected new players and non-ACTIVE defenders
            // (vacation etc.) never lose morale OR captives.
            const defenderExemptFromMorale =
              defenderProtected ||
              (await getActiveAccountStatus(defenderId, tx)) !== null;

            // Dungeon captives (#210): a won battle that breached the fort
            // takes 10% of the defender's killed combat units captive when
            // the attacker runs a dungeon. Capture never changes the battle's
            // outcome or loot; units beyond the dungeon's capacity die as
            // before. The attacker row is locked above, so the capacity read
            // is authoritative. While the dungeon is hidden from players
            // (SHOW_DUNGEON off) nothing is captured: those units simply die,
            // exactly as they do for the defender either way.
            let captivesTaken = 0;
            let capturedRows: Array<{
              id: number;
              type: string;
              level: number;
              quantity: number;
            }> = [];
            if (
              runtimeConfig.showDungeon &&
              isAttackerWinner &&
              fortHpAtEnd <= 0 &&
              !defenderExemptFromMorale &&
              hasFeature(
                {
                  economyLevel: attackerUser.economy_level ?? 0,
                  fortLevel: attackerUser.fort_level ?? 0,
                  race: attackerUser.race,
                },
                'DUNGEON',
              )
            ) {
              const captured = await CaptiveService.captureFromBattleDetailed(
                tx,
                {
                  captorId: attackerId,
                  sourceId: defenderId,
                  eraId: attackerUser.currentEraId,
                  captorFortLevel: attackerUser.fort_level ?? 0,
                  killedUnits: resolvedBattle.Losses.Defender.units,
                },
              );
              captivesTaken = captured.taken;
              capturedRows = captured.rows;
            }

            // Undead reanimation (#211): every UNDEAD side with the feature
            // raises a share of its own fallen and of the enemy's dead as
            // level-1 units, capped per OT day at 2% of its trained combat
            // army. The same exemptions the morale pass and the captives hook
            // use skip it entirely: nothing happens against protected or
            // non-ACTIVE defenders. The grants themselves are applied to the
            // rosters AFTER updateUserUnits below, which rewrites every stack
            // from the battle's survivors.
            // Elf Sanctuary (#231) runs first: recovered defenders are alive
            // again and must not also rise for an Undead attacker.
            const sanctuary =
              !defenderExemptFromMorale && defenderUser.race === 'ELF'
                ? await SanctuaryService.recover(
                    tx,
                    defenderId,
                    defenderUser.racial_perk_tier,
                    resolvedBattle.Losses.Defender.units,
                    captivesTaken,
                  )
                : [];
            const sanctuaryRecovered = sanctuary.reduce(
              (sum, grant) => sum + grant.quantity,
              0,
            );

            let reanimation: ReanimationBattleOutcome = {
              attacker: [],
              defender: [],
            };
            if (runtimeConfig.enableReanimation && !defenderExemptFromMorale) {
              reanimation = await ReanimationService.reanimateFromBattle(tx, {
                attacker: {
                  userId: attackerId,
                  fortLevel: attackerUser.fort_level ?? 0,
                  economyLevel: attackerUser.economy_level ?? 0,
                  race: attackerUser.race,
                  racialTier: attackerUser.racial_perk_tier,
                },
                defender: {
                  userId: defenderId,
                  fortLevel: defenderUser.fort_level ?? 0,
                  economyLevel: defenderUser.economy_level ?? 0,
                  race: defenderUser.race,
                  racialTier: defenderUser.racial_perk_tier,
                },
                attackerKilledUnits: resolvedBattle.Losses.Attacker.units,
                defenderKilledUnits: resolvedBattle.Losses.Defender.units,
                captivesTaken,
                defenderRacialTier: defenderUser.racial_perk_tier,
                defenderRecovered: sanctuary,
              });
            }

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

            const attackerExperienceBefore = AttackPlayer.experience;
            const defenderExperienceBefore = DefensePlayer.experience;
            AttackPlayer.experience += resolvedBattle.experienceGained.attacker;
            DefensePlayer.experience +=
              resolvedBattle.experienceGained.defender;

            // The engine reduces its working treasury while simulating phases.
            // Persist the one transfer, validated against the locked treasury.
            const pillage = BigInt(resolvedBattle.pillagedGold);
            if (pillage < 0n || pillage > defenderGoldAtStart) {
              throw new Error('Battle pillage violates the captured treasury');
            }

            const forcePillageKey = randomUUID();
            const forceContribution = await divertForcePillageInTx(
              tx,
              attackerId,
              pillage,
              forcePillageKey,
            );
            const loanDiversion = await divertIncomeToLoansDetailed(
              tx,
              attackerId,
              pillage - forceContribution,
              'pillage',
            );
            const loanRepayment = loanDiversion.diverted;

            // Kingdom morale (#205) and garrison pressure the defender row gets
            // below; computed here so the void ledger (#229) can record them.
            const defenderMoraleBefore = Number(
              defenderUser.kingdom_morale ?? KINGDOM_MORALE_DEFAULT,
            );
            const defenderMoraleAfter = Math.max(
              disciplineMoraleFloor(
                defenderUser.race === 'HUMAN'
                  ? defenderUser.racial_perk_tier
                  : 0,
              ),
              applyMoraleDelta(
                defenderMoraleBefore,
                isAttackerWinner ? MORALE_DEFENSE_LOST : MORALE_DEFENSE_WON,
              ),
            );
            const defensePressureAfter = isAttackerWinner
              ? currentDefensePressure + committedTurns
              : repelledPressureRecovery(
                  currentDefensePressure,
                  committedTurns,
                );

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
                  gameEvents,
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
                  forcePillageContribution: forceContribution.toString(),
                  goldLoanRepayment: loanRepayment.toString(),
                  netPillageGold: (
                    pillage -
                    forceContribution -
                    loanRepayment
                  ).toString(),
                  forcePillageKey,
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
                  damage_audit: JSON.stringify(
                    (resolvedBattle as any).damageAudit ?? null,
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
                  defender_protection: defenderProtection,
                  // Garrison fatigue applied to the defender's power (#204),
                  // as a whole percent, for "Garrison fatigue: -X%" display.
                  defender_fatigue_percent:
                    resolvedBattle.defenderFatiguePercent,
                  attacker_fatigue_percent:
                    resolvedBattle.attackerFatiguePercent,
                  stamina_cost: cost,
                  // Dungeon captives taken by the attacker (#210), for the
                  // "Captives taken: N" report line on both sides.
                  captives_taken: captivesTaken,
                  raiders_capture_percent:
                    attackerUser.race === 'GOBLIN' &&
                    attackerUser.racial_perk_tier > 0
                      ? Math.round(
                          100 *
                            raidersCapturePercent(
                              attackerUser.racial_perk_tier,
                            ),
                        )
                      : 0,
                  necropolis_bonus: {
                    attacker: reanimation.attackerBonus ?? 0,
                    defender: reanimation.defenderBonus ?? 0,
                  },
                  sanctuary_recovered: sanctuaryRecovered,
                  hallowed_blocked: reanimation.blocked ?? 0,
                  // Undead reanimation (#211): how many fallen rose for each
                  // side. The report redaction shows each side only its own
                  // count, so the opponent never learns it.
                  reanimated_units: {
                    attacker: reanimatedUnitsTotal(reanimation.attacker),
                    defender: reanimatedUnitsTotal(reanimation.defender),
                  },
                  // What the battle changed beyond the headline numbers, kept
                  // so an admin void (#229) can reverse each effect exactly.
                  // Never shown to players (report redaction is an allowlist).
                  voidLedger: {
                    version: 1,
                    loanRepayments: loanDiversion.repayments.map((entry) => ({
                      loanId: entry.loanId,
                      allianceId: entry.allianceId,
                      amount: entry.amount.toString(),
                    })),
                    reanimation: {
                      day: getGameDayKey(),
                      attacker: reanimation.attacker.map((grant) => ({
                        ...grant,
                      })),
                      defender: reanimation.defender.map((grant) => ({
                        ...grant,
                      })),
                    },
                    sanctuary: {
                      day: getGameDayKey(),
                      grants: sanctuary.map((grant) => ({ ...grant })),
                    },
                    captives: capturedRows,
                    morale: {
                      applied: !defenderExemptFromMorale,
                      before: defenderMoraleBefore,
                      after: defenderMoraleAfter,
                    },
                    pressure: {
                      day: todayKey,
                      before: currentDefensePressure,
                      after: defensePressureAfter,
                    },
                  },
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

            // Move wounded units (removed from rosters by the battle) into the
            // recovering pool; daily cron healing returns them to active duty.
            const persistWounded = async (
              userId: number,
              wounded:
                | Array<{
                    type: string;
                    level: number;
                    quantity: number;
                    forceContractId?: number;
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
                    forceContractId?: number;
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
                    !!m?.isMercenary === !!group.isMercenary &&
                    m.forceContractId === group.forceContractId,
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

            // Undead reanimation (#211): the risen dead join the rosters only
            // now — updateUserUnits above rewrites every stack from the
            // battle's in-memory survivors and deletes stacks outside that
            // roster, so an earlier write would be lost. Same transaction, so
            // the grants can never be half-applied.
            await ReanimationService.applyReanimatedUnits(
              tx,
              attackerId,
              reanimation.attacker,
            );
            await ReanimationService.applyReanimatedUnits(
              tx,
              defenderId,
              reanimation.defender,
            );
            await SanctuaryService.apply(tx, defenderId, sanctuary);

            // Undead reanimation (#211): the cached army stats below must
            // reflect the persisted roster, but the in-memory survivors do
            // not include the level-1 stacks the grants just wrote. A side
            // that received units re-reads its locked row here (the roster
            // writes above are already visible in this transaction) and
            // recomputes its stats from that roster — the same
            // getDetailedArmyStat calculation the survivors path uses; a
            // side without grants keeps its survivors' stats.
            const statSourceAfterGrants = async (
              userId: number,
              grants: ReanimationBattleOutcome['attacker'],
              fallback: BattleUser,
            ): Promise<BattleUser> => {
              if (reanimatedUnitsTotal(grants) <= 0) return fallback;
              const freshUser = await getUserById(userId, tx);
              return freshUser ? new BattleUser(freshUser) : fallback;
            };
            const attackerStatSource = await statSourceAfterGrants(
              attackerId,
              reanimation.attacker,
              AttackPlayer,
            );
            const defenderStatSource = await statSourceAfterGrants(
              defenderId,
              [
                ...reanimation.defender,
                ...sanctuary.map((grant) => ({
                  unitType: grant.type,
                  quantity: grant.quantity,
                })),
              ],
              DefensePlayer,
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
            const newAttOffense =
              attackerStatSource.getDetailedArmyStat('OFFENSE');
            const newAttDefense =
              attackerStatSource.getDetailedArmyStat('DEFENSE');
            const newAttSpying = attackerStatSource.getDetailedArmyStat('SPY');
            const newAttSentry =
              attackerStatSource.getDetailedArmyStat('SENTRY');

            // Use the new public method to get detailed stats with totalStats property
            const newDefOffense =
              defenderStatSource.getDetailedArmyStat('OFFENSE');
            const newDefDefense =
              defenderStatSource.getDetailedArmyStat('DEFENSE');
            const newDefSpying = defenderStatSource.getDetailedArmyStat('SPY');
            const newDefSentry =
              defenderStatSource.getDetailedArmyStat('SENTRY');

            // An attacker with an open alliance loan sends a share of the
            // pillage to the treasury; the attacker row is locked above.
            // Gold, turns and stamina are relative to the locked row, never absolute.
            await updateUser(
              attackerId,
              {
                gold: {
                  increment: pillage - forceContribution - loanRepayment,
                },
                attack_turns: { decrement: committedTurns },
                stamina: projected.stamina - cost,
                staminaUpdatedAt: projected.staminaUpdatedAt,
                experience: Math.ceil(AttackPlayer.experience),
                ...levelReachedAtUpdate(
                  attackerExperienceBefore,
                  Math.ceil(AttackPlayer.experience),
                  battleTime,
                ),
                offense: newAttOffense.totalStats.MeleeAtkPower,
                defense: newAttDefense.totalStats.MeleeDefPower,
                spy: newAttSpying.totalStats.MeleeAtkPower,
                sentry: newAttSentry.totalStats.MeleeDefPower,
              } satisfies Prisma.usersUpdateInput,
              tx,
            );

            // Kingdom morale (#205): defenses harden morale when they hold and
            // crack when they fall. Protected new players and non-ACTIVE
            // defenders (vacation etc.) are exempt — the same rule the daily
            // morale pass applies — so battle never moves their morale. The
            // defender row is locked above, so this write is authoritative
            // inside the same battle transaction. (defenderExemptFromMorale
            // was computed before the attack log was written, above.)
            await updateUser(
              defenderId,
              {
                gold: { decrement: pillage },
                fort_hitpoints: Math.max(DefensePlayer.fortHitpoints, 0),
                experience: Math.ceil(DefensePlayer.experience),
                ...levelReachedAtUpdate(
                  defenderExperienceBefore,
                  Math.ceil(DefensePlayer.experience),
                  battleTime,
                ),
                offense: newDefOffense.totalStats.MeleeAtkPower,
                defense: newDefDefense.totalStats.MeleeDefPower,
                spy: newDefSpying.totalStats.MeleeAtkPower,
                sentry: newDefSentry.totalStats.MeleeDefPower,
                // Exempt defenders keep their morale; the delta is skipped
                // both when the wall holds (+2) and when it falls (-3).
                ...(defenderExemptFromMorale
                  ? {}
                  : { kingdom_morale: defenderMoraleAfter }),
                // Garrison fatigue (#204): pressure accrues per turn defended,
                // but a repelled attack refunds only half its turns (it nets
                // +ceil(turns/2)), so it never erases the pressure earlier
                // attackers built up today.
                defense_pressure_today: defensePressureAfter,
                defense_pressure_date: new Date(),
              } satisfies Prisma.usersUpdateInput,
              tx,
            );

            // Casualties changed contract survivors; refresh the strength columns too.
            await recomputeStoredStatsInTx(tx, attackerId, new Date(), {
              strengthOnly: true,
            });
            await recomputeStoredStatsInTx(tx, defenderId, new Date(), {
              strengthOnly: true,
            });

            // The outbox insert commits with combat; SMTP runs later in the worker.
            await enqueueBattleAlert(tx, {
              defenderId,
              attackerName: AttackPlayer.displayName,
              attackLogId: attack_log.id,
              defenderWon: !isAttackerWinner,
            });
            await enqueueDiscordAlert(tx, {
              userId: defenderId,
              kind: 'attacks',
              eventKey: `attack:${attack_log.id}`,
              text: 'alert.attacks',
              vars: {
                attacker: AttackPlayer.displayName,
                kingdom: DefensePlayer.displayName,
                outcome: {
                  key: isAttackerWinner
                    ? 'alert.attackLost'
                    : 'alert.attackWon',
                },
                url: siteUrl(`/battle/results/${attack_log.id}`),
              },
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
