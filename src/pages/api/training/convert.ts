import { UnitTypes } from "@/constants";
import { withAuth } from "@/middleware/auth";
import UserModel from "@/models/Users";
import prisma from '@/lib/prisma';
import { NextApiRequest, NextApiResponse } from "next";

interface ConvertRequest {
  userId: string;
  fromUnit: string;
  toUnit: string;
  conversionAmount: string; // Amount in string format to handle locale-specific formats
}

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, fromUnit, toUnit, conversionAmount }: ConvertRequest = req.body;

  if (!userId || !fromUnit || !toUnit || !conversionAmount) {
    return res.status(400).json({ error: 'Invalid input data' });
  }

  try {
    const user = await prisma.users.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const amount = Number(conversionAmount);
    const uModel = new UserModel(user);
    // Validate the amount
    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Invalid conversion amount' });
    }

    // Split the fromUnit and toUnit strings to get the type and level
    const [fromType, fromLevelStr] = fromUnit.split('_');
    const [toType, toLevelStr] = toUnit.split('_');
    const fromLevel = parseInt(fromLevelStr, 10);
    const toLevel = parseInt(toLevelStr, 10);

    // Fetch user's units and perform the conversion logic here
    const fromUnitData = user.units.find(
      (unit) => unit.type === fromType && unit.level === fromLevel
    );
    const toUnitData = user.units.find(
      (unit) => unit.type === toType && unit.level === toLevel
    );

    if (!fromUnitData || fromUnitData.quantity < amount) {
      return res.status(400).json({ error: 'Not enough units to convert' });
    }

    const toUnitType = UnitTypes.find((unit) => unit.type === toType && unit.level === toLevel);
    const fromUnitType = UnitTypes.find((unit) => unit.type === fromType && unit.level === fromLevel);

    const cost = amount * ((toUnitType.cost - (((uModel.priceBonus || 0) / 100) * toUnitType.cost)) - (fromUnitType.cost - (((uModel.priceBonus || 0) / 100) * fromUnitType.cost))) * (toUnitType.level > fromUnitType.level ? 1 : 75 / 100);

    if (user.gold < BigInt(cost)) {
      return res.status(400).json({ error: 'Not enough gold' });
    }

    // Deduct units and gold, add converted units
    fromUnitData.quantity -= amount;
    if (toUnitData) {
      toUnitData.quantity += amount;
    } else {
      user.units.push({ type: toType, level: toLevel, quantity: amount });
    }

    console.log(`User Gold before conversion: ${user.gold}`);
    user.gold -= BigInt(cost);
    console.log(`User Gold after conversion: ${user.gold}`);

    // Update user in the database
    await prisma.users.update({
      where: { id: userId },
      data: {
        gold: BigInt(user.gold),
        units: user.units,
      },
    });

    return res.status(200).json({
      message: 'Conversion successful',
      data: user.units,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to perform conversion' });
  }
};

export default withAuth(handler);
