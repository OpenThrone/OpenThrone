import { z } from 'zod';

import { ItemTypes } from '@/constants';
import { UnitTypes } from '@/constants/Units';
import prisma from '@/lib/prisma';
import UserModel from '@/models/Users';
import { getUserById } from '@/services/AttackDataService';
import { updateUserAndBankHistory } from '@/services/User.service';
import type { Item } from '@/types/typings';
import { discountedItemCost, slotFloorCost } from '@/utils/armoryPricing';
import { ArmoryUpgradeSchema } from '@/utils/armoryUpgradeSchema';
import { logError } from '@/utils/logger';
import { calculateUserStats } from '@/utils/utilities';

// Type definitions for armory operations
/** Describes the armory item data contract. */
export interface ArmoryItem {
  type: string;
  usage: string;
  level: number;
  quantity: number;
}

interface MercenaryData {
  type: string;
  level: number;
  quantity: number;
  expiresAt: Date;
}

interface ConvertItemData {
  fromItem: string;
  toItem: string;
  conversionAmount: number;
}

// Zod schemas for validation
const ArmoryItemSchema = z.object({
  type: z.string(),
  usage: z.string(),
  level: z.number().int().min(1),
  quantity: z
    .number()
    .int()
    .positive({ message: 'Quantity must be a positive integer.' }),
});

const EquipItemsSchema = z.object({
  userId: z.number().int(),
  items: z
    .array(ArmoryItemSchema)
    .min(1, { message: 'At least one item must be provided.' }),
});

const UnequipItemsSchema = z.object({
  userId: z.number().int(),
  items: z
    .array(ArmoryItemSchema)
    .min(1, { message: 'At least one item must be provided.' }),
});

const HireMercenarySchema = z.object({
  userId: z.number().int(),
  unitType: z.enum(['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY']),
  level: z.number().int().min(1).max(3),
  quantity: z.number().int().min(1).max(100),
});

const DismissMercenarySchema = z.object({
  userId: z.number().int(),
  unitType: z.enum(['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY']),
  level: z.number().int().min(1).max(3),
  quantity: z.number().int().min(1).max(100),
});

const ConvertItemsSchema = z.object({
  userId: z.number().int(),
  fromItem: z.string(),
  toItem: z.string(),
  conversionAmount: z.number().int().positive(),
});

/** Matches the armory UI filter: an item is usable when it is for ALL races or the user's race. */
export const isItemAvailableToRace = (
  item: Pick<Item, 'race'>,
  race: string | null | undefined,
): boolean => item.race === 'ALL' || item.race === race;

/** Describes the gold movement for one armory conversion. */
export interface ItemConversionQuote {
  cost: number;
  refund: number;
}

/**
 * Validates an armory conversion and prices it. Throws "Cannot convert ..." on any rule breach.
 *
 * Gold rule: the user pays the full price difference when the target is worth more and gets
 * 75% of the difference back when it is worth less. Because every conversion is priced from
 * the same per-item values, the charges along any cycle are at least the refunds / 0.75, so
 * no sequence of conversions can end with more gold than it started with.
 */
export const quoteItemConversion = (params: {
  from: Item;
  to: Item;
  amount: number;
  priceBonus: number;
  race: string | null | undefined;
  armoryLevel: number;
}): ItemConversionQuote => {
  const { from, to, amount, priceBonus, race, armoryLevel } = params;

  // Conversions stay inside one armory slot family (same unit usage and equipment type)
  if (from.usage !== to.usage || from.type !== to.type) {
    throw new Error(
      'Cannot convert between different item types. Source and target must share usage and type.',
    );
  }
  if (from.level === to.level) {
    throw new Error('Cannot convert items to the same level.');
  }
  if (!isItemAvailableToRace(to, race)) {
    throw new Error(`Cannot convert to ${to.name}: not available to ${race}.`);
  }
  const requiredArmoryLevel = to.armoryLevel ?? 1;
  if (requiredArmoryLevel > armoryLevel) {
    throw new Error(
      `Cannot convert to ${to.name}: requires armory level ${requiredArmoryLevel}.`,
    );
  }

  const perUnitDifference =
    discountedItemCost(to.cost, priceBonus) -
    discountedItemCost(slotFloorCost(from), priceBonus);

  return {
    cost: perUnitDifference > 0 ? Math.ceil(amount * perUnitDifference) : 0,
    refund:
      perUnitDifference < 0
        ? Math.floor(amount * -perUnitDifference * 0.75)
        : 0,
  };
};

