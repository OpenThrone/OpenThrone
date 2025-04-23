import type { NextApiRequest, NextApiResponse } from 'next';

import { BattleUpgrades, ItemTypes } from '@/constants';
import prisma from '@/lib/prisma';
import UserModel from '@/models/Users';
import { withAuth } from '@/middleware/auth';
import { calculateUserStats } from '@/utils/utilities';
import { updateUserAndBankHistory } from '@/services';
import { z } from 'zod';
import { logError } from '@/utils/logger';

const BattleUpgradeItemSchema = z.object({
  type: z.string(),
  level: z.number().int(),
  quantity: z.number().int().nonnegative({ message: 'Quantity must be non-negative integer.' })
});
const BattleUpgradesSchema = z.object({
  userId: z.number().int(),
  operation: z.enum(['buy', 'sell']).optional(),
  items: z.array(BattleUpgradeItemSchema).min(1, { message: 'At least one item must be provided.' })
});

interface EquipmentProps {
  type: string;
  level: number;
  quantity: number | string;
}

const handler = async(
  req: NextApiRequest,
  res: NextApiResponse,
) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const parseResult = BattleUpgradesSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid request body', details: parseResult.error.flatten().fieldErrors });
  }
  const { userId, items: itemsToEquip, operation = 'buy' } = parseResult.data;

  try {
    const user = await prisma.users.findUnique({ where: { id: req.session.user.id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const uModel = new UserModel(user);
    let totalCost = 0;

    // Cast battle_upgrades to EquipmentProps[] and ensure quantities are numbers
    const userBattleUpgrades = (user.battle_upgrades as unknown as EquipmentProps[]).map(item => ({
      ...item,
      quantity: typeof item.quantity === 'string' ? parseInt(item.quantity as string, 10) : item.quantity
    }));

    // Validate the items and calculate total cost
    for (const itemData of itemsToEquip) {
      const item = BattleUpgrades.find(
        (w) =>
          w.type === itemData.type &&
          w.level === itemData.level
      );
      if (itemData.quantity < 0) {
        return res.status(400).json({ error: 'Invalid quantity' });
      }
      if (!item) {
        return res
          .status(400)
          .json({ error: `Invalid item type, usage, or level` });
      }
      // Always round up for costs, down for refunds
      const itemBaseCost = item.cost - Math.ceil(((uModel.priceBonus || 0) / 100) * item.cost);
      if (operation === 'buy') {
        totalCost += Math.ceil(itemBaseCost * itemData.quantity);
      } else { // selling items
        totalCost -= Math.floor(itemBaseCost * itemData.quantity * 0.75); // 75% of the cost
      }
    }

    // Check if the user has enough gold
    if (operation === 'buy' && user.gold < totalCost) {
      return res.status(400).json({ error: 'Not enough gold' });
    }

    // Deduct gold and equip items
    const updatedItems = userBattleUpgrades.map((userItem: EquipmentProps) => {
      const itemToEquip = itemsToEquip.find(
        (item) => item.type === userItem.type && item.level === userItem.level
      );
      if (itemToEquip) {
        const userQty = typeof userItem.quantity === 'string' ? parseInt(userItem.quantity as string, 10) : userItem.quantity;
        const equipQty = typeof itemToEquip.quantity === 'string' ? parseInt(itemToEquip.quantity as string, 10) : itemToEquip.quantity;
        const newQuantity = operation === 'buy' ?
          userQty + equipQty : // increase item quantity when buying
          userQty - equipQty; // decrease item quantity when selling

        if (newQuantity < 0) {
          return res.status(400).json({ error: 'Cannot have negative quantity' });
        }

        return { ...userItem, quantity: newQuantity };
      }
      return userItem;
    });

    // Add new items to the inventory if they don't exist
    itemsToEquip.forEach((itemData) => {
      if (
        !updatedItems.some(
          (i: EquipmentProps) =>
            i.type === itemData.type &&
            i.level === itemData.level,
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
      const { killingStrength, defenseStrength, newOffense, newDefense, newSpying, newSentry } =
        calculateUserStats(user, JSON.parse(JSON.stringify(updatedItems)), 'battle_upgrades');
      await updateUserAndBankHistory(
        tx,
        userId,
        BigInt(user.gold) - BigInt(totalCost),
        updatedItems,
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
            operation: operation,
            type: operation === 'buy' ? 'BATTLE_UPGRADES_BUY' : 'BATTLE_UPGRADES_SELL',
            items: itemsToEquip.map(item => ({
              type: item.type,
              level: item.level,
              quantity: item.quantity,
            }))
          },
        },
        'battle_upgrades'
      );
    });

    return res.status(200).json({
      message: 'Items equipped successfully',
      data: updatedItems,
    });
  } catch (error) {
    logError(error);
    return res.status(500).json({ error: 'Failed to equip items', message: error.message });
  }
}

export default withAuth(handler);