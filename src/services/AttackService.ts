import { UnitTypes } from '@/constants';
import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import { BattleUser } from '@/models/BattleUser';
import {
  createAttackLog,
  createBankHistory,
  getUserById,
  incrementUserStats,
  updateUser,
  updateUserUnits,
} from '@/services/AttackDataService';
import { canAttack } from '@/services/AttackValidationService';
import {
  calculateBattleExperience,
  calculateFortDamage,
  calculateLoot,
  calculateRecoveryFactor,
  calculateReinforcementModifier,
  calculateStaminaDrop,
  calculateStaminaModifier,
  calculateStrength,
  executeAttack,
  newComputeCasualties,
  simulateBattle,
} from '@/utils/attackFunctions';
import {
  computeBattleWinProbabilityProxy,
  totalCombatPower,
} from '@/utils/balance/effectiveStats';
import { V5_COMBAT_CONSTANTS } from '@/utils/balance/v5Combat';
import { logDebug, logError } from '@/utils/logger';
import { stringifyObj } from '@/utils/numberFormatting';
import { deepClone } from '@/utils/utilities';

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
  calculateStaminaDrop,
  calculateFortDamage,
  calculateBattleExperience,
  newComputeCasualties,
  calculateStaminaModifier,
  calculateReinforcementModifier,
  calculateRecoveryFactor,

  /**
   * Handles standard attacks between two users.
   * @param attackerId - The ID of the attacking user.
   * @param defenderId - The ID of the defending user.
   * @param attack_turns - The number of attack turns to use.
   * @returns An object indicating the status ('success' or 'failed'), results, and attack log ID.
   */
  async executeAttack(
    attackerId: number,
    defenderId: number,
    attack_turns: number,
  ) {
    logDebug('Attack initiated', { attackerId, defenderId, attack_turns });

    try {
      const attackerUser = await getUserById(attackerId);
      const defenderUser = await getUserById(defenderId);

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

      if (process.env.NEXT_PUBLIC_ENABLE_ATTACKING === 'false') {
        return {
          status: 'failed',
          message: 'Attacking is currently disabled.',
          code: 'ATTACKING_DISABLED',
        };
      }

      // Check if both users exist and if the attacker has enough attack turns
      if (!attacker || !defender) {
        logError('User model creation failed', {
          attacker: !!attacker,
          defender: !!defender,
        });
        return {
          status: 'failed',
          message: 'Invalid user data',
          code: 'INVALID_USER_DATA',
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

      const AttackPlayer = attacker;
      const DefensePlayer = defender;

      // Enhanced strength calculation with unit-item allocation and battle upgrades
      const attackerStrengthObj = this.calculateStrength(
        AttackPlayer,
        'OFFENSE',
        false,
      );
      const defenderStrengthObj = this.calculateStrength(
        DefensePlayer,
        'DEFENSE',
        false,
      );
      const attackerOffenseKS = attackerStrengthObj.totalStats.MeleeAtkPower;
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

      if (!AttackPlayer.canAttack(DefensePlayer.level)) {
        return {
          status: 'failed',
          message: `You can only attack within ${process.env.NEXT_PUBLIC_ATTACK_LEVEL_RANGE} levels of your own level.`,
          code: 'LEVEL_RANGE_EXCEEDED',
        };
      }

      if (
        (await canAttack({ id: AttackPlayer.id }, { id: DefensePlayer.id })) ===
        false
      ) {
        return {
          status: 'failed',
          message:
            'You have attacked this player too many times in the last 24 hours.',
          code: 'TOO_MANY_ATTACKS',
        };
      }

      const startOfAttack = {
        Attacker: stringifyObj(deepClone(AttackPlayer)),
        Defender: stringifyObj(deepClone(DefensePlayer)),
      };

      logDebug('Start of Attack State:', { startOfAttack });

      // Enhanced battle simulation with all factors
      const battleResults = await executeAttack(
        AttackPlayer,
        DefensePlayer,
        committedTurns,
        DefensePlayer.isProtected(),
      );

      const getUnitHp = (type: string, level: number) =>
        UnitTypes.find((u) => u.type === type && u.level === level)?.hp ?? 0;

      const calculateHpDamageFromLosses = (losses: {
        units?: Array<{ type: string; level: number; quantity: number }>;
      }) =>
        (losses?.units ?? []).reduce(
          (sum, loss) => sum + getUnitHp(loss.type, loss.level) * loss.quantity,
          0,
        );

      const attackerUnitDamageDealt = calculateHpDamageFromLosses(
        battleResults.Losses.Defender,
      );
      const defenderUnitDamageDealt = calculateHpDamageFromLosses(
        battleResults.Losses.Attacker,
      );

      // executeAttack mutates BattleUser unit quantities while recording Losses.
      // Do not subtract Losses again here, or persisted/logged units lose twice.

      // Consume stamina after successful attack initiation
      const moraleLossMultiplier =
        committedTurns === V5_COMBAT_CONSTANTS.MAX_ATTACK_TURNS
          ? V5_COMBAT_CONSTANTS.TURN_10_MORALE_PENALTY_BONUS
          : 1;
      AttackPlayer.stamina = Math.max(
        0,
        AttackPlayer.stamina - Math.ceil(committedTurns * moraleLossMultiplier),
      );

      const fortHpAtStart =
        Number(startOfAttack.Defender.fortHitpoints ?? 0) || 0;
      const fortHpAtEnd = Math.max(
        0,
        Number(battleResults.finalFortHP ?? fortHpAtStart) || 0,
      );
      const attackerFortDamageDealt = Math.max(0, fortHpAtStart - fortHpAtEnd);
      DefensePlayer.fortHitpoints = fortHpAtEnd;

      const isAttackerWinner = battleResults.result === 'WIN';

      logDebug('XP Distribution:', {
        isAttackerWinner,
        attackerXP: battleResults.experienceGained.attacker,
        defenderXP: battleResults.experienceGained.defender,
        attackerName: AttackPlayer.displayName,
        defenderName: DefensePlayer.displayName,
      });

      AttackPlayer.experience += battleResults.experienceGained.attacker;
      DefensePlayer.experience += battleResults.experienceGained.defender;
      const todayKey = new Date().toISOString().slice(0, 10);
      const pressureDateKey = DefensePlayer.defensePressureDate
        ? new Date(DefensePlayer.defensePressureDate).toISOString().slice(0, 10)
        : todayKey;
      const currentDefensePressure =
        pressureDateKey === todayKey
          ? (DefensePlayer.defensePressureToday ?? 0)
          : 0;

      try {
        const attack_log = await prisma.$transaction(async (tx) => {
          // Clamp and apply pillage inside the transaction to guarantee we never persist negative balances.
          if (isAttackerWinner) {
            const pillageRaw =
              typeof battleResults.pillagedGold === 'bigint'
                ? battleResults.pillagedGold
                : BigInt(String(battleResults.pillagedGold || '0'));
            const defenderGoldBig = BigInt(DefensePlayer.gold);
            const attackerGoldBig = BigInt(AttackPlayer.gold);
            const pillageToApply =
              pillageRaw > defenderGoldBig ? defenderGoldBig : pillageRaw;

            // Apply pillage to the in-memory player objects used for DB writes
            DefensePlayer.gold = defenderGoldBig - pillageToApply;
            AttackPlayer.gold = attackerGoldBig + pillageToApply;

            // Ensure battleResults reflects the actual applied amount (used in logs/history)
            battleResults.pillagedGold = pillageToApply;
          }

          // Create the attack log (uses the possibly-clamped pillagedGold)
          const attackerLossesTotal = Array.isArray(
            battleResults.Losses?.Attacker?.units,
          )
            ? battleResults.Losses.Attacker.units.reduce(
                (sum: number, loss: any) => sum + Number(loss?.quantity || 0),
                0,
              )
            : 0;
          const defenderLossesTotal = Array.isArray(
            battleResults.Losses?.Defender?.units,
          )
            ? battleResults.Losses.Defender.units.reduce(
                (sum: number, loss: any) => sum + Number(loss?.quantity || 0),
                0,
              )
            : 0;

          const attack_log = await createAttackLog(
            {
              timestamp: new Date().toISOString(),
              winner: isAttackerWinner ? attackerId : defenderId,
              pillaged_gold:
                isAttackerWinner && battleResults.pillagedGold
                  ? BigInt(String(battleResults.pillagedGold))
                  : BigInt(0),
              attacker_losses_total: attackerLossesTotal,
              defender_losses_total: defenderLossesTotal,
              stats: {
                startOfAttack,
                endTurns: AttackPlayer.attackTurns,
                attackerDamageDealt:
                  attackerUnitDamageDealt + attackerFortDamageDealt,
                attackerUnitDamageDealt,
                attackerFortDamageDealt,
                defenderDamageDealt: defenderUnitDamageDealt,
                defenderUnitDamageDealt,
                defensePointsAtEnd: DefensePlayer.defense,
                // Convert BigInt to string for JSON compatibility
                pillagedGold: isAttackerWinner
                  ? battleResults.pillagedGold.toString()
                  : '0',
                forthpAtStart: fortHpAtStart,
                forthpAtEnd: fortHpAtEnd,
                // Stringify potentially complex objects within stats
                xpEarned: JSON.stringify(battleResults.experienceGained),
                turns: committedTurns,
                attacker_units: JSON.stringify(AttackPlayer.units),
                defender_units: JSON.stringify(DefensePlayer.units),
                attacker_losses: JSON.stringify(battleResults.Losses.Attacker),
                defender_losses: JSON.stringify(battleResults.Losses.Defender),
                mitigation_log: JSON.stringify(
                  (battleResults as any).mitigationLog ?? [],
                ),
                mitigation_summary: JSON.stringify(
                  (battleResults as any).casualtySummary?.mitigation ?? null,
                ),
                battle_contributions: {
                  attacker: attackerContribution,
                  defender: defenderContribution,
                  mitigation:
                    (battleResults as any).casualtySummary?.mitigation ?? null,
                },
                win_probability_proxy: winProbabilityProxy,
                fort_breached: !!((battleResults as any).finalFortHP <= 0),
                defender_fort_level: DefensePlayer.fortLevel,
              },
              // Connect to users via relation fields
              attackerPlayer: { connect: { id: attackerId } },
              defenderPlayer: { connect: { id: defenderId } },
            },
            tx,
          );

          // If attacker won, record bank history for the actual applied pillage amount
          if (isAttackerWinner) {
            const goldAmount =
              typeof battleResults.pillagedGold === 'bigint'
                ? battleResults.pillagedGold
                : BigInt(String(battleResults.pillagedGold || '0'));

            await createBankHistory(
              {
                gold_amount: goldAmount,
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
            AttackPlayer.getUnitsForDbUpdate(),
            tx,
          );
          await updateUserUnits(
            defenderId,
            DefensePlayer.getUnitsForDbUpdate(),
            tx,
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

          // Persist updated user rows with clamped gold values
          await updateUser(
            attackerId,
            {
              gold: AttackPlayer.gold,
              attack_turns: AttackPlayer.attackTurns - committedTurns,
              stamina: AttackPlayer.stamina,
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
              gold: DefensePlayer.gold,
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

          return attack_log;
        });

        return {
          status: 'success',
          result: isAttackerWinner,
          attack_log: attack_log.id,
          extra_variables: stringifyObj({
            fortDmgTotal: fortHpAtStart - fortHpAtEnd,
            BattleResults: battleResults,
          }),
        };
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
