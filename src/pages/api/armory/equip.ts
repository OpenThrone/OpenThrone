import type { NextApiResponse } from 'next'; // Removed NextApiRequest
import type { AuthenticatedRequest } from '@/types/api'; // Import AuthenticatedRequest
import { z } from 'zod';
import { ItemTypes } from '@/constants';
import prisma from '@/lib/prisma';
import UserModel from '@/models/Users';
import { withAuth } from '@/middleware/auth';
import { updateUserAndBankHistory } from '@/services';
import { calculateUserStats } from '@/utils/utilities';
import { logError } from '@/utils/logger'; // Added logError import

// Define Zod schema for request body validation
const EquipItemSchema = z.object({
  type: z.string(),
  usage: z.string(),
  level: z.number().int().min(1),
  // Ensure quantity is parsed as a number and is positive
  quantity: z.preprocess(
    (val) => (typeof val === 'string' ? parseInt(val, 10) : val),
    z.number().int().positive({ message: 'Quantity must be a positive integer.' })
  ),
});

const EquipRequestSchema = z.object({
  // Ensure userId is parsed as a number
  userId: z.preprocess(
    (val) => (typeof val === 'string' ? parseInt(val, 10) : val),
    z.number().int()
  ),
  items: z.array(EquipItemSchema).min(1, { message: 'At least one item must be provided.' }),
});

// Define response types
type ApiErrorResponse = { error: string; details?: any }; // Added optional details
type ApiSuccessResponse = { message: string; data: any }; // Consider defining a more specific data type

// Define the existing EquipmentProps interface (can be reused or replaced by Zod inferred type if preferred)
interface EquipmentProps {
  type: string;
  usage: string;
  level: number;
  quantity: number | string; // Keep string for DB compatibility if needed, Zod handles parsing
}