// Result interfaces
/** Describes the armory operation result data contract. */
export interface ArmoryOperationResult {
  message: string;
  data: any;
  cost?: number;
}

/** Describes the mercenary operation result data contract. */
export interface MercenaryOperationResult {
  message: string;
  mercenaries: MercenaryData[];
  remainingGold?: string;
  addedGold?: string;
  cost?: string;
  expiresAt?: Date;
}

/** Encapsulates armory data access and domain operations. */
export class ArmoryService {
  /**
   * Equips items for a user
   */
  static async equipItems(data: {
    userId: number;
    items: ArmoryItem[];
  }): Promise<ArmoryOperationResult> {
    const validatedData = EquipItemsSchema.parse(data);
    const { userId, items: itemsToEquip } = validatedData;

    try {
      // All reads and writes happen under the user row lock so the gold check cannot be raced
      const updatedItemsResult = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;

        const currentUser = await getUserById(userId, tx);
        if (!currentUser) {
          throw new Error('User not found');
        }

        const uModel = new UserModel(currentUser);
        const { armoryLevel, race } = uModel;
        let totalCost = 0;

        // Validate items (existence, race, armory level gate) and calculate total cost
        for (const itemData of itemsToEquip) {
          const candidates = ItemTypes.filter(
            (w) =>
              w.type === itemData.type &&
              w.level === itemData.level &&
              w.usage === itemData.usage,
          );

          if (candidates.length === 0) {
            throw new Error(
              `Invalid item configuration: Type ${itemData.type}, Level ${itemData.level}, Usage ${itemData.usage}`,
            );
          }

          // Race gate: mirrors the armory page filter (race ALL or the user's race)
          const itemDefinition = candidates.find((w) =>
            isItemAvailableToRace(w, race),
          );
          if (!itemDefinition) {
            throw new Error(
              `Cannot equip ${candidates[0].name}: not available to ${race}.`,
            );
          }

          // Armory gate: mirrors UserUnitsService.getAvailableItemTypes
          const requiredArmoryLevel = itemDefinition.armoryLevel ?? 1;
          if (requiredArmoryLevel > armoryLevel) {
            throw new Error(
              `Cannot equip ${itemDefinition.name}: requires armory level ${requiredArmoryLevel}.`,
            );
          }

          const itemBaseCost =
            itemDefinition.cost -
            Math.ceil(((uModel.priceBonus ?? 0) / 100) * itemDefinition.cost);
          totalCost += Math.ceil(itemBaseCost * itemData.quantity);
        }

        if (BigInt(currentUser.gold) < BigInt(totalCost)) {
          throw new Error(
            `Not enough gold. Required: ${totalCost}, Available: ${currentUser.gold}`,
          );
        }

        const currentItemsMap = new Map<string, ArmoryItem>();
        (currentUser.UserItem as ArmoryItem[]).forEach((item) => {
          const key = `${item.type}-${item.usage}-${item.level}`;
          currentItemsMap.set(key, item);
        });

        // Update quantities or add new items
        itemsToEquip.forEach((itemData) => {
          const key = `${itemData.type}-${itemData.usage}-${itemData.level}`;
          const existingItem = currentItemsMap.get(key);
          if (existingItem) {
            const currentQuantity =
              typeof existingItem.quantity === 'string'
                ? parseInt(existingItem.quantity, 10)
                : existingItem.quantity;
            const incomingQty =
              typeof itemData.quantity === 'string'
                ? parseInt(itemData.quantity, 10)
                : itemData.quantity;
            existingItem.quantity = currentQuantity + incomingQty;
          } else {
            currentItemsMap.set(key, {
              type: itemData.type,
              usage: itemData.usage,
              level: itemData.level,
              quantity: itemData.quantity,
            });
          }
        });

        const updatedItemsArray = Array.from(currentItemsMap.values());

        // Calculate new stats based on the updated items array
        const {
          killingStrength,
          defenseStrength,
          newOffense,
          newDefense,
          newSpying,
          newSentry,
        } = calculateUserStats(currentUser, updatedItemsArray, 'items');

        // Update user and bank history
        await updateUserAndBankHistory(
          tx,
          userId,
          BigInt(currentUser.gold) - BigInt(totalCost),
          updatedItemsArray,
          killingStrength,
          defenseStrength,
          newOffense,
          newDefense,
          newSpying,
          newSentry,
          {
            gold_amount: BigInt(totalCost),
            from_user_id: userId,
            from_user_account_type: 'HAND',
            to_user_id: 0,
            to_user_account_type: 'BANK',
            date_time: new Date().toISOString(),
            history_type: 'SALE',
            stats: {
              type: 'ARMORY_EQUIP',
              items: itemsToEquip,
            },
          },
          'items',
        );

        return updatedItemsArray;
      });

