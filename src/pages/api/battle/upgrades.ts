import type { NextApiRequest, NextApiResponse } from 'next';

import { BattleUpgrades, ItemTypes } from '@/constants';
import prisma from '@/lib/prisma';
import UserModel from '@/models/Users';
import { withAuth } from '@/middleware/auth';

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

  const { userId, items: itemsToEquip, operation = 'buy' } = req.body;
  if (!userId || !Array.isArray(itemsToEquip) || !['buy', 'sell'].includes(operation)) {
    return res.status(400).json({ error: 'Invalid input data' });
  }

  try {
    const user = await prisma.users.findUnique({ where: { id: req.session.user.id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const uModel = new UserModel(user);
    let totalCost = 0;

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
      const itemCost =
        (item.cost - ((uModel.priceBonus || 0) / 100) * item.cost) *
        itemData.quantity;
      if (operation === 'buy') {
        totalCost += itemCost;
      } else { // selling items
        totalCost -= itemCost;
      }
    }

    // Check if the user has enough gold
    if (operation === 'buy' && user.gold < totalCost) {
      return res.status(400).json({ error: 'Not enough gold' });
    }

    // Deduct gold and equip items
    const updatedItems = user.battle_upgrades.map((userItem: EquipmentProps) => {
      const itemToEquip = itemsToEquip.find(
        (item) => item.type === userItem.type && item.level === userItem.level
      );
      if (itemToEquip) {
        const newQuantity = operation === 'buy' ?
          userItem.quantity + itemToEquip.quantity : // increase item quantity when buying
          userItem.quantity - itemToEquip.quantity; // decrease item quantity when selling

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
      // Update the user's gold and items in the database
      await tx.users.update({
        where: { id: userId },
        data: {
          gold: BigInt(user.gold) - BigInt(totalCost),
          battle_upgrades: updatedItems,
        },
      });
    
      await tx.bank_history.create({
        data: {
          gold_amount: BigInt(totalCost),
          from_user_id: (operation === 'buy' ? userId : 0),
          from_user_account_type: (operation === 'buy' ? 'HAND' : 'BANK'),
          to_user_id: (operation === 'buy' ? 0 : userId),
          to_user_account_type: (operation === 'buy' ? 'BANK' : 'HAND'),
          date_time: new Date(),
          history_type: 'SALE',
          stats: {
            operation: operation,
            action: 'battle_upgrade',
            items: itemsToEquip.map(item => ({
              type: item.type,
              level: item.level,
              quantity: item.quantity,
              cost: item.cost,
            }))
          }
        },
      });
    });

    return res.status(200).json({
      message: 'Items equipped successfully',
      data: updatedItems,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to equip items', message: error.message });
  }
}

export default withAuth(handler);