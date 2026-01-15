import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withAuth } from '@/middleware/auth';
import { trainUnits } from '@/services';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

// Zod schema for individual unit training request
const TrainUnitSchema = z.object({
  type: z.string(),
  level: z.number().int().min(1),
  quantity: z.preprocess(
    (val) => (typeof val === 'string' ? parseInt(val, 10) : val),
    z
      .number()
      .int()
      .positive({ message: 'Unit quantity must be a positive integer.' }),
  ),
});

// Zod schema for the entire request body
const TrainRequestSchema = z.object({
  userId: z.preprocess(
    (val) => (typeof val === 'string' ? parseInt(val, 10) : val),
    z.number().int(),
  ),
  units: z.array(TrainUnitSchema).min(1, {
    message: 'At least one unit type must be provided for training.',
  }),
});

// Define response types
type ApiErrorResponse = { error: string; details?: any };
type ApiSuccessResponse = { message: string; data: any }; // Consider defining a more specific Unit type

// Define UnitProps interface (similar to EquipmentProps)
interface _UnitProps {
  type: string;
  level: number;
  quantity: number | string; // Keep string for DB compatibility if needed
}

const handler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiSuccessResponse | ApiErrorResponse>,
) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  if (!req.session?.user?.id) {
    logError(
      null,
      { requestPath: req.url },
      'Auth session missing in train handler',
    );
    return res.status(401).json({ error: 'Authentication required.' });
  }

  // Validate request body
  const parseResult = TrainRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body.',
      details: parseResult.error.flatten().fieldErrors,
    });
  }

  const { userId, units: unitsToTrain } = parseResult.data;

  // Authorization check
  if (userId !== req.session.user.id) {
    return res.status(403).json({ error: 'Forbidden: User ID mismatch' });
  }

  try {
    const result = await trainUnits({
      userId,
      units: unitsToTrain as {
        type: string;
        level: number;
        quantity: number;
      }[],
    });

    return res
      .status(200)
      .json({ message: result.message, data: result.units });
  } catch (error: any) {
    const logContext = parseResult.success
      ? { userId: parseResult.data.userId, units: parseResult.data.units }
      : { body: req.body };
    logError(error, logContext, 'API Error: /api/training/train');

    // Handle specific errors
    if (
      error.message?.startsWith('Not enough gold') ||
      error.message?.startsWith('Not enough citizens') ||
      error.message?.startsWith('Invalid units quantity') ||
      error.message?.startsWith('Invalid quantity format')
    ) {
      return res.status(400).json({ error: error.message });
    }
    if (error.message === 'User not found within transaction') {
      return res
        .status(404)
        .json({ error: 'User data inconsistency during transaction.' });
    }
    // Generic error
    return res
      .status(500)
      .json({ error: 'An unexpected error occurred while training units.' });
  }
};

export default withAuth(handler);
