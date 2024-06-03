import type { NextApiRequest, NextApiResponse } from 'next';

import { ItemTypes } from '@/constants';
import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import UserModel from '@/models/Users';

const handler = async (
  req: NextApiRequest,
  res: NextApiResponse,
) => {
  if (req.method === 'POST') {
    const { userId, items } = req.body;
    if (userId !== req.session.user.id)
      return res.status(403).json({ error: 'Unauthorized' });
    // Validate the input data
    if (!userId || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Invalid input data' });
    }

    try {
      const user = await prisma.users.findUnique({ where: { id: userId } });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      const uModel = new UserModel(user);
      let totalRefund = 0;

      // Create a copy of user's items to manipulate
      const updatedItems = [...user.items];

      for (const itemData of items) {
        if (itemData.quantity < 0)
          return res.status(400).json({ error: 'Invalid quantity' });
        const itemType = ItemTypes.find(
          (w) =>
            w.type === itemData.type &&
            w.usage === itemData.usage &&
            w.level === itemData.level,
        );
        if (!itemType) {
          return res.status(400).json({
            error: `Invalid item type: ${itemData.type} with usage: ${itemData.usage} and level: ${itemData.level}`,
          });
        }

        const userItemIndex = updatedItems.findIndex(
          (i) =>
            i.type === itemData.type &&
            i.usage === itemData.usage &&
            i.level === itemData.level,
        );

        if (itemData.quantity <= 0) continue;
        if (
          userItemIndex === -1 ||
          updatedItems[userItemIndex].quantity < itemData.quantity
        ) {
          return res
            .status(400)
            .json({ error: `Not enough ${itemType.name} to unequip` });
        }

        // Update the quantity of the user's item
        updatedItems[userItemIndex].quantity -= itemData.quantity;

        // Remove the item from updatedItems if quantity becomes 0
        if (updatedItems[userItemIndex].quantity === 0) {
          updatedItems.splice(userItemIndex, 1);
        }

        totalRefund += Math.floor((itemType.cost - ((uModel.priceBonus || 0) / 100) * itemType.cost) * itemData.quantity * 0.75);
      }

      await prisma.users.update({
        where: { id: userId },
        data: {
          gold: BigInt(user.gold) + BigInt(totalRefund),
          items: updatedItems,
        },
      });

      return res.status(200).json({
        message: 'Items unequipped successfully!',
        data: updatedItems,
      });
    } catch (error) {
      return res
        .status(500)
        .json({ error: 'Failed to unequip items', message: error.message });
    }
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}

export default withAuth(handler);