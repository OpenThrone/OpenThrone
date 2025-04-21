import type { NextApiResponse } from 'next';
import type { AuthenticatedRequest } from '@/types/api'; // Import AuthenticatedRequest
import { z } from 'zod'; // Added Zod import
import { ItemTypes } from '@/constants';
import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import UserModel from '@/models/Users';
import { updateUserAndBankHistory } from '@/services';
import { calculateUserStats } from '@/utils/utilities';
import { logError } from '@/utils/logger'; // Added logError import

// Define Zod schema for request body validation
const UnequipItemSchema = z.object({
  type: z.string(),
  usage: z.string(),
  level: z.number().int().min(1),
  // Ensure quantity is parsed as a number and is positive
  quantity: z.preprocess(
    (val) => (typeof val === 'string' ? parseInt(val, 10) : val),
    z.number().int().positive({ message: 'Quantity must be a positive integer.' })
  ),
});

const UnequipRequestSchema = z.object({
  // Ensure userId is parsed as a number
  userId: z.preprocess(
    (val) => (typeof val === 'string' ? parseInt(val, 10) : val),
    z.number().int()
  ),
  items: z.array(UnequipItemSchema).min(1, { message: 'At least one item must be provided.' }),
});

// Define response types
type ApiErrorResponse = { error: string; details?: any };
type ApiSuccessResponse = { message: string; data: any }; // Consider defining a more specific data type

// Define EquipmentProps interface (matching equip.ts for consistency)
interface EquipmentProps {
  type: string;
  usage: string;
  level: number;
  quantity: number | string; // Keep string for DB compatibility if needed
}

const handler = async (
  req: AuthenticatedRequest, // Use AuthenticatedRequest
  res: NextApiResponse<ApiSuccessResponse | ApiErrorResponse>,
) => {
  // Check method first
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  // Session check
  if (!req.session?.user?.id) {
    logError(null, { requestPath: req.url }, 'Auth session missing in unequip handler');
    return res.status(401).json({ error: 'Authentication required.' });
  }

  // Validate request body using Zod
  const parseResult = UnequipRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body.',
      details: parseResult.error.flatten().fieldErrors,
    });
  }

  // Use validated data
  const { userId, items: itemsToUnequip } = parseResult.data;

  // Authorization check
  if (userId !== req.session.user.id) {
    return res.status(403).json({ error: 'Forbidden: User ID mismatch' });
  }

  try {
    // Transaction for atomicity
    const updatedItemsResult = await prisma.$transaction(async (tx) => {
      // Fetch user within transaction for consistency
      const user = await tx.users.findUnique({
        where: { id: userId },
        select: { items: true, gold: true }, // Select necessary fields
      });

      if (!user) {
        // Should not happen if auth check passed, but safety measure
        throw new Error('User not found within transaction');
      }

      const uModel = new UserModel(user); // Use user data fetched within transaction
      let totalRefund = 0;

      // Use a Map for efficient lookup and update of user's items
      const userItemsMap = new Map<string, EquipmentProps>();
      (user.items as EquipmentProps[]).forEach(item => {
        // Ensure quantity is number for calculations
        const quantity = typeof item.quantity === 'string' ? parseInt(item.quantity, 10) : item.quantity;
        if (isNaN(quantity)) {
            throw new Error(`Invalid quantity format for item ${item.type}-${item.usage}-${item.level} in user inventory.`);
        }
        userItemsMap.set(`${item.type}-${item.usage}-${item.level}`, { ...item, quantity });
      });


      // Validate and process items to unequip
      for (const itemData of itemsToUnequip) {
        const key = `${itemData.type}-${itemData.usage}-${itemData.level}`;
        const itemDefinition = ItemTypes.find(w => w.type === itemData.type && w.usage === itemData.usage && w.level === itemData.level);

        if (!itemDefinition) {
          throw new Error(`Invalid item definition: Type ${itemData.type}, Level ${itemData.level}, Usage ${itemData.usage}`);
        }

        const userItem = userItemsMap.get(key);

        if (!userItem || (userItem.quantity as number) < itemData.quantity) {
           throw new Error(`Not enough ${itemDefinition.name} (Level ${itemDefinition.level}) to unequip. Required: ${itemData.quantity}, Available: ${userItem?.quantity ?? 0}`);
        }

        // Update quantity (guaranteed to be number here)
        (userItem.quantity as number) -= itemData.quantity;

        // Calculate refund for this item
        totalRefund += Math.floor(
          (itemDefinition.cost - ((uModel.priceBonus ?? 0) / 100) * itemDefinition.cost) * itemData.quantity * 0.75 // 75% refund
        );
      }

      // Filter out items with zero quantity
      const finalItemsArray = Array.from(userItemsMap.values()).filter(item => (item.quantity as number) > 0);

      // Calculate new stats based on the final items array
      const { killingStrength, defenseStrength, newOffense, newDefense, newSpying, newSentry } =
        calculateUserStats(user, finalItemsArray, 'items'); // Pass user fetched in tx

      // Update user and bank history
      await updateUserAndBankHistory(
        tx,
        userId,
        BigInt(user.gold) + BigInt(totalRefund), // Use gold fetched within transaction
        finalItemsArray, // Pass the final array
        killingStrength,
        defenseStrength,
        newOffense,
        newDefense,
        newSpying,
        newSentry,
        {
          gold_amount: BigInt(totalRefund),
          from_user_id: 0, // Bank/System
          from_user_account_type: 'BANK',
          to_user_id: userId,
          to_user_account_type: 'HAND',
          date_time: new Date().toISOString(),
          history_type: 'SALE', // Or 'UNEQUIP'? Clarify semantics
          stats: {
            type: 'ARMORY_UNEQUIP',
            items: itemsToUnequip, // Log the items requested to be unequipped
          },
        },
        'items' // Context
      );

      return finalItemsArray; // Return the result from the transaction
    });

    return res.status(200).json({
      message: 'Items unequipped successfully!',
      data: updatedItemsResult, // Return the updated items from the transaction
    });

  } catch (error: any) {
    const logContext = parseResult.success ? { userId: parseResult.data.userId, items: parseResult.data.items } : { body: req.body };
    logError(error, logContext, 'API Error: /api/armory/unequip');

    // Check for specific errors thrown from the transaction or validation
    if (error.message?.startsWith('Not enough') || error.message?.startsWith('Invalid item definition') || error.message?.startsWith('Invalid quantity format')) {
      return res.status(400).json({ error: error.message });
    }
     if (error.message === 'User not found within transaction') {
       return res.status(404).json({ error: 'User data inconsistency during transaction.' });
    }
    // Generic internal server error
    return res.status(500).json({ error: 'An unexpected error occurred while unequipping items.' });
  }
}

export default withAuth(handler);