import { ItemTypes } from "@/constants";
import { withAuth } from "@/middleware/auth";
import UserModel from "@/models/Users";
import { NextApiRequest, NextApiResponse } from "next";

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
    const user = await prisma.users.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const amount = Number(conversionAmount);
    const uModel = new UserModel(user );
    // Validate the amount
    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Invalid conversion amount' });
    }

    // Split the fromItem and toItem strings to get the type, usage, and level
    const [fromUsage, fromType, fromLevelStr] = fromItem.split('_');
    const [toUsage, toType, toLevelStr] = toItem.split('_');
    const fromLevel = parseInt(fromLevelStr, 10);
    const toLevel = parseInt(toLevelStr, 10);

    // Fetch user's items and perform the conversion logic here
    const fromItemData = user.items.find(
      (item) => item.type === fromType && item.usage === fromUsage && item.level === fromLevel
    );
    const toItemData = user.items.find(
      (item) => item.type === toType && item.usage === toUsage && item.level === toLevel
    );

    if (!fromItemData || fromItemData.quantity < amount) {
      return res.status(400).json({ error: 'Not enough items to convert' });
    }

    const toItemType = ItemTypes.find((item) => item.type === toType && item.usage === toUsage && item.level === toLevel);
    const fromItemType = ItemTypes.find((item) => item.type === fromType && item.usage === fromUsage && item.level === fromLevel);

    // Example conversion logic
    const cost = BigInt(amount) * (BigInt(toItemType.cost - ((uModel?.priceBonus / 100) * toItemType.cost)) - BigInt(fromItemType.cost - ((uModel?.priceBonus / 100) * fromItemType.cost))) * (toItemType.level > fromItemType.level ? BigInt(1) : BigInt(0.75));

    console.log(`Converting ${amount} ${fromItem} to ${toItem} for ${cost} gold`)

    if (user.gold < cost) {
      return res.status(400).json({ error: 'Not enough gold' });
    }

    // Deduct items and gold, add converted items
    fromItemData.quantity -= amount;
    if (toItemData) {
      toItemData.quantity += amount;
    } else {
      user.items.push({ type: toType, usage: toUsage, level: toLevel, quantity: amount });
    }

    console.log(`User Gold before conversion: ${user.gold}`);
    user.gold -= BigInt(cost);
    console.log(`User Gold after conversion: ${user.gold}`);

    // Update user in the database
    await prisma.users.update({
      where: { id: userId },
      data: {
        gold: BigInt(user.gold),
        items: user.items,
      },
    });

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
