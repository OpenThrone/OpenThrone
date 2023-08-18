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
      let totalCost = 0;

      for (const itemData of items) {
        const item = WeaponTypes.find(
          (w) => w.type === itemData.type && w.usage === itemData.usage
        );
        if (!item) {
          return res
            .status(400)
            .json({
              error: `Invalid item type: ${itemData.type} with usage: ${itemData.usage}`,
            });
        }
        totalCost += item.cost * itemData.quantity;
      }

      if (user.gold < totalCost) {
        return res.status(400).json({ error: "Not enough gold" });
      }

      // Deduct the number of items from user's inventory
      const updatedItems = user.items.map((i) => {
        const itemToUpdate = items.find(
          (item) => item.type === i.type && item.usage === i.usage
        );
        if (itemToUpdate) {
          i.quantity += itemToUpdate.quantity;
        }
        return i;
      });

      // If the user does not have any of the items they want to equip, add that item type to their items array
      for (const itemData of items) {
        if (
          !user.items.some(
            (i) => i.type === itemData.type && i.usage === itemData.usage
          )
        ) {
          updatedItems.push({
            type: itemData.type,
            usage: itemData.usage,
            level: 1, // Assuming level 1 for simplicity
            quantity: itemData.quantity,
          });
        }
      }

      await prisma.users.update({
        where: { id: userId },
        data: {
          gold: user.gold - totalCost,
          items: updatedItems,
        },
      });
      const updatedUser = await prisma.users.findUnique({
        where: { id: userId },
      });
      return res.status(200).json({
        message: "Items equipped successfully!",
        data: updatedUser.items,
      });
    } catch (error) {
      return res.status(500).json({ error: "Failed to equip items" });
    }
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }
}
