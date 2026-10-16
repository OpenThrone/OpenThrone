import { z } from 'zod';

import { BattleUpgrades } from '@/constants';
import prisma from '@/lib/prisma';
import { BattleUpgradeType, Prisma } from '@/lib/prisma-exports';
import { BattleUser } from '@/models/BattleUser';
import UserModel from '@/models/Users';
import { getUserById } from '@/services/AttackDataService';
import { getTargetAvailability } from '@/services/AttackValidationService';
import { ensureActiveEra } from '@/services/Era.service';
import { simulateBattle } from '@/utils/attackFunctions';
import { V5_COMBAT_CONSTANTS } from '@/utils/balance/v5Combat';
import {
  parseCombatReplay,
  restoreBattleUser,
  restoreSpyUser,
  serializeCombatResult,
} from '@/utils/combatReplay';
import { hasParticipatedInEra } from '@/utils/eraParticipation';
import { logDebug, logError } from '@/utils/logger';
import { stringifyObj } from '@/utils/numberFormatting';
import { createCombatRandom, replayCombatRandom } from '@/utils/serverRandom';
import {
  simulateAssassination,
  simulateInfiltration,
  simulateIntel,
} from '@/utils/spyFunctions';

import {
  ATTACK_LOG_ACL_SELECT,
  getAttackLogViewerRole,
  getCurrentAllianceIds,
  grantAttackLogAccessToRoom,
  readableAttackLogWhere,
  redactAttackLogForViewer,
  type RedactedAttackLog,
  redactRetestForViewer,
} from './AttackLogAccess.service';
import { AttackService } from './AttackService';

// Type definitions for battle operations
/** Describes the battle upgrade item data contract. */
export interface BattleUpgradeItem {
  type?: string;
  level?: number;
  quantity?: number;
}

/** Describes the battle upgrade data contract. */
export interface BattleUpgradeData {
  userId: number;
  items: BattleUpgradeItem[];
  operation?: 'buy' | 'sell';
}

/** Describes the attack execution data contract. */
export interface AttackExecutionData {
  attackerId: number;
  defenderId: number;
  attackTurns: number;
}

/** Describes the battle test data contract. */
export interface BattleTestData {
  attackerId?: number;
  defenderId: number;
  turns?: number;
}

