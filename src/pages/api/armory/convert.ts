// pages/api/armory/convert.ts
import type { NextApiResponse } from "next"; // Removed NextApiRequest
import prisma from "@/lib/prisma";
import { ItemTypes } from "@/constants";
import { withAuth } from "@/middleware/auth";
import type { AuthenticatedRequest } from '@/types/api'; // Import AuthenticatedRequest
import UserModel from "@/models/Users";
import { updateUserAndBankHistory } from "@/services";
import { calculateUserStats } from "@/utils/utilities";
import { logDebug, logError } from "@/utils/logger";

interface ConvertRequest {
  userId: string;
  fromItem: string;
  toItem: string;
  conversionAmount: string; // Amount in string format to handle locale-specific formats
  locale?: string; // Optional locale parameter
}

// Define the structure of items within the user.items array
interface UserItem {
  type: string;
  usage: string;
  level: number;
  quantity: number | string; // Allow string initially due to potential DB inconsistencies
}

const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => { // Use AuthenticatedRequest
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, fromItem, toItem, conversionAmount, locale }: ConvertRequest = req.body;

  if (!userId || !fromItem || !toItem || !conversionAmount) {
    return res.status(400).json({ error: 'Invalid input data' });
  }

  if (userId !== req.session.user.id) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const user = await prisma.users.findUnique({ where: { id: Number(userId) } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Assert user.items is an array of UserItem
    // We use a type assertion here because Prisma types JSON fields broadly.
    // Ensure the default value and any updates maintain this structure.
    // Cast through 'unknown' for stricter type safety.
    const userItems = user.items as unknown as UserItem[];

    const amount = Number(conversionAmount);
    const uModel = new UserModel(user);

    // Validate the amount
    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Invalid conversion amount' });
    }

    const [fromUsage, fromType] = fromItem.split(/_(.+)/);
    const [toUsage, toType] = toItem.split(/_(.+)/);

    const toItemType = ItemTypes.find((item) => item.id === toType && item.usage === toUsage);
    const fromItemType = ItemTypes.find((item) => item.id === fromType && item.usage === fromUsage);

    if (!toItemType || !fromItemType) {
      return res.status(400).json({ error: 'Invalid item types' });
    }

    // Fetch user's items and perform the conversion logic here
    const fromItemData = userItems.find(
      (item) => item.type === fromItemType.type && item.usage === fromUsage && item.level === fromItemType.level
    );
    let toItemData = userItems.find(
      (item) => item.type === toItemType.type && item.usage === toUsage && item.level === toItemType.level
    );
    if (!toItemType || !fromItemType) {
      return res.status(400).json({ error: 'Invalid item types or usages' });
    }

    console.log('fromItemData', fromItemData);
    console.log('toItemData', toItemData);
    console.log('toItemType', toItemType);
  
    // If the target item does not exist, create it
    if (!toItemData) {
      toItemData = {
        type: toItemType.type,
        usage: toUsage,
        level: toItemType.level,
        quantity: 0, // Initialize with 0 quantity
      };
      userItems.push(toItemData); // Add it to user's items
    }

    // Ensure fromItemData exists before accessing its level
    if (!fromItemData) {
      return res.status(400).json({ error: 'Source item not found for user.' });
    }
    const isUpgrade = fromItemData.level < toItemData.level;

    // Ensure quantity is treated as a number for comparison
    if (!fromItemData || Number(fromItemData.quantity) < amount) {
      return res.status(400).json({ error: 'Not enough items to convert' });
    }

    // Calculate the base cost difference
    const baseCostDifference =
      (toItemType.cost - ((uModel?.priceBonus || 0) / 100) * toItemType.cost) -
      (fromItemType.cost - ((uModel?.priceBonus || 0) / 100) * fromItemType.cost);

    // Apply multiplier based on conversion direction
    const multiplier = isUpgrade ? 1 : 0.75;

    // Calculate the final cost
    let cost = Math.ceil(amount * baseCostDifference * multiplier);

    // For downgrades, cost represents a refund, so we make it positive
    if (!isUpgrade) {
      cost = Math.ceil(amount * baseCostDifference * multiplier);
      // Ensure the refund is a positive value
      if (cost < 0) cost = -cost;
    }

    // Check if user has enough gold for upgrade or handle refund for downgrade
    if (isUpgrade && user.gold < BigInt(cost)) {
      return res.status(400).json({ error: 'Not enough gold' });
    }

    // Deduct items and add/remove gold based on conversion direction
    // Store the original quantity of the target item before modification
    const previousToItemQuantity = toItemData ? Number(toItemData.quantity) : 0;

    // Ensure quantity is treated as a number before subtraction
    fromItemData.quantity = Number(fromItemData.quantity) - amount;
    if (toItemData) {
      // Ensure quantity is treated as a number before addition
      toItemData.quantity = previousToItemQuantity + amount; // Use stored previous quantity for calculation
    } else {
      // This case should technically not be hit if !toItemData check above creates it
      // But adding for safety, ensuring correct type.
      userItems.push({
        type: toItemType.type,
        usage: toUsage,
        level: toItemType.level,
        quantity: amount,
      });
    }
    if (isUpgrade) {
      user.gold = BigInt(user.gold) - BigInt(cost);
    } else {
      user.gold = BigInt(user.gold) + BigInt(cost);
    }

    const conversion = await prisma.$transaction(async (tx) => {
      // Pass the modified userItems array
      const { killingStrength, defenseStrength, newOffense, newDefense, newSpying, newSentry } =
        calculateUserStats(user, userItems, 'items');

      logDebug(`Converting items: ${fromItem} to ${toItem}, amount: ${amount}, cost: ${cost}`);
      await updateUserAndBankHistory(
        tx,
        user.id,
        user.gold,
        userItems, // Pass the typed array
        killingStrength,
        defenseStrength,
        newOffense,
        newDefense,
        newSpying,
        newSentry,
        {
          gold_amount: BigInt(cost),
          from_user_id: Number(userId),
          from_user_account_type: isUpgrade ? 'HAND' : 'BANK',
          to_user_id: Number(userId),
          to_user_account_type: isUpgrade ? 'BANK' : 'HAND',
          date_time: new Date().toISOString(),
          history_type: 'SALE',
          stats: {
            type: 'ARMORY_CONVERSION',
            fromItem: fromItem,
            toItem: toItem,
            amount: amount, // Log the numeric amount
            previousToItemQuantity: previousToItemQuantity, // Log the previous quantity
          },
        },
        'items'
      );
    });

    return res.status(200).json({
      message: 'Conversion successful',
      data: userItems, // Return the modified array
    });
  } catch (error) {
    logError(error);
    return res.status(500).json({ error: 'Failed to perform conversion' });
  }
};

export default withAuth(handler);
