import type { NextApiRequest, NextApiResponse } from 'next';

import { ItemTypes } from '@/constants';
import prisma from '@/lib/prisma';
import UserModel from '@/models/Users';
import { withAuth } from '@/middleware/auth';

interface EquipmentProps {
  type: string;
  usage: string;
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

  const { userId, items: itemsToEquip } = req.body;
  if (userId !== req.session.user.id)
    return res.status(400).json({ error: 'Unauthorized' });
  // Validate the input data
  if (!userId || !Array.isArray(itemsToEquip)) {
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
      const item = ItemTypes.find(
        (w) =>
          w.type === itemData.type &&
          w.level === itemData.level &&
          w.usage === itemData.usage,
      );
      if (itemData.quantity < 0) {
        return res.status(400).json({ error: 'Invalid quantity' });
      }
      if (!item || item.usage !== itemData.usage) {
        return res
          .status(400)
          .json({ error: `Invalid item type, usage, or level` });
      }
      totalCost +=
        (item.cost - ((uModel.priceBonus || 1) / 100) * item.cost) *
        itemData.quantity;
    }

    // Check if the user has enough gold
    if (user.gold < totalCost) {
      return res.status(400).json({ error: 'Not enough gold' });
    }

    // Deduct gold and equip items
    const updatedItems = user.items.map((userItem: EquipmentProps) => {
      const itemToEquip = itemsToEquip.find(
        (item) =>
          item.type === userItem.type &&
          item.usage === userItem.usage &&
          item.level === userItem.level,
      );
      if (itemToEquip) {
        return {
          ...userItem, // Spread the rest of the properties
          quantity:
            (typeof userItem.quantity === 'string' ? parseInt(userItem.quantity, 10) : userItem.quantity) +
            (typeof itemToEquip.quantity === 'string'
              ? parseInt(itemToEquip.quantity, 10)
              : itemToEquip.quantity), // Update the quantity
        };
      }

      return userItem;
    });

    // Add new items to the inventory if they don't exist
    itemsToEquip.forEach((itemData) => {
      if (
        !updatedItems.some(
          (i: EquipmentProps) =>
            i.type === itemData.type &&
            i.usage === itemData.usage &&
            i.level === itemData.level,
        )
      ) {
        updatedItems.push({
          type: itemData.type,
          usage: itemData.usage,
          level: itemData.level,
          quantity: itemData.quantity,
        });
      }
    });

    // Update the user's gold and items in the database
    await prisma.users.update({
      where: { id: userId },
      data: {
        gold: BigInt(user.gold) - BigInt(totalCost),
        items: updatedItems,
      },
    });

    return res.status(200).json({
      message: 'Items equipped successfully',
      data: updatedItems,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to equip items' });
  }
}

export default withAuth(handler);