const handler = async (
  req: AuthenticatedRequest, // Use AuthenticatedRequest type
  res: NextApiResponse<ApiSuccessResponse | ApiErrorResponse>,
) => {
  // Session is now guaranteed by withAuth (unless overridden, which isn't the case here)
  // The check below ensures session and user exist, satisfying TypeScript
  if (!req.session?.user?.id) {
    // This should technically be caught by withAuth, but belt-and-suspenders
    logError(null, { requestPath: req.url }, 'Auth session missing in equip handler');
    return res.status(401).json({ error: 'Authentication required.' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` }); // Standardized method error
  }

  // Validate request body using Zod
  const parseResult = EquipRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    // Provide detailed validation errors
    return res.status(400).json({
      error: 'Invalid request body.',
      details: parseResult.error.flatten().fieldErrors,
    });
  }

  // Use validated data
  const { userId, items: itemsToEquip } = parseResult.data;

  // Authorization check using validated userId
  if (userId !== req.session.user.id) {
    return res.status(403).json({ error: 'Forbidden: User ID mismatch' }); // Use 403 for Forbidden
  }

  // Removed old manual validation

  try {
    // Fetch user outside transaction for initial checks, but re-fetch inside for consistency
    const user = await prisma.users.findUnique({ where: { id: req.session.user.id } });
    if (!user) {
      // This case should ideally not happen if session/auth middleware is working
      return res.status(404).json({ error: 'User not found' });
    }

    // Removed duplicated uModel and totalCost initialization
    const uModel = new UserModel(user);
    let totalCost = 0;

    // Validate items against constants and calculate total cost
    // itemsToEquip is now guaranteed to be the correct type by Zod
    for (const itemData of itemsToEquip) {
      const itemDefinition = ItemTypes.find(
        (w) =>
          w.type === itemData.type &&
          w.level === itemData.level &&
          w.usage === itemData.usage,
      );

      if (!itemDefinition) {
        return res.status(400).json({
          error: `Invalid item configuration: Type ${itemData.type}, Level ${itemData.level}, Usage ${itemData.usage}`,
        });
      }
      // Zod already ensures quantity is positive integer
      totalCost += Math.floor(
        (itemDefinition.cost - ((uModel.priceBonus ?? 0) / 100) * itemDefinition.cost) * itemData.quantity
      );
    }

    // Check if the user has enough gold (convert BigInt for comparison)
    if (user.gold < BigInt(totalCost)) {
      return res.status(400).json({ error: `Not enough gold. Required: ${totalCost}, Available: ${user.gold}` });
    }

    // Perform database operations within a transaction
    const updatedItemsResult = await prisma.$transaction(async (tx) => {
      // Fetch the user again *within* the transaction for locking/consistency
      const currentUser = await tx.users.findUnique({
        where: { id: userId },
        select: { items: true, gold: true }, // Select only necessary fields
      });

      if (!currentUser) {
        // Should not happen if initial check passed, but good safety measure
        throw new Error('User not found within transaction');
      }

      // Recalculate cost based on potentially updated price bonus if needed, or use previous totalCost
      // Re-check gold within transaction to prevent race conditions
      if (currentUser.gold < BigInt(totalCost)) {
        throw new Error(`Not enough gold. Required: ${totalCost}, Available: ${currentUser.gold}`);
      }

      // Use a Map for efficient updates of existing items
      const currentItemsMap = new Map<string, EquipmentProps>();
      (currentUser.items as EquipmentProps[]).forEach(item => {
        const key = `${item.type}-${item.usage}-${item.level}`;
        currentItemsMap.set(key, item);
      });

      // Update quantities or add new items
      itemsToEquip.forEach(itemData => {
        const key = `${itemData.type}-${itemData.usage}-${itemData.level}`;
        const existingItem = currentItemsMap.get(key);
        if (existingItem) {
          // Ensure quantity is treated as number
          const currentQuantity = typeof existingItem.quantity === 'string' ? parseInt(existingItem.quantity, 10) : existingItem.quantity;
          existingItem.quantity = currentQuantity + itemData.quantity;
        } else {
          // Explicitly create the EquipmentProps object to satisfy TypeScript
          currentItemsMap.set(key, {
            type: itemData.type,
            usage: itemData.usage,
            level: itemData.level,
            quantity: itemData.quantity,
          });
        }
      });

      const updatedItemsArray = Array.from(currentItemsMap.values());

      // Calculate new stats based on the updated items array
      // Pass the original full user object to calculateUserStats if it needs more than items
      const { killingStrength, defenseStrength, newOffense, newDefense, newSpying, newSentry } =
        calculateUserStats(user, updatedItemsArray, 'items');

      // Update user and bank history
      await updateUserAndBankHistory(
        tx,
        userId,
        currentUser.gold - BigInt(totalCost), // Use gold fetched within transaction
        updatedItemsArray, // Pass the final array
        killingStrength,
        defenseStrength,
        newOffense,
        newDefense,
        newSpying,
        newSentry,
        {
          gold_amount: BigInt(totalCost),
          from_user_id: userId,
          from_user_account_type: 'HAND',
          to_user_id: 0, // 0 is the bank
          to_user_account_type: 'BANK',
          date_time: new Date().toISOString(),
          history_type: 'SALE', // Or 'EQUIP'? Clarify semantics
          stats: {
            type: 'ARMORY_EQUIP',
            items: itemsToEquip, // Log the items that were requested to be equipped
          },
        },
        'items' // Context for updateUserAndBankHistory
      );

      return updatedItemsArray; // Return the result from the transaction
    });

    return res.status(200).json({
      message: 'Items equipped successfully',
      data: updatedItemsResult, // Return the updated items from the transaction
    });

  } catch (error: any) {
    // Log with validated data if available, otherwise original body
    const logContext = parseResult.success ? { userId: parseResult.data.userId, items: parseResult.data.items } : { body: req.body };
    logError(error, logContext, 'API Error: /api/armory/equip');

    // Check for specific errors thrown from the transaction
    if (error.message?.startsWith('Not enough gold')) { // Added optional chaining
      return res.status(400).json({ error: error.message });
    }
    if (error.message === 'User not found within transaction') {
       return res.status(404).json({ error: 'User data inconsistency during transaction.' });
    }
    // Generic internal server error for other cases
    return res.status(500).json({ error: 'An unexpected error occurred while equipping items.' }); // Slightly improved generic message
  }
}

export default withAuth(handler);