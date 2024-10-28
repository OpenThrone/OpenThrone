import prisma from "@/lib/prisma";
import { ItemTypes } from "@/constants";
import { withAuth } from "@/middleware/auth";
import UserModel from "@/models/Users";
import { NextApiRequest, NextApiResponse } from "next";
import { updateUserAndBankHistory } from "@/services";
import { calculateUserStats } from "@/utils/utilities";

interface ConvertRequest {
  userId: string;
  fromItem: string;
  toItem: string;
  conversionAmount: string; // Amount in string format to handle locale-specific formats
  locale?: string; // Optional locale parameter
}


const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, fromItem, toItem, conversionAmount, locale }: ConvertRequest = req.body;

  if (!userId || !fromItem || !toItem || !conversionAmount) {
    return res.status(400).json({ error: 'Invalid input data' });
  }

  try {
    const user = await prisma.users.findUnique({ where: { id: Number(userId) } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const amount = Number(conversionAmount);
    const uModel = new UserModel(user );
    // Validate the amount
    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Invalid conversion amount' });
    }

    const [fromUsage, fromType] = fromItem.split('_');
    const [toUsage, toType] = toItem.split('_');

    const toItemType = ItemTypes.find((item) => item.id === toType && item.usage === toUsage );
    const fromItemType = ItemTypes.find((item) => item.id === fromType && item.usage === fromUsage );

    if (!toItemType || !fromItemType) {
      return res.status(400).json({ error: 'Invalid item types' });
    }

    // Fetch user's items and perform the conversion logic here
    const fromItemData = user.items.find(
      (item) => item.type === fromItemType.type && item.usage === fromUsage && item.level === fromItemType.level
    );
    let toItemData = user.items.find(
      (item) => item.type === toItemType.type && item.usage === toUsage && item.level === toItemType.level
    );

    // If the target item does not exist, create it
    if (!toItemData) {
      toItemData = {
        type: toItemType.type,
        usage: toItemType.usage,
        level: toItemType.level,
        quantity: 0, // Initialize with 0 quantity
      };
      user.items.push(toItemData); // Add it to user's items
    }

    if (!fromItemData || fromItemData.quantity < amount) {
      return res.status(400).json({ error: 'Not enough items to convert' });
    }
    const cost = BigInt(amount) * (BigInt(toItemType.cost - ((uModel?.priceBonus / 100) * toItemType.cost)) - BigInt(fromItemType.cost - ((uModel?.priceBonus / 100) * fromItemType.cost))) * (toItemType.level > fromItemType.level ? BigInt(1) : BigInt(75) / BigInt(100));

    if (user.gold < cost) {
      return res.status(400).json({ error: 'Not enough gold' });
    }

    // Deduct items and gold, add converted items
    fromItemData.quantity = parseInt(fromItemData.quantity) - amount;

    toItemData.quantity = parseInt(toItemData.quantity) + amount;

    user.gold -= BigInt(cost);

    const conversion = await prisma.$transaction(async (tx) => {
      const { killingStrength, defenseStrength, newOffense, newDefense, newSpying, newSentry } =
        calculateUserStats(user, JSON.parse(JSON.stringify(user.items)), 'items');

      await updateUserAndBankHistory(
        tx,
        user.id,
        BigInt(user.gold),
        JSON.parse(JSON.stringify(user.items)),
        killingStrength,
        defenseStrength,
        newOffense,
        newDefense,
        newSpying,
        newSentry,
        {
          gold_amount: BigInt(cost),
          from_user_id: Number(userId),
          from_user_account_type: 'HAND',
          to_user_id: Number(userId),
          to_user_account_type: 'BANK',
          date_time: new Date().toISOString(),
          history_type: 'SALE',
          stats: {
            type: 'ARMORY_CONVERSION',
            fromItem: fromItem,
            toItem: toItem,
            amount: conversionAmount,
          },
        },
        'items'
      );
    })

    return res.status(200).json({
      message: 'Conversion successful',
      data: user.items,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to perform conversion' });
  }
};

export default withAuth(handler);
