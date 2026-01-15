import type { NextApiResponse } from 'next'; // Removed NextApiRequest
import { z } from 'zod';

import { withAuth } from '@/middleware/auth';
import type { ArmoryItem } from '@/services';
import { ArmoryService } from '@/services';
import type { AuthenticatedRequest } from '@/types/api'; // Import AuthenticatedRequest
import { logError } from '@/utils/logger'; // Added logError import

// Define Zod schema for request body validation
const EquipItemSchema = z.object({
  type: z.string(),
  usage: z.string(),
  level: z.number().int().min(1),
  // Ensure quantity is parsed as a number and is positive
  quantity: z.preprocess(
    (val) => (typeof val === 'string' ? parseInt(val, 10) : val),
    z
      .number()
      .int()
      .positive({ message: 'Quantity must be a positive integer.' }),
  ),
});

const EquipRequestSchema = z.object({
  // Ensure userId is parsed as a number
  userId: z.preprocess(
    (val) => (typeof val === 'string' ? parseInt(val, 10) : val),
    z.number().int(),
  ),
  items: z
    .array(EquipItemSchema)
    .min(1, { message: 'At least one item must be provided.' }),
});

// Define response types
type ApiErrorResponse = { error: string; details?: any }; // Added optional details
type ApiSuccessResponse = { message: string; data: any }; // Consider defining a more specific data type

const handler = async (
  req: AuthenticatedRequest, // Use AuthenticatedRequest type
  res: NextApiResponse<ApiSuccessResponse | ApiErrorResponse>,
) => {
  // Session is now guaranteed by withAuth (unless overridden, which isn't the case here)
  // The check below ensures session and user exist, satisfying TypeScript
  if (!req.session?.user?.id) {
    // This should technically be caught by withAuth, but belt-and-suspenders
    logError(
      null,
      { requestPath: req.url },
      'Auth session missing in equip handler',
    );
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

  // Normalize the session user id once (guards for string vs number) and use it for authorization
  const sessionUserId = req.session?.user?.id;
  const normalizedSessionUserId =
    typeof sessionUserId === 'string'
      ? parseInt(sessionUserId, 10)
      : Number(sessionUserId ?? 0);

  // Authorization check using validated userId against the normalized session id
  if (userId !== normalizedSessionUserId) {
    return res.status(403).json({ error: 'Forbidden: User ID mismatch' }); // Use 403 for Forbidden
  }

  try {
    const result = await ArmoryService.equipItems({
      userId,
      items: itemsToEquip as ArmoryItem[],
    });

    return res.status(200).json({
      message: result.message,
      data: result.data,
    });
  } catch (error: any) {
    logError(
      error,
      { userId, items: itemsToEquip },
      'API Error: /api/armory/equip',
    );

    // Check for specific errors
    if (error.message?.startsWith('Not enough gold')) {
      return res.status(400).json({ error: error.message });
    }
    if (error.message === 'User not found') {
      return res.status(404).json({ error: 'User not found' });
    }
    // Generic internal server error for other cases
    return res
      .status(500)
      .json({ error: 'An unexpected error occurred while equipping items.' });
  }
};

export default withAuth(handler);
