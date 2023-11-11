import type { NextApiRequest, NextApiResponse } from "next";

import { WeaponTypes } from "@/constants";
import prisma from "@/lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "POST") {
    const { userId, items } = req.body;

    // Validate the input data
    if (!userId || !Array.isArray(items)) {
      return res.status(400).json({ error: "Invalid input data" });
    }

    try {
      const user = await prisma.users.findUnique({ where: { id: userId } });
      let totalRefund = 0;

      // Create a copy of user's items to manipulate
      let updatedItems = [...user.items];

      for (const itemData of items) {
        if (itemData.quantity < 0)
          return res.status(400).json({ error: "Invalid quantity" });
        const itemType = WeaponTypes.find(
          (w) => w.type === itemData.type && w.usage === itemData.usage && w.level === itemData.level
        );
        if (!itemType) {
          return res.status(400).json({
            error: `Invalid item type: ${itemData.type} with usage: ${itemData.usage} and level: ${itemData.level}`,
          });
        }

        const userItemIndex = updatedItems.findIndex(
          (i) => i.type === itemData.type && i.usage === itemData.usage && i.level === itemData.level
        );
        
        if (itemData.quantity <= 0)
          continue;
        if (userItemIndex === -1 || updatedItems[userItemIndex].quantity < itemData.quantity) {
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

        totalRefund += itemType.cost * itemData.quantity;
      }

      await prisma.users.update({
        where: { id: userId },
        data: {
          gold: user.gold + totalRefund,
          items: updatedItems,
        },
      });

      return res.status(200).json({
        message: "Items unequipped successfully!",
        data: updatedItems,
      });
    } catch (error) {
      return res.status(500).json({ error: "Failed to unequip items", message: error.message });
    }
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }
}
