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

      for (const itemData of items) {
        const item = WeaponTypes.find(
          (w) => w.type === itemData.type && w.usage === itemData.usage
        );
        if (!item) {
          return res.status(400).json({
            error: `Invalid item type: ${itemData.type} with usage: ${itemData.usage}`,
          });
        }

        const userItem = user.items.find(
          (i) => i.type === itemData.type && i.usage === itemData.usage
        );

        if (!userItem || userItem.quantity < itemData.quantity) {
          return res
            .status(400)
            .json({ error: `Not enough ${item.name} to unequip` });
        }

        totalRefund += item.cost * itemData.quantity;
      }

      // Add the number of items back to user's inventory
      const updatedItems = user.items.map((i) => {
        const itemToUnequip = items.find(
          (item) => item.type === i.type && item.usage === i.usage
        );
        if (itemToUnequip) {
          i.quantity -= itemToUnequip.quantity;
        }
        return i;
      });

      await prisma.users.update({
        where: { id: userId },
        data: {
          gold: user.gold + totalRefund,
          items: updatedItems,
        },
      });
      const updatedUser = await prisma.users.findUnique({
        where: { id: userId },
      });
      return res.status(200).json({
        message: "Items unequipped successfully!",
        data: updatedUser.items,
      });
    } catch (error) {
      return res.status(500).json({ error: "Failed to unequip items" });
    }
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }
}