/** Describes the attack log query data contract. */
export interface AttackLogQuery {
  page?: number;
  limit?: number;
  player?: string;
  minPillage?: number;
  maxPillage?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/** Describes the attack log acldata contract. */
export interface AttackLogACLData {
  userId: number;
  roomId: number;
  participantIds?: number[];
}

/** Describes the recent attack query data contract. */
export interface RecentAttackQuery {
  timeWindow?: number; // days, defaults to 7
}

// Zod schemas for validation
/** Upper bound for a single battle upgrade line (buy or sell). */
const MAX_BATTLE_UPGRADE_QUANTITY = 10000;

const BattleUpgradeItemSchema = z.object({
  type: z.string(),
  level: z.number().int(),
  quantity: z
    .number()
    .int()
    .min(1, { message: 'Quantity must be a positive integer.' })
    .max(MAX_BATTLE_UPGRADE_QUANTITY, {
      message: `Quantity must be at most ${MAX_BATTLE_UPGRADE_QUANTITY}.`,
    }),
});

const BattleUpgradesSchema = z.object({
  userId: z.number().int(),
  operation: z.enum(['buy', 'sell']).optional(),
  items: z
    .array(BattleUpgradeItemSchema)
    .min(1, { message: 'At least one item must be provided.' }),
});

const AttackExecutionSchema = z.object({
  attackerId: z.number().int(),
  defenderId: z.number().int(),
  attackTurns: z
    .number()
    .int()
    .positive()
    .max(V5_COMBAT_CONSTANTS.MAX_ATTACK_TURNS),
});

const BattleTestSchema = z.object({
  attackerId: z.number().int().optional(),
  defenderId: z.number().int(),
  turns: z
    .number()
    .int()
    .positive()
    .max(V5_COMBAT_CONSTANTS.MAX_ATTACK_TURNS)
    .optional(),
});

const AttackLogQuerySchema = z.object({
  page: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  player: z.string().optional(),
  minPillage: z.coerce.number().int().nonnegative().optional(),
  maxPillage: z.coerce.number().int().nonnegative().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

const AttackLogACLSchema = z.object({
  userId: z.number().int(),
  roomId: z.number().int(),
  participantIds: z.array(z.number().int()).optional(),
});

const RecentAttackQuerySchema = z.object({
  timeWindow: z.coerce.number().int().positive().max(30).optional(),
});

type TransactionClient = Prisma.TransactionClient;

/** Sums duplicate type/level request lines into one line per battle upgrade. */
const aggregateBattleUpgradeItems = (
  items: BattleUpgradeItem[],
): BattleUpgradeItem[] => {
  const byKey = new Map<string, BattleUpgradeItem>();
  for (const item of items) {
    const key = `${item.type}_${item.level}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.quantity = (existing.quantity ?? 0) + (item.quantity ?? 0);
    } else {
      byKey.set(key, { ...item });
    }
  }
  const aggregated = Array.from(byKey.values());
  for (const item of aggregated) {
    if ((item.quantity ?? 0) > MAX_BATTLE_UPGRADE_QUANTITY) {
      throw new Error('Invalid quantity');
    }
  }
  return aggregated;
};

/** Describes the battle upgrade result data contract. */
export interface BattleUpgradeResult {
  message: string;
  data: any;
  totalCost?: number;
}

/** Describes the attack execution result data contract. */
export interface AttackExecutionResult {
  status: 'success' | 'failed';
  message?: string;
  code?: string;
  result?: boolean;
  attack_log?: number;
  extra_variables?: any;
}

/** Describes the battle test result data contract. */
export interface BattleTestResult {
  attacker: string;
  defender: string;
  attackerResult?: string;
  attackerLosses?: number;
  defenderLosses?: number;
  pillagedGold?: string;
  xpEarned?: number;
  fortDmg?: number;
  mitigation?: unknown;
  fortBreached?: boolean;
  strength?: {
    attackerOffense?: number;
    defenderDefense?: number;
  };
}

/** Describes the attack logs result data contract. */
export interface AttackLogsResult {
  data: RedactedAttackLog[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  timestamp: string;
}

/** Describes the attack log aclresult data contract. */
export interface AttackLogACLResult {
  success: boolean;
  message: string;
  created: number;
  skipped: number;
  sharedWithNew: number[];
  sharedWithExisting: number[];
}

/** Describes the recent attack result data contract. */
export interface RecentAttackResult {
  id: number;
  timestamp: string;
  attacker_id: number;
  defender_id: number;
  attackerLosses?: number;
  defenderLosses?: number;
  fortHPAtEnd?: number;
}

interface BattleUpgradeEquipment {
  type: string;
  level: number;
  quantity: number | string;
}

/** Encapsulates battle data access and domain operations. */
export class BattleService {
  /**
   * Validates battle upgrade items against the locked user row and calculates the gold total.
   * Buy: enforces the unlock gates (structure level, covered units) and available gold.
   * Sell: requires the owned quantity (same type and level) to cover the requested quantity.
   */
  private static async validateBattleUpgrades(
    tx: TransactionClient,
    items: BattleUpgradeItem[],
    operation: 'buy' | 'sell',
    userId: number,
  ) {
    const user = await tx.users.findUnique({
      where: { id: userId },
      include: {
        UserBattleUpgrade: true,
        UserStructureUpgrade: true,
        UserUnit: true,
      },
    });
    if (!user) {
      throw new Error('User not found');
    }

    const uModel = new UserModel(user);
    const playerLevel = uModel.level;
    let totalCost = 0;

    const userBattleUpgrades = (user.UserBattleUpgrade || []).map((item) => ({
      type: item.type as string,
      level: item.level,
      quantity: Number(item.quantity),
    }));
    const userUnits = (user.UserUnit || []).map((unit) => ({
      type: String(unit.type),
      level: Number(unit.level),
      quantity: Number(unit.quantity),
    }));
    const structureUpgrades = user.UserStructureUpgrade || [];

    for (const itemData of items) {
      const item = BattleUpgrades.find(
        (w) => w.type === itemData.type && w.level === itemData.level,
      );
      if (!item) {
        throw new Error(`Invalid item type, usage, or level`);
      }
      if (
        !Number.isInteger(itemData.quantity) ||
        (itemData.quantity ?? 0) < 1 ||
        (itemData.quantity ?? 0) > MAX_BATTLE_UPGRADE_QUANTITY
      ) {
        throw new Error('Invalid quantity');
      }
      // Always round up for costs, down for refunds
      const itemBaseCost =
        item.cost - Math.ceil(((uModel.priceBonus || 0) / 100) * item.cost);
      const quantity = itemData.quantity as number;

      if (operation === 'buy') {
        // Unlock gates: mirrors ArmyInputForm.canUseBattleUpgrade and pages/battle/upgrades.tsx
        const requiredStructureType =
          item.type === 'DEFENSE' ? 'OFFENSE' : item.type;
        const structureLevel =
          structureUpgrades.find((s) => s.type === requiredStructureType)
            ?.level ?? 1;
        if (structureLevel < item.SiegeUpgradeLevel) {
          throw new Error(
            `Cannot purchase ${item.name}: requires ${requiredStructureType} structure level ${item.SiegeUpgradeLevel}.`,
          );
        }
        const hasCoveredUnits = userUnits.some(
          (unit) =>
            unit.type === item.type &&
            unit.level >= item.minUnitLevel &&
            unit.quantity > 0,
        );
        if (playerLevel < item.minUnitLevel || !hasCoveredUnits) {
          throw new Error(
            `Cannot purchase ${item.name}: requires level ${item.minUnitLevel}+ ${item.type} units.`,
          );
        }

        totalCost += Math.ceil(itemBaseCost * quantity);
      } else {
        // Selling: the owned quantity of this exact type and level must cover the request
        const owned =
          userBattleUpgrades.find(
            (row) => row.type === item.type && row.level === item.level,
          )?.quantity ?? 0;
        if (owned < quantity) {
          throw new Error(
            `Cannot sell ${quantity} ${item.name}: only ${owned} owned.`,
          );
        }
        totalCost -= Math.floor(itemBaseCost * quantity * 0.75); // 75% of the cost
      }
    }

    // Check if the user has enough gold
    if (
      operation === 'buy' &&
      BigInt(user.gold) < BigInt(Math.ceil(totalCost))
    ) {
      throw new Error('Not enough gold');
    }

    return { user, userBattleUpgrades, totalCost };
  }

  /**
   * Handles battle upgrade purchases and sales
   */
  static async manageBattleUpgrades(
    data: BattleUpgradeData,
  ): Promise<BattleUpgradeResult> {
    const validatedData = BattleUpgradesSchema.parse(data);
    const { userId, operation = 'buy' } = validatedData;

    // Merge duplicate type/level entries so each request line is validated against the full quantity
    const itemsToEquip = aggregateBattleUpgradeItems(validatedData.items);

    try {
      return await prisma.$transaction(async (tx) => {
        // Serialize gold and inventory writes for this user
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;

        const { user, userBattleUpgrades, totalCost } =
          await this.validateBattleUpgrades(
            tx,
            itemsToEquip,
            operation,
            userId,
          );

        const updatedItems = userBattleUpgrades.map((row) => ({ ...row }));
        const changedItems: BattleUpgradeEquipment[] = [];

        for (const itemData of itemsToEquip) {
          const existing = updatedItems.find(
            (row) => row.type === itemData.type && row.level === itemData.level,
          );
          if (operation === 'buy') {
            if (existing) {
              existing.quantity += itemData.quantity as number;
              changedItems.push(existing);
            } else {
              const added = {
                type: itemData.type as string,
                level: itemData.level as number,
                quantity: itemData.quantity as number,
              };
              updatedItems.push(added);
              changedItems.push(added);
            }
          } else if (existing) {
            // Sell: validated above that the owned quantity covers the request. Never add unowned items.
            existing.quantity -= itemData.quantity as number;
            changedItems.push(existing);
          }
        }

        await tx.users.update({
          where: { id: userId },
          data: {
            gold:
              operation === 'buy'
                ? BigInt(user.gold as bigint) - BigInt(Math.ceil(totalCost))
                : BigInt(user.gold as bigint) +
                  BigInt(Math.ceil(Math.abs(totalCost))),
          },
        });

        for (const item of changedItems) {
          await tx.userBattleUpgrade.upsert({
            // One row per type and level, so buying a new level never overwrites another
            where: {
              userId_type_level: {
                userId,
                type: item.type as BattleUpgradeType,
                level: item.level,
              },
            },
            create: {
              userId,
              type: item.type as BattleUpgradeType,
              level: item.level,
              quantity: item.quantity,
            },
            update: { quantity: item.quantity },
          });
        }

        // Create bank history for the transaction
        await tx.bank_history.create({
          data: {
            gold_amount: BigInt(Math.abs(totalCost)),
            from_user_id: userId,
            from_user_account_type: 'HAND',
            to_user_id: operation === 'buy' ? 0 : userId,
            to_user_account_type: operation === 'buy' ? 'BANK' : 'HAND',
            date_time: new Date().toISOString(),
            history_type: 'SALE',
            stats: {
              operation,
              type:
                operation === 'buy'
                  ? 'BATTLE_UPGRADES_BUY'
                  : 'BATTLE_UPGRADES_SELL',
              items: itemsToEquip.map((item) => ({
                type: item.type,
                level: item.level,
                quantity: item.quantity,
              })),
            },
          },
        });

        return {
          message: 'Items equipped successfully',
          data: updatedItems,
          totalCost: Math.abs(totalCost),
        };
      });
    } catch (error: any) {
      logError('Error managing battle upgrades', {
        userId,
        items: itemsToEquip,
        error,
      });
      throw error;
    }
  }

  /**
   * Executes a battle between two users
   */
  static async executeAttack(
    data: AttackExecutionData,
  ): Promise<AttackExecutionResult> {
    const validatedData = AttackExecutionSchema.parse(data);
    const { attackerId, defenderId, attackTurns } = validatedData;

    try {
      // Validate that users can't attack themselves
      if (attackerId === defenderId) {
        return {
          status: 'failed' as const,
          message: 'Cannot attack yourself',
          code: 'SELF_ATTACK',
        };
      }

      // Check if both users exist
      const [attackerUser, defenderUser] = await Promise.all([
        getUserById(attackerId),
        getUserById(defenderId),
      ]);

      if (!attackerUser) {
        return {
          status: 'failed' as const,
          message: 'Attacker user not found',
          code: 'ATTACKER_NOT_FOUND',
        };
      }

      if (!defenderUser) {
        return {
          status: 'failed' as const,
          message: 'Defender user not found',
          code: 'DEFENDER_NOT_FOUND',
        };
      }

      // Vacation, closed, banned, suspended, timed-out or resetting accounts
      // are off the battlefield even when addressed directly by id.
      const availability = await getTargetAvailability(defenderId);
      if (!availability.ok) {
        return {
          status: 'failed' as const,
          message: 'This player cannot be attacked right now.',
          code: 'DEFENDER_UNAVAILABLE',
        };
      }

      const activeEra = await prisma.era.findFirst({
        where: { endDate: null },
        orderBy: { startDate: 'desc' },
        select: { startDate: true },
      });
      if (
        !hasParticipatedInEra(defenderUser.last_active, activeEra?.startDate)
      ) {
        return {
          status: 'failed' as const,
          message: 'This player has not returned during the current era.',
          code: 'DEFENDER_NOT_ACTIVE_THIS_ERA',
        };
      }

      if (attackTurns > attackerUser.attack_turns) {
        return {
          status: 'failed' as const,
          message: 'Insufficient attack turns',
          code: 'INSUFFICIENT_ATTACK_TURNS',
        };
      }

      if (
        attackerUser.UserUnit.filter((unit) => unit.type === 'OFFENSE')
          .length === 0
      ) {
        return {
          status: 'failed' as const,
          message: 'No offensive units available',
          code: 'NO_OFFENSIVE_UNITS',
        };
      }

      // Use the existing AttackService for actual battle execution
      const result = await AttackService.executeAttack(
        attackerId,
        defenderId,
        attackTurns,
      );

      return result as AttackExecutionResult;
    } catch (error: any) {
      logError('Error executing attack', {
        attackerId,
        defenderId,
        attackTurns,
        error,
      });
      return {
        status: 'failed',
        message: 'Attack execution failed',
        code: 'ATTACK_EXECUTION_FAILED',
      } as AttackExecutionResult;
    }
  }

  /**
   * Simulates a battle between two users for testing purposes
   */
  static async simulateBattle(data: BattleTestData): Promise<BattleTestResult> {
    const validatedData = BattleTestSchema.parse(data);
    const { attackerId, defenderId, turns = 10 } = validatedData;

    try {
      logDebug(`Simulating battle between ${attackerId} and ${defenderId}`, {
        turns,
      });
      let attackerUser;
      if (attackerId) {
        attackerUser = await prisma.users.findUnique({
          where: { id: attackerId },
          include: {
            UserUnit: true,
            UserItem: true,
            UserStructureUpgrade: true,
            UserBattleUpgrade: true,
            UserBonusPoints: true,
          },
        });
      } else {
        // Default to a test user if no attacker specified
        attackerUser = await prisma.users.findFirst({
          where: { id: { not: 0 } },
          include: {
            UserUnit: true,
            UserItem: true,
            UserStructureUpgrade: true,
            UserBattleUpgrade: true,
            UserBonusPoints: true,
          },
        });
      }

      const defenderUser = await prisma.users.findUnique({
        where: { id: defenderId },
        include: {
          UserUnit: true,
          UserItem: true,
          UserStructureUpgrade: true,
          UserBattleUpgrade: true,
          UserBonusPoints: true,
        },
      });

      if (!attackerUser || !defenderUser) {
        throw new Error('Attacker or defender user not found');
      }

      const attacker = new BattleUser(attackerUser);
      const defender = new BattleUser(defenderUser);
      const results = await simulateBattle(
        attacker,
        defender,
        defender.fortHitpoints,
        turns,
        false,
        defender.isProtected(),
        { random: createCombatRandom('attack').random },
      );

      return {
        attacker: results.attacker.displayName,
        defender: results.defender.displayName,
        attackerResult: results.result,
        attackerLosses: results.Losses.Attacker.total,
        defenderLosses: results.Losses.Defender.total,
        pillagedGold: results.pillagedGold.toString(),
        xpEarned: results.experienceGained.attacker,
        fortDmg: defender.fortHitpoints - results.finalFortHP,
        mitigation: results.casualtySummary?.mitigation,
        fortBreached:
          results.casualtySummary?.fortBreached ?? results.finalFortHP <= 0,
        strength: {
          attackerOffense: attacker.offense,
          defenderDefense: defender.defense,
        },
      };
    } catch (error: any) {
      logError('Error simulating battle', {
        attackerId,
        defenderId,
        turns,
        error,
      });
      throw error;
    }
  }

  /**
   * Retests a previous battle by replaying it
   */
  static async retestBattle(attackLogId: number): Promise<any> {
    try {
      const attack = await prisma.attack_log.findUnique({
        where: { id: attackLogId },
      });

      if (!attack) {
        throw new Error('Attack not found');
      }

      const replayData: unknown = attack.stats?.replay;
      if (!replayData) {
        return {
          replayMode: 'UNAVAILABLE',
          exactReplay: false,
          message:
            'Legacy log has no versioned inputs and encrypted RNG seed. Any new simulation would be counterfactual, not an exact replay.',
          originalGold: attack.pillaged_gold.toString(),
        };
      }
      const replay = parseCombatReplay(replayData);

      // Version/algorithm validation and seed authentication happen before execution.
      const random = replayCombatRandom(replay);
      if (replay.domain === 'spy') {
        const attacker = restoreSpyUser(replay.attacker);
        const defender = restoreSpyUser(replay.defender);
        const options = {
          random,
          turns: replay.turns,
          spyPressureToday: replay.spyPressureToday,
          defenderDailyCasualtyRemaining: replay.defenderDailyCasualtyRemaining,
          targetTypeDailyRemaining: replay.targetTypeDailyRemaining,
        };
        const results =
          replay.mission === 'INTEL'
            ? simulateIntel(attacker, defender, replay.spies, options)
            : replay.mission === 'INFILTRATE'
              ? simulateInfiltration(attacker, defender, replay.spies, options)
              : simulateAssassination(
                  attacker,
                  defender,
                  replay.spies,
                  replay.target!,
                  options,
                );
        return serializeCombatResult({
          replayMode: 'EXACT',
          exactReplay: true,
          formulaVersion: replay.formulaVersion,
          originalResult: attack.stats.spyResults,
          result: results,
        });
      }
      const attacker = restoreBattleUser(replay.attacker);
      const defender = restoreBattleUser(replay.defender);
      const attackerOffense = attacker.offense;
      const defenderDefense = defender.defense;
      const results = await simulateBattle(
        attacker,
        defender,
        replay.defender.fortHitpoints,
        replay.turns,
        false,
        replay.defenderProtected,
        {
          random,
          defenderDailyCasualtyRemaining: replay.defenderDailyCasualtyRemaining,
          defenderDailyGoldRemaining: BigInt(replay.defenderDailyGoldRemaining),
        },
      );
      const attackerRoster = [
        ...attacker.getUnitsForDbUpdate(),
        ...attacker.getMercenariesForDbUpdate(),
      ];
      const defenderRoster = [
        ...defender.getUnitsForDbUpdate(),
        ...defender.getMercenariesForDbUpdate(),
      ];
      return serializeCombatResult({
        replayMode: 'EXACT',
        exactReplay: true,
        formulaVersion: replay.formulaVersion,
        originalAttackerArmy: [
          ...replay.attacker.units,
          ...replay.attacker.mercenaries,
        ]
          .filter((unit) => unit.type === 'OFFENSE')
          .reduce((total, unit) => total + unit.quantity, 0),
        originalDefenderArmy: [
          ...replay.defender.units,
          ...replay.defender.mercenaries,
        ]
          .filter((unit) =>
            ['DEFENSE', 'WORKER', 'CITIZEN'].includes(unit.type),
          )
          .reduce((total, unit) => total + unit.quantity, 0),
        originalAttackerLosses: attack.attacker_losses_total,
        originalDefenderLosses: attack.defender_losses_total,
        newSimulationAttackerArmy: attackerRoster
          .filter((unit) => unit.type === 'OFFENSE')
          .reduce((total, unit) => total + unit.quantity, 0),
        newSimulationDefenderArmy: defenderRoster
          .filter((unit) =>
            ['DEFENSE', 'WORKER', 'CITIZEN'].includes(unit.type),
          )
          .reduce((total, unit) => total + unit.quantity, 0),
        newSimulationAttackerLossesTotal: results.Losses.Attacker.total,
        newSimulationAttackerLossesBreakdown: results.Losses.Attacker,
        newSimulationDefenderLossesTotal: results.Losses.Defender.total,
        newSimulationDefenderLossesBreakdown: results.Losses.Defender,
        fortHPAtEnd: results.finalFortHP,
        attackerWon: results.result === 'WIN',
        strength: { attackerOffense, defenderDefense },
        originalGold: attack.pillaged_gold,
        newGold: results.pillagedGold,
        canonicalOutcome: results.canonicalOutcome,
        wounded: results.wounded,
        result: results,
      });
    } catch (error: any) {
      logError('Error retesting battle', { attackLogId, error });
      throw error;
    }
  }

  /**
   * Gets attack logs for a user with filtering and pagination
   */
  static async getAttackLogs(
    userId: number,
    query: AttackLogQuery,
  ): Promise<AttackLogsResult> {
    const validatedQuery = AttackLogQuerySchema.parse(query);
    const {
      page = 0,
      limit = 10,
      player,
      minPillage,
      maxPillage,
      sortBy,
      sortOrder,
    } = validatedQuery;

    const skip = page * limit;
    const era = await ensureActiveEra();
    const attackLogFilters: Prisma.attack_logWhereInput[] = [
      {
        OR: [{ attacker_id: userId }, { defender_id: userId }],
      },
      { timestamp: { gte: era.startDate } },
    ];

    if (player) {
      attackLogFilters.push({
        OR: [
          {
            attackerPlayer: {
              is: {
                display_name: {
                  contains: player,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
            },
          },
          {
            defenderPlayer: {
              is: {
                display_name: {
                  contains: player,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
            },
          },
        ],
      });
    }

    if (typeof minPillage === 'number') {
      attackLogFilters.push({ pillaged_gold: { gte: BigInt(minPillage) } });
    }

    if (typeof maxPillage === 'number') {
      attackLogFilters.push({ pillaged_gold: { lte: BigInt(maxPillage) } });
    }

    const whereClause: Prisma.attack_logWhereInput = {
      AND: attackLogFilters,
    };

    const orderByClause =
      sortBy && sortOrder ? { [sortBy]: sortOrder } : { timestamp: 'desc' };

    const results = await prisma.attack_log.findMany({
      where: whereClause,
      orderBy: orderByClause,
      skip,
      take: limit,
      include: {
        attackerPlayer: {
          select: { id: true, display_name: true, avatar: true },
        },
        defenderPlayer: {
          select: { id: true, display_name: true, avatar: true },
        },
      },
    });

    const totalCount = await prisma.attack_log.count({ where: whereClause });

    // Rows are the viewer's own battles; each is redacted for the viewer's side.
    return {
      data: results.map((log) =>
        redactAttackLogForViewer(
          log,
          log.attacker_id === userId ? 'attacker' : 'defender',
        ),
      ),
      page,
      limit,
      total: totalCount,
      totalPages: Math.ceil(totalCount / limit),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Retests an attack log for a viewer who may read it (attacker, defender or a
   * share recipient). The output is redacted for the viewer's role.
   */
  static async retestBattleForViewer(
    attackLogId: number,
    viewerId: number,
  ): Promise<Record<string, unknown>> {
    const attack = await prisma.attack_log.findUnique({
      where: { id: attackLogId },
      select: {
        id: true,
        attacker_id: true,
        defender_id: true,
        acl: { select: ATTACK_LOG_ACL_SELECT },
      },
    });
    const role = await getAttackLogViewerRole(viewerId, attack);
    if (!role) {
      // Missing and unreadable logs are indistinguishable to the caller.
      throw new Error('Forbidden: you cannot read this attack log');
    }

    const result = await BattleService.retestBattle(attackLogId);
    return redactRetestForViewer(result, role);
  }

  /**
   * Shares an attack log with the other current members of a chat room. Anyone
   * who can read the log may share it, but only to a room they currently belong to.
   */
  static async manageAttackLogACL(
    attackLogId: number,
    data: AttackLogACLData,
  ): Promise<AttackLogACLResult> {
    const validatedData = AttackLogACLSchema.parse(data);
    const { userId, roomId } = validatedData;

    try {
      const attackLog = await prisma.attack_log.findUnique({
        where: { id: attackLogId },
        select: {
          id: true,
          attacker_id: true,
          defender_id: true,
          acl: { select: ATTACK_LOG_ACL_SELECT },
        },
      });

      // Unknown logs get the same answer as unreadable ones.
      const role = await getAttackLogViewerRole(userId, attackLog);
      if (!role) {
        throw new Error('You do not have permission to share this attack log');
      }

      const { newUserIds, existingUserIds } = await grantAttackLogAccessToRoom(
        attackLogId,
        userId,
        roomId,
      );

      return {
        success: true,
        message: `Attack log shared successfully: ${newUserIds.length} new participants, ${existingUserIds.length} already had access`,
        created: newUserIds.length,
        skipped: existingUserIds.length,
        sharedWithNew: newUserIds,
        sharedWithExisting: existingUserIds,
      };
    } catch (error: any) {
      logError('Error managing attack log ACL', {
        attackLogId,
        userId,
        roomId,
        error,
      });
      throw error;
    }
  }

  /**
   * Gets recent attacks with anomaly detection
   */
  static async getRecentAttacks(
    viewerId: number,
    query: RecentAttackQuery = {},
  ): Promise<RecentAttackResult[]> {
    const validatedQuery = RecentAttackQuerySchema.parse(query);
    const { timeWindow = 7 } = validatedQuery;

    try {
      // Only logs the viewer may read; same rule as the battle report.
      const allianceIds = await getCurrentAllianceIds(viewerId);
      const relations = await prisma.attack_log.findMany({
        where: {
          AND: [
            {
              type: 'attack',
              timestamp: {
                gt: new Date(Date.now() - timeWindow * 24 * 60 * 60 * 1000),
              },
            },
            readableAttackLogWhere(viewerId, allianceIds),
          ],
        },
      });

      // Logs store rosters and losses as JSON strings.
      const parse = (value: unknown): any => {
        if (typeof value !== 'string') return value;
        try {
          return JSON.parse(value);
        } catch {
          return undefined;
        }
      };
      const lossTotal = (value: unknown): number =>
        Number(parse(value)?.total ?? 0);
      const population = (value: unknown, types: string[]): number => {
        const units = parse(value);
        return Array.isArray(units)
          ? units
              .filter((unit: any) => types.includes(unit?.type))
              .reduce(
                (total: number, unit: any) => total + Number(unit.quantity),
                0,
              )
          : 0;
      };

      const badAttacks = relations.filter((attack) => {
        if (!attack.stats.attacker_units || !attack.stats.defender_units) {
          return false;
        }
        const attackerPop = population(attack.stats.attacker_units, [
          'OFFENSE',
        ]);
        const defenderPop = population(attack.stats.defender_units, [
          'DEFENSE',
          'WORKER',
          'CITIZEN',
        ]);

        const attackerLosses = lossTotal(attack.stats.attacker_losses);
        const defenderLosses = lossTotal(attack.stats.defender_losses);

        const attackerLossPercent =
          attackerPop > 0 ? attackerLosses / attackerPop : 0;
        const defenderLossPercent =
          defenderPop > 0 ? defenderLosses / defenderPop : 0;

        return (
          (attackerLossPercent > 0.2 && defenderLossPercent < 0.7) ||
          attackerLosses > defenderLosses ||
          defenderLossPercent > 0.5
        );
      });

      return badAttacks.map((attack) => ({
        id: attack.id,
        timestamp: attack.timestamp,
        attacker_id: attack.attacker_id,
        defender_id: attack.defender_id,
        attackerLosses: lossTotal(attack.stats.attacker_losses),
        defenderLosses: lossTotal(attack.stats.defender_losses),
        // Absolute fort hitpoints are the defender's own information.
        ...(attack.defender_id === viewerId
          ? { fortHPAtEnd: attack.stats.forthpAtEnd }
          : {}),
      }));
    } catch (error: any) {
      logError('Error getting recent attacks', { timeWindow, error });
      throw error;
    }
  }

  /**
   * Performs full-scale battle testing (admin only)
   */
  static async fullScaleBattleTest(attackerId?: number): Promise<any> {
    try {
      let myUser;
      if (attackerId) {
        myUser = await prisma.users.findUnique({
          where: { id: attackerId },
        });
      }

      const allBattleResults = [];

      if (myUser) {
        const allUsers = await prisma.users.findMany({
          where: {
            id: { not: 0 },
          },
          include: {
            statusHistories: {
              orderBy: { created_at: 'desc' },
              take: 1, // Take only the most recent status
            },
          },
          take: 10,
          orderBy: { experience: 'desc' },
        });

        for (const user of allUsers) {
          if (user.id === myUser.id) {
            continue;
          }

          const attacker = new UserModel(
            JSON.parse(JSON.stringify(stringifyObj(myUser))),
          );
          const defender = new UserModel(
            JSON.parse(JSON.stringify(stringifyObj(user))),
          );

          const results = await simulateBattle(
            attacker,
            defender,
            defender.fortHealth.current,
            10,
            false,
            defender.level <= 9,
            { random: createCombatRandom('attack').random },
          );
          allBattleResults.push({
            Attacker: `${results.attacker.displayName} - ID:${results.attacker.id}`,
            AttackerArmy: attacker.unitTotals.offense,
            Defender: `${results.defender.displayName} - ID:${results.defender.id}`,
            DefenderArmy:
              defender.unitTotals.defense +
              defender.unitTotals.citizens +
              defender.unitTotals.workers,
            Offense: attacker.offense,
            'Defense:': defender.defense,
            AttackerResult: results.result,
            AttackerLosses: results.Losses.Attacker.total,
            DefenderLosses: results.Losses.Defender.total,
            PillagedGold: results.pillagedGold.toString(),
            'XPEarned-Attacker': results.experienceGained.attacker,
            'XPEarned-Defender': results.experienceGained.defender,
            FortDmg: defender.fortHitpoints - results.fortHitpoints,
          });
        }
      } else {
        const allUsers = await prisma.users.findMany({
          where: { id: { notIn: [0] } },
          orderBy: { experience: 'desc' },
        });

        for (let i = 0; i < allUsers.length; i++) {
          const attacker = new UserModel(
            JSON.parse(JSON.stringify(stringifyObj(allUsers[i]))),
          );
          if (attacker.offense === 0) {
            continue;
          }
          const allDefenderUsers = await prisma.users.findMany({
            where: { id: { notIn: [0, attacker.id] } },
            include: {
              statusHistories: {
                orderBy: { created_at: 'desc' },
                take: 1, // Take only the most recent status
              },
            },
            take: 10,
            orderBy: { experience: 'asc' },
          });
          for (let j = 0; j < allDefenderUsers.length; j++) {
            const defender = new UserModel(
              JSON.parse(JSON.stringify(stringifyObj(allDefenderUsers[j]))),
            );
            const results = await simulateBattle(
              attacker,
              defender,
              defender.fortHealth.current,
              10,
              false,
              defender.level <= 9,
              { random: createCombatRandom('attack').random },
            );
            allBattleResults.push({
              Attacker: `${results.attacker.displayName} - ID:${results.attacker.id}`,
              AttackerArmy: attacker.unitTotals.offense,
              Defender: `${results.defender.displayName} - ID:${results.defender.id}`,
              DefenderArmy:
                defender.unitTotals.defense +
                defender.unitTotals.citizens +
                defender.unitTotals.workers,
              Offense: attacker.offense,
              'Defense:': defender.defense,
              AttackerResult: results.result,
              AttackerLosses: results.Losses.Attacker.total,
              DefenderLosses: results.Losses.Defender.total,
              PillagedGold: results.pillagedGold.toString(),
              'XPEarned-Attacker': results.experienceGained.attacker,
              'XPEarned-Defender': results.experienceGained.defender,
              FortDmg: results.casualtySummary.fortDamage,
              MitigationAvg:
                results.casualtySummary?.mitigation?.averageMultiplier ?? null,
              FortBreached:
                results.casualtySummary?.fortBreached ??
                results.finalFortHP <= 0,
            });
          }
        }
      }

      return allBattleResults;
    } catch (error: any) {
      logError('Error performing full scale battle test', {
        attackerId,
        error,
      });
      throw error;
    }
  }

  /**
   * Gets comprehensive battle statistics for a user
   */
  static async getBattleStats(userId: number) {
    try {
      const [
        totalAttacks,
        successfulAttacks,
        totalDefenses,
        successfulDefenses,
        totalPillageResult,
      ] = await Promise.all([
        prisma.attack_log.count({ where: { attacker_id: userId } }),
        prisma.attack_log.count({
          where: {
            attacker_id: userId,
            winner: userId,
          },
        }),
        prisma.attack_log.count({ where: { defender_id: userId } }),
        prisma.attack_log.count({
          where: {
            defender_id: userId,
            winner: userId,
          },
        }),
        prisma.attack_log.aggregate({
          _sum: {
            stats: true,
          },
          where: {
            attacker_id: userId,
            winner: userId,
          },
        }),
      ]);

      const attackWinRate =
        totalAttacks > 0 ? (successfulAttacks / totalAttacks) * 100 : 0;
      const defenseWinRate =
        totalDefenses > 0 ? (successfulDefenses / totalDefenses) * 100 : 0;

      return {
        attacks: {
          total: totalAttacks,
          successful: successfulAttacks,
          winRate: Math.round(attackWinRate * 100) / 100,
        },
        defenses: {
          total: totalDefenses,
          successful: successfulDefenses,
          winRate: Math.round(defenseWinRate * 100) / 100,
        },
        totalPillage: totalPillageResult._sum.stats || 0,
      };
    } catch (error: any) {
      logError('Error getting battle stats', { userId, error });
      throw error;
    }
  }

  /**
   * Simulates a battle with custom user data for testing purposes
   */
  static async simulateBattleWithData(
    attackerData: string,
    defenderData: string,
    turns: number = 10,
  ): Promise<BattleTestResult> {
    try {
      // Create mock users from the provided data
      const attackerUser = new UserModel(JSON.parse(attackerData));
      const defenderUser = new UserModel(JSON.parse(defenderData));

      const results = await simulateBattle(
        attackerUser,
        defenderUser,
        defenderUser.fortHitpoints,
        turns,
        true, // enable Debug messages
        defenderUser.level <= 9,
        { random: createCombatRandom('attack').random },
      );

      return {
        attacker: results.attacker.displayName,
        defender: results.defender.displayName,
        attackerResult: results.result,
        attackerLosses: results.Losses.Attacker.total,
        defenderLosses: results.Losses.Defender.total,
        pillagedGold: results.pillagedGold.toString(),
        xpEarned: results.experienceGained.attacker,
        fortDmg: defenderUser.fortHitpoints - results.finalFortHP,
        mitigation: results.casualtySummary?.mitigation,
        fortBreached:
          results.casualtySummary?.fortBreached ?? results.finalFortHP <= 0,
        strength: {
          attackerOffense: attackerUser.offense,
          defenderDefense: defenderUser.defense,
        },
      };
    } catch (error: any) {
      logError('Error simulating battle with data', { error });
      throw error;
    }
  }
}