      return {
        message: 'Items equipped successfully',
        data: updatedItemsResult,
      };
    } catch (error: any) {
      logError('Error equipping items', { userId, items: itemsToEquip, error });
      throw error;
    }
  }

  /**
   * Unequips items for a user
   */
  static async unequipItems(data: {
    userId: number;
    items: ArmoryItem[];
  }): Promise<ArmoryOperationResult> {
    const validatedData = UnequipItemsSchema.parse(data);
    const { userId, items: itemsToUnequip } = validatedData;

    try {
      // Transaction for atomicity
      const updatedItemsResult = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;

        const user = await getUserById(userId, tx);

        if (!user) {
          throw new Error('User not found within transaction');
        }

        const userItemsMap = new Map<string, ArmoryItem>();
        (user.UserItem as ArmoryItem[]).forEach((item) => {
          const quantity =
            typeof item.quantity === 'string'
              ? parseInt(item.quantity as string, 10)
              : item.quantity;
          if (isNaN(quantity)) {
            throw new Error(
              `Invalid quantity format for item ${item.type}-${item.usage}-${item.level} in user inventory.`,
            );
          }
          userItemsMap.set(`${item.type}-${item.usage}-${item.level}`, {
            ...item,
            quantity,
          });
        });

        let totalRefund = 0;

        // Validate and process items to unequip
        for (const itemData of itemsToUnequip) {
          const key = `${itemData.type}-${itemData.usage}-${itemData.level}`;
          const itemDefinition = ItemTypes.find(
            (w) =>
              w.type === itemData.type &&
              w.usage === itemData.usage &&
              w.level === itemData.level,
          );

          if (!itemDefinition) {
            throw new Error(
              `Invalid item definition: Type ${itemData.type}, Level ${itemData.level}, Usage ${itemData.usage}`,
            );
          }

          const userItem = userItemsMap.get(key);

          const requestedQty =
            typeof itemData.quantity === 'string'
              ? parseInt(itemData.quantity as string, 10)
              : itemData.quantity;

          if (!userItem || userItem.quantity < requestedQty) {
            throw new Error(
              `Not enough ${itemDefinition.name} (Level ${itemDefinition.level}) to unequip. Required: ${requestedQty}, Available: ${userItem?.quantity ?? 0}`,
            );
          }

          // Update quantity
          userItem.quantity -= requestedQty;

          // Calculate refund
          const txUserModel = new UserModel({ ...user, id: userId });
          const itemBaseCost =
            itemDefinition.cost -
            Math.ceil(
              ((txUserModel.priceBonus ?? 0) / 100) * itemDefinition.cost,
            );
          totalRefund += Math.floor(itemBaseCost * requestedQty * 0.75); // 75% refund
        }

        // Filter out items with zero quantity
        const finalItemsArray = Array.from(userItemsMap.values()).filter(
          (item) => item.quantity > 0,
        );

        // Calculate new stats based on the final items array
        const {
          killingStrength,
          defenseStrength,
          newOffense,
          newDefense,
          newSpying,
          newSentry,
        } = calculateUserStats(user, finalItemsArray, 'items');

        // Update user and bank history
        await updateUserAndBankHistory(
          tx,
          userId,
          BigInt(user.gold) + BigInt(totalRefund),
          finalItemsArray,
          killingStrength,
          defenseStrength,
          newOffense,
          newDefense,
          newSpying,
          newSentry,
          {
            gold_amount: BigInt(totalRefund),
            from_user_id: 0,
            from_user_account_type: 'BANK',
            to_user_id: userId,
            to_user_account_type: 'HAND',
            date_time: new Date().toISOString(),
            history_type: 'SALE',
            stats: {
              type: 'ARMORY_UNEQUIP',
              items: itemsToUnequip,
            },
          },
          'items',
        );

        return finalItemsArray;
      });

      return {
        message: 'Items unequipped successfully',
        data: updatedItemsResult,
      };
    } catch (error: any) {
      logError('Error unequipping items', {
        userId,
        items: itemsToUnequip,
        error,
      });
      throw error;
    }
  }

  /**
   * Hires mercenaries for a user
   */
  static async hireMercenary(data: {
    userId: number;
    unitType: string;
    level: number;
    quantity: number;
  }): Promise<MercenaryOperationResult> {
    const validatedData = HireMercenarySchema.parse(data);
    const { userId, unitType, level, quantity } = validatedData;

    try {
      // Use a transaction to update gold, mercenaries and create bank history atomically
      const result = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;

        // Read user inside transaction for consistency
        const user = await getUserById(userId, tx);
        if (!user) {
          throw new Error('User not found');
        }

        const unit = UnitTypes.find(
          (u) => u.type === unitType && u.level === level,
        );
        if (!unit) {
          throw new Error('Invalid unit type or level');
        }

        // Check fort level requirement for mercenaries
        const requiredFortLevel = 5 + (level - 1) * 3;
        if (user.fort_level < requiredFortLevel) {
          throw new Error(
            `Fort level too low. Requires fort level ${requiredFortLevel} for level ${level} mercenaries.`,
          );
        }

        // Calculate cost with user's price bonus
        const uModel = new UserModel(user);
        const unitBaseCost =
          unit.cost - Math.ceil(((uModel.priceBonus ?? 0) / 100) * unit.cost);
        const totalCost = BigInt(Math.ceil(unitBaseCost * quantity));

        if (BigInt(user.gold) < totalCost) {
          throw new Error('Insufficient gold');
        }

        // Prepare new mercenary entry
        const currentMercs = (user.mercenaries as MercenaryData[]) || [];
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        const newMerc = { type: unitType, level, quantity, expiresAt };
        const updatedMercs = [...currentMercs, newMerc];

        // Update user gold and mercenaries in transaction
        await tx.users.update({
          where: { id: userId },
          data: {
            gold: { decrement: totalCost },
            mercenaries: updatedMercs,
          },
        });

        // Create bank history entry in transaction
        await tx.bank_history.create({
          data: {
            gold_amount: totalCost,
            from_user_id: userId,
            from_user_account_type: 'HAND',
            to_user_id: 0,
            to_user_account_type: 'BANK',
            date_time: new Date().toISOString(),
            history_type: 'SALE',
            stats: { type: 'HIRE_MERCENARY', unitType, level, quantity },
          },
        });

        return {
          updatedMercs,
          remainingGold: (BigInt(user.gold) - totalCost).toString(),
          cost: totalCost.toString(),
          expiresAt,
        };
      });

      return {
        message: 'Mercenary hired successfully',
        mercenaries: result.updatedMercs,
        remainingGold: result.remainingGold,
        cost: result.cost,
        expiresAt: result.expiresAt,
      };
    } catch (error: any) {
      logError('Error hiring mercenary', {
        userId,
        unitType,
        level,
        quantity,
        error,
      });
      throw error;
    }
  }

  /**
   * Dismisses mercenaries for a user
   */
  static async dismissMercenary(data: {
    userId: number;
    unitType: string;
    level: number;
    quantity: number;
  }): Promise<MercenaryOperationResult> {
    const validatedData = DismissMercenarySchema.parse(data);
    const { userId, unitType, level, quantity } = validatedData;

    try {
      const result = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;

        const user = await getUserById(userId, tx);
        if (!user) {
          throw new Error('User not found');
        }

        const unit = UnitTypes.find(
          (u) => u.type === unitType && u.level === level,
        );
        if (!unit) {
          throw new Error('Invalid unit type or level');
        }

        const currentMercs = (user.mercenaries as MercenaryData[]) || [];
        let totalAvailable = 0;
        for (const merc of currentMercs) {
          if (merc.type === unitType && merc.level === level) {
            totalAvailable += merc.quantity;
          }
        }
        if (totalAvailable < quantity) {
          throw new Error('Insufficient mercenaries to dismiss');
        }

        const uModel = new UserModel(user);
        const unitCost = BigInt(
          discountedItemCost(unit.cost, uModel.priceBonus ?? 0),
        );
        const originalCost = unitCost * BigInt(quantity);
        const refund = originalCost / BigInt(2); // 50% refund

        // Update mercenaries: subtract quantity across matching entries
        let remainingToDismiss = quantity;
        const updatedMercs = currentMercs.filter((merc) => {
          if (
            merc.type === unitType &&
            merc.level === level &&
            remainingToDismiss > 0
          ) {
            const subtract = Math.min(merc.quantity, remainingToDismiss);
            merc.quantity -= subtract;
            remainingToDismiss -= subtract;
            if (merc.quantity <= 0) {
              return false; // Remove if zero or negative
            }
            return true;
          }
          return true;
        });

        await tx.users.update({
          where: { id: userId },
          data: {
            gold: { increment: refund },
            mercenaries: updatedMercs,
          },
        });

        return { updatedMercs, refund };
      });

      return {
        message: 'Mercenary dismissed successfully',
        mercenaries: result.updatedMercs,
        addedGold: result.refund.toString(),
      };
    } catch (error: any) {
      logError('Error dismissing mercenary', {
        userId,
        unitType,
        level,
        quantity,
        error,
      });
      throw error;
    }
  }

  /**
   * Converts items for a user
   */
  /** Apply a reviewed multi-slot upgrade under one lock and one transaction. */
  static async upgradeItems(data: {
    userId: number;
    conversions: ConvertItemData[];
  }): Promise<ArmoryOperationResult> {
    const { userId, conversions } = ArmoryUpgradeSchema.parse(data);
    try {
      const result = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
        const user = await getUserById(userId, tx);
        if (!user) throw new Error('User not found');
        const model = new UserModel(user);
        const userItems: ArmoryItem[] = (user.UserItem || []).map((item) => ({
          type: item.type,
          usage: item.usage,
          level: Number(item.level),
          quantity: Number(item.quantity),
        }));
        let totalCost = 0;
        let totalRefund = 0;
        for (const { fromItem, toItem, conversionAmount } of conversions) {
          const from = ItemTypes.find(
            (item) => `${item.usage}_${item.id}` === fromItem,
          );
          const to = ItemTypes.find(
            (item) => `${item.usage}_${item.id}` === toItem,
          );
          if (!from || !to) throw new Error('Invalid item types');
          if (to.level <= from.level)
            throw new Error('Cannot upgrade to the same or a lower tier.');
          const quote = quoteItemConversion({
            from,
            to,
            amount: conversionAmount,
            priceBonus: model.priceBonus ?? 0,
            race: model.race,
            armoryLevel: model.armoryLevel,
          });
          const source = userItems.find(
            (item) =>
              item.type === from.type &&
              item.usage === from.usage &&
              item.level === from.level,
          );
          if (!source || source.quantity < conversionAmount)
            throw new Error('Not enough items to upgrade');
          let target = userItems.find(
            (item) =>
              item.type === to.type &&
              item.usage === to.usage &&
              item.level === to.level,
          );
          if (!target) {
            target = {
              type: to.type,
              usage: to.usage,
              level: to.level,
              quantity: 0,
            };
            userItems.push(target);
          }
          source.quantity -= conversionAmount;
          target.quantity += conversionAmount;
          totalCost += quote.cost;
          totalRefund += quote.refund;
        }
        if (
          !Number.isSafeInteger(totalCost) ||
          !Number.isSafeInteger(totalRefund)
        )
          throw new Error('Invalid upgrade total');
        if (BigInt(user.gold) < BigInt(totalCost))
          throw new Error('Not enough gold');
        const finalGold =
          BigInt(user.gold) - BigInt(totalCost) + BigInt(totalRefund);
        const stats = calculateUserStats(user, userItems, 'items');
        await updateUserAndBankHistory(
          tx,
          userId,
          finalGold,
          userItems,
          stats.killingStrength,
          stats.defenseStrength,
          stats.newOffense,
          stats.newDefense,
          stats.newSpying,
          stats.newSentry,
          {
            gold_amount: BigInt(Math.abs(totalCost - totalRefund)),
            from_user_id: userId,
            from_user_account_type: totalCost >= totalRefund ? 'HAND' : 'BANK',
            to_user_id: userId,
            to_user_account_type: totalCost >= totalRefund ? 'BANK' : 'HAND',
            date_time: new Date().toISOString(),
            history_type: 'SALE',
            stats: {
              type: 'ARMORY_UPGRADE',
              conversions,
              cost: totalCost,
              refund: totalRefund,
            },
          },
          'items',
        );
        return { userItems, totalCost };
      });
      return {
        message: 'Equipment upgraded successfully',
        data: result.userItems,
        cost: result.totalCost,
      };
    } catch (error) {
      logError('Armory upgrade failed', { userId, error });
      throw error;
    }
  }

  static async convertItems(data: {
    userId: number;
    fromItem: string;
    toItem: string;
    conversionAmount: number;
  }): Promise<ArmoryOperationResult> {
    const validatedData = ConvertItemsSchema.parse(data);
    const { userId, fromItem, toItem, conversionAmount } = validatedData;

    try {
      const result = await prisma.$transaction(async (tx) => {
        // Serialize conversions for this user; items and gold are re-read under the row lock
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;

        const user = await getUserById(userId, tx);
        if (!user) {
          throw new Error('User not found');
        }

        // Normalize items coming from the Prisma user include (UserItem)
        const userItems: ArmoryItem[] = (user.UserItem || []).map(
          (it: any) => ({
            type: it.type,
            usage: it.usage,
            level:
              typeof it.level === 'string' ? parseInt(it.level, 10) : it.level,
            quantity:
              typeof it.quantity === 'string'
                ? parseInt(it.quantity, 10)
                : it.quantity,
          }),
        );

        const amount = conversionAmount;
        const uModel = new UserModel(user);

        const [fromUsage, fromType] = fromItem.split(/_(.+)/);
        const [toUsage, toType] = toItem.split(/_(.+)/);

        const toItemType = ItemTypes.find(
          (item) => item.id === toType && item.usage === toUsage,
        );
        const fromItemType = ItemTypes.find(
          (item) => item.id === fromType && item.usage === fromUsage,
        );

        if (!toItemType || !fromItemType) {
          throw new Error('Invalid item types');
        }

        // Category, race, armory level and pricing rules live in quoteItemConversion
        const { cost, refund } = quoteItemConversion({
          from: fromItemType,
          to: toItemType,
          amount,
          priceBonus: uModel?.priceBonus || 0,
          race: uModel.race,
          armoryLevel: uModel.armoryLevel,
        });

        const fromItemData = userItems.find(
          (item) =>
            item.type === fromItemType.type &&
            item.usage === fromUsage &&
            item.level === fromItemType.level,
        );
        if (!fromItemData) {
          throw new Error('Source item not found for user.');
        }
        if (Number(fromItemData.quantity) < amount) {
          throw new Error('Not enough items to convert');
        }

        let toItemData = userItems.find(
          (item) =>
            item.type === toItemType.type &&
            item.usage === toUsage &&
            item.level === toItemType.level,
        );
        if (!toItemData) {
          toItemData = {
            type: toItemType.type,
            usage: toUsage,
            level: toItemType.level,
            quantity: 0,
          };
          userItems.push(toItemData);
        }
        const previousToItemQuantity = Number(toItemData.quantity);
        const isCharge = cost > 0;

        if (BigInt(user.gold) < BigInt(cost)) {
          throw new Error('Not enough gold');
        }

        fromItemData.quantity = Number(fromItemData.quantity) - amount;
        toItemData.quantity = previousToItemQuantity + amount;

        const finalGold = BigInt(user.gold) - BigInt(cost) + BigInt(refund);

        const {
          killingStrength,
          defenseStrength,
          newOffense,
          newDefense,
          newSpying,
          newSentry,
        } = calculateUserStats(user, userItems, 'items');

        await updateUserAndBankHistory(
          tx,
          userId,
          finalGold,
          userItems,
          killingStrength,
          defenseStrength,
          newOffense,
          newDefense,
          newSpying,
          newSentry,
          {
            gold_amount: BigInt(cost > 0 ? cost : refund),
            from_user_id: Number(userId),
            from_user_account_type: isCharge ? 'HAND' : 'BANK',
            to_user_id: Number(userId),
            to_user_account_type: isCharge ? 'BANK' : 'HAND',
            date_time: new Date().toISOString(),
            history_type: 'SALE',
            stats: {
              type: 'ARMORY_CONVERSION',
              fromItem,
              toItem,
              amount,
              previousToItemQuantity,
            },
          },
          'items',
        );

        return { userItems, amountMoved: cost > 0 ? cost : refund };
      });

      return {
        message: 'Conversion successful',
        data: result.userItems,
        cost: result.amountMoved,
      };
    } catch (error: any) {
      logError('Error converting items', {
        userId,
        fromItem,
        toItem,
        conversionAmount,
        error,
      });
      throw error;
    }
  }
}
