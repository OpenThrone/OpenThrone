import type { NextApiResponse } from 'next';
import type { AuthenticatedRequest } from '@/types/api'; // Import AuthenticatedRequest
import { z } from 'zod'; // Added Zod import
import { withAuth } from '@/middleware/auth';
import { ArmoryService, ArmoryItem } from '@/services';
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
    const result = await ArmoryService.unequipItems({ userId, items: itemsToUnequip as ArmoryItem[] });

    return res.status(200).json({
      message: result.message,
      data: result.data,
    });

  } catch (error: any) {
    logError(error, { userId, items: itemsToUnequip }, 'API Error: /api/armory/unequip');

    // Check for specific errors
    if (error.message?.startsWith('Not enough') || error.message?.startsWith('Invalid item')) {
      return res.status(400).json({ error: error.message });
    }
    if (error.message === 'User not found') {
      return res.status(404).json({ error: 'User not found' });
    }
    // Generic internal server error
    return res.status(500).json({ error: 'An unexpected error occurred while unequipping items.' });
  }
}

export default withAuth(handler);