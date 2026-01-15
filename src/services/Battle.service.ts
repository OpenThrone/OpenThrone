import { z } from 'zod';

import { BattleUpgrades } from '@/constants';
import prisma from '@/lib/prisma';
import { BattleUser } from '@/models/BattleUser';
import UserModel from '@/models/Users';
import { getUserById } from '@/services/AttackDataService';
import { simulateBattle } from '@/utils/attackFunctions';
import { logDebug, logError } from '@/utils/logger';
import { stringifyObj } from '@/utils/numberFormatting';

import { AttackService } from './AttackService';

// Type definitions for battle operations
export interface BattleUpgradeItem {
  type?: string;
  level?: number;
  quantity?: number;
}

export interface BattleUpgradeData {
  userId: number;
  items: BattleUpgradeItem[];
  operation?: 'buy' | 'sell';
}

export interface AttackExecutionData {
  attackerId: number;
  defenderId: number;
  attackTurns: number;
}

export interface BattleTestData {
  attackerId?: number;
  defenderId: number;
  turns?: number;
}

export interface AttackLogQuery {
  page?: number;
  limit?: number;
  player?: string;
  minPillage?: number;
  maxPillage?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface AttackLogACLData {
  userId: number;
  roomId: number;
  participantIds?: number[];
}

export interface RecentAttackQuery {
  timeWindow?: number; // days, defaults to 7
}

// Zod schemas for validation
const BattleUpgradeItemSchema = z.object({
  type: z.string(),
  level: z.number().int(),
  quantity: z
    .number()
    .int()
    .nonnegative({ message: 'Quantity must be non-negative integer.' }),
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
  attackTurns: z.number().int().positive().max(15),
});

const BattleTestSchema = z.object({
  attackerId: z.number().int().optional(),
  defenderId: z.number().int(),
  turns: z.number().int().positive().max(15).optional(),
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

export interface BattleUpgradeResult {
  message: string;
  data: any;
  totalCost?: number;
}

export interface AttackExecutionResult {
  status: 'success' | 'failed';
  message?: string;
  code?: string;
  result?: boolean;
  attack_log?: number;
  extra_variables?: any;
}

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

export interface AttackLogEntry {
  id: number;
  timestamp: string;
  attacker_id: number;
  defender_id: number;
  winner?: number;
  stats: any;
  attackerPlayer?: {
    id: number;
    display_name: string;
    avatar?: string;
  };
  defenderPlayer?: {
    id: number;
    display_name: string;
    avatar?: string;
  };
}

export interface AttackLogsResult {
  data: AttackLogEntry[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  timestamp: string;
}

export interface AttackLogACLResult {
  success: boolean;
  message: string;
  created: number;
  skipped: number;
  sharedWithNew: number[];
  sharedWithExisting: number[];
}

export interface RecentAttackResult {
  id: number;
  timestamp: string;
  attacker_id: number;
  defender_id: number;
  attackerLosses?: number;
  defenderLosses?: number;
  fortHPAtEnd?: number;
}

export interface BattleUpgradeEquipment {
  type: string;
  level: number;
  quantity: number | string;
}

export class BattleService {
  /**
   * Validates battle upgrade items and calculates total cost
   */
  private static async validateBattleUpgrades(
    items: BattleUpgradeItem[],
    operation: 'buy' | 'sell',
    userId: number,
  ) {
    const user = await prisma.users.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    const uModel = new UserModel(user);
    let totalCost = 0;

    // Cast battle_upgrades to BattleUpgradeEquipment[] and ensure quantities are numbers
    const userBattleUpgrades = (
      user.battle_upgrades as unknown as BattleUpgradeEquipment[]
    ).map((item) => ({
      ...item,
      quantity:
        typeof item.quantity === 'string'
          ? parseInt(item.quantity, 10)
          : item.quantity,
    }));

    // Validate the items and calculate total cost
    for (const itemData of items) {
      const item = BattleUpgrades.find(
        (w) => w.type === itemData.type && w.level === itemData.level,
      );
      if (itemData.quantity < 0) {
        throw new Error('Invalid quantity');
      }
      if (!item) {
        throw new Error(`Invalid item type, usage, or level`);
      }
      // Always round up for costs, down for refunds
      const itemBaseCost =
        item.cost - Math.ceil(((uModel.priceBonus || 0) / 100) * item.cost);
      if (operation === 'buy') {
        totalCost += Math.ceil(itemBaseCost * itemData.quantity);
      } else {
        // selling items
        totalCost -= Math.floor(itemBaseCost * itemData.quantity * 0.75); // 75% of the cost
      }
    }

    // Check if the user has enough gold
    if (operation === 'buy' && user.gold < totalCost) {
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
    const { userId, items: itemsToEquip, operation = 'buy' } = validatedData;

    try {
      const { user, userBattleUpgrades, totalCost } =
        await this.validateBattleUpgrades(
          itemsToEquip as any,
          operation,
          userId,
        );

      // Deduct gold and equip items
      const updatedItems = userBattleUpgrades.map(
        (userItem: BattleUpgradeEquipment) => {
          const itemToEquip = itemsToEquip.find(
            (item) =>
              item.type === userItem.type && item.level === userItem.level,
          );
          if (itemToEquip) {
            const userQty =
              typeof userItem.quantity === 'string'
                ? parseInt(userItem.quantity, 10)
                : userItem.quantity;
            const equipQty =
              typeof itemToEquip.quantity === 'string'
                ? parseInt(itemToEquip.quantity as string, 10)
                : itemToEquip.quantity;
            const newQuantity =
              operation === 'buy'
                ? userQty + equipQty // increase item quantity when buying
                : userQty - equipQty; // decrease item quantity when selling

            if (newQuantity < 0) {
              throw new Error('Cannot have negative quantity');
            }

            return { ...userItem, quantity: newQuantity };
          }
          return userItem;
        },
      );

      // Add new items to the inventory if they don't exist
      itemsToEquip.forEach((itemData) => {
        if (
          !updatedItems.some(
            (i: BattleUpgradeEquipment) =>
              i.type === itemData.type && i.level === itemData.level,
          )
        ) {
          updatedItems.push({
            type: itemData.type,
            level: itemData.level,
            quantity: itemData.quantity,
          });
        }
      });

      await prisma.$transaction(async (tx) => {
        await tx.users.update({
          where: { id: userId },
          data: {
            gold:
              operation === 'buy'
                ? user.gold - totalCost
                : user.gold + Math.abs(totalCost),
            battle_upgrades: updatedItems,
          },
        });

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
      });

      return {
        message: 'Items equipped successfully',
        data: updatedItems,
        totalCost: Math.abs(totalCost),
      };
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

      const attacker = new UserModel(
        JSON.parse(
          JSON.stringify(stringifyObj(attack.stats.startOfAttack.Attacker)),
        ),
        true,
        false,
      );
      const defender = new UserModel(
        JSON.parse(
          JSON.stringify(stringifyObj(attack.stats.startOfAttack.Defender)),
        ),
        true,
        true,
      );

      const attacker2 = new UserModel(
        JSON.parse(
          JSON.stringify(stringifyObj(attack.stats.startOfAttack.Attacker)),
        ),
        true,
        false,
      );
      const defender2 = new UserModel(
        JSON.parse(
          JSON.stringify(stringifyObj(attack.stats.startOfAttack.Defender)),
        ),
        true,
        false,
      );

      const results2 = await simulateBattle(
        attacker2,
        defender2,
        defender2.fortHitpoints,
        attack.stats.turns,
        true,
      );

      return stringifyObj({
        originalAttackerArmy: attack.stats.startOfAttack.Attacker.units
          .filter((units) => units.type === 'OFFENSE')
          .reduce((total, unit) => total + unit.quantity, 0),
        originalDefenderArmy: attack.stats.startOfAttack.Defender.units
          .filter(
            (units) =>
              units.type === 'DEFENSE' ||
              units.type === 'WORKER' ||
              units.type === 'CITIZEN',
          )
          .reduce((total, unit) => total + unit.quantity, 0),
        originalAttackerLosses: attack.stats.attacker_losses.total,
        originalDefenderLosses: attack.stats.defender_losses.total,
        newSimulationAttackerArmy: results2.attacker.units
          .filter((units) => units.type === 'OFFENSE')
          .reduce((total, unit) => total + unit.quantity, 0),
        newSimulationDefenderArmy: results2.defender.units
          .filter(
            (units) =>
              units.type === 'DEFENSE' ||
              units.type === 'WORKER' ||
              units.type === 'CITIZEN',
          )
          .reduce((total, unit) => total + unit.quantity, 0),
        newSimulationAttackerLossesTotal: results2.Losses.Attacker.total,
        newSimulationAttackerLossesBreakdown: results2.Losses.Attacker,
        newSimulationDefenderLossesTotal: results2.Losses.Defender.total,
        newSimulationDefenderLossesBreakdown: results2.Losses.Defender,
        fortHPAtEnd: results2.fortHitpoints,
        attackerWon: results2.result === 'WIN',
        strength: {
          attackerOffense: attacker.offense,
          defenderDefense: defender.defense,
        },
        originalGold: attack.stats.pillagedGold,
        newGold: results2.pillagedGold,
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

    const whereClause = {
      OR: [{ attacker_id: userId }, { defender_id: userId }],
      ...(player
        ? {
            OR: [
              {
                attackerPlayer: {
                  display_name: { contains: player, mode: 'insensitive' },
                },
              },
              {
                defenderPlayer: {
                  display_name: { contains: player, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
      ...(minPillage
        ? { stats: { path: ['pillagedGold'], gt: minPillage } }
        : {}),
      ...(maxPillage
        ? { stats: { path: ['pillagedGold'], lt: maxPillage } }
        : {}),
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

    return {
      data: results,
      page,
      limit,
      total: totalCount,
      totalPages: Math.ceil(totalCount / limit),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Manages access control for attack logs (ACL)
   */
  static async manageAttackLogACL(
    attackLogId: number,
    data: AttackLogACLData,
  ): Promise<AttackLogACLResult> {
    const validatedData = AttackLogACLSchema.parse(data);
    const { userId, roomId, participantIds } = validatedData;

    try {
      // Verify the attack log exists and the current user has access to it
      const attackLog = await prisma.attack_log.findUnique({
        where: { id: attackLogId },
      });

      if (!attackLog) {
        throw new Error('Attack log not found');
      }

      // Check if the user has permission to share this log
      // User must be either attacker or defender
      const userHasAccess =
        attackLog.attacker_id === userId || attackLog.defender_id === userId;

      // If not attacker or defender, check if they already have ACL access
      if (!userHasAccess) {
        const existingAcl = await prisma.attack_log_acl.findFirst({
          where: {
            attack_log_id: attackLogId,
            shared_with_user_id: userId,
          },
        });

        if (!existingAcl) {
          throw new Error(
            'You do not have permission to share this attack log',
          );
        }
      }

      // Verify room exists and user is a participant
      const chatRoom = await prisma.chatRoom.findUnique({
        where: { id: roomId },
        include: {
          participants: true,
        },
      });

      if (!chatRoom) {
        throw new Error('Chat room not found');
      }

      // Check if the user is a participant in this room
      const isParticipant = chatRoom.participants.some(
        (participant) => participant.userId === userId,
      );

      if (!isParticipant) {
        throw new Error('You are not a participant in this chat room');
      }

      // Get the IDs of all participants in the room (excluding the current user)
      const roomParticipantIds = chatRoom.participants
        .filter((participant) => participant.userId !== userId)
        .map((participant) => participant.userId);

      // Get existing ACL entries for this log
      const existingAcls = await prisma.attack_log_acl.findMany({
        where: {
          attack_log_id: attackLogId,
          shared_with_user_id: {
            in: roomParticipantIds,
          },
        },
        select: {
          shared_with_user_id: true,
        },
      });

      // Create a Set of user IDs that already have access for quick lookup
      const existingAccessUserIds = new Set(
        existingAcls.map((acl) => acl.shared_with_user_id),
      );

      // Create ACL entries for participants who don't already have access
      const aclEntries = [];
      for (const participantId of roomParticipantIds) {
        // Skip if this participant already has access
        if (!existingAccessUserIds.has(participantId)) {
          aclEntries.push({
            attack_log_id: attackLogId,
            shared_with_user_id: participantId,
          });
        }
      }

      // Create new ACL entries individually to better handle errors
      const createdAcls = [];
      const skippedAcls = [];

      if (aclEntries.length > 0) {
        for (const entry of aclEntries) {
          try {
            const acl = await prisma.attack_log_acl.create({
              data: entry,
            });
            createdAcls.push(acl);
          } catch (e) {
            // Handle potential unique constraint violations
            if (
              e instanceof prisma.PrismaClientKnownRequestError &&
              e.code === 'P2002'
            ) {
              console.log(
                `Skipping duplicate ACL entry for user ${entry.shared_with_user_id}`,
              );
              skippedAcls.push(entry.shared_with_user_id);
            } else {
              throw e; // Rethrow other errors
            }
          }
        }
      }

      return {
        success: true,
        message: `Attack log shared successfully: ${createdAcls.length} new participants, ${skippedAcls.length} already had access`,
        created: createdAcls.length,
        skipped: skippedAcls.length,
        sharedWithNew: createdAcls.map((entry) => entry.shared_with_user_id),
        sharedWithExisting: skippedAcls,
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
    query: RecentAttackQuery = {},
  ): Promise<RecentAttackResult[]> {
    const validatedQuery = RecentAttackQuerySchema.parse(query);
    const { timeWindow = 7 } = validatedQuery;

    try {
      const relations = await prisma.attack_log.findMany({
        where: {
          timestamp: {
            gt: new Date(Date.now() - timeWindow * 24 * 60 * 60 * 1000),
          },
        },
      });

      const badAttacks = relations.filter((attack) => {
        if (!attack.stats.attacker_units || !attack.stats.defender_units) {
          return false;
        }
        const attackerPop = attack.stats.attacker_units
          .filter((unit: any) => unit.type === 'OFFENSE')
          .reduce((total: number, unit: any) => total + unit.quantity, 0);
        const defenderPop = attack.stats.defender_units
          .filter(
            (unit: any) =>
              unit.type === 'DEFENSE' ||
              unit.type === 'WORKER' ||
              unit.type === 'CITIZEN',
          )
          .reduce((total: number, unit: any) => total + unit.quantity, 0);

        const attackerLosses = Number(attack.stats.attacker_losses?.total || 0);
        const defenderLosses = Number(attack.stats.defender_losses?.total || 0);

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
        attackerLosses: attack.stats.attacker_losses?.total,
        defenderLosses: attack.stats.defender_losses?.total,
        fortHPAtEnd: attack.stats.forthpAtEnd,
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

export default BattleService;
