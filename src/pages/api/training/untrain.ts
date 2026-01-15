import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withAuth } from '@/middleware/auth';
import { untrainUnits } from '@/services';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

// Zod schema for individual unit untraining request
const UntrainUnitSchema = z.object({
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
const UntrainRequestSchema = z.object({
  userId: z.preprocess(
    (val) => (typeof val === 'string' ? parseInt(val, 10) : val),
    z.number().int(),
  ),
  units: z.array(UntrainUnitSchema).min(1, {
    message: 'At least one unit type must be provided for untraining.',
  }),
});

// Define response types
type ApiErrorResponse = { error: string; details?: any };
type ApiSuccessResponse = { message: string; data: any }; // Consider defining a more specific Unit type

// Define UnitProps interface (consistent with train.ts)
interface UnitProps {
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
      'Auth session missing in untrain handler',
    );
    return res.status(401).json({ error: 'Authentication required.' });
  }

  // Validate request body
  const parseResult = UntrainRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body.',
      details: parseResult.error.flatten().fieldErrors,
    });
  }

  const { userId, units: unitsToUntrain } = parseResult.data;

  // Authorization check
  if (userId !== req.session.user.id) {
    return res.status(403).json({ error: 'Forbidden: User ID mismatch' });
  }

  try {
    const result = await untrainUnits({
      userId,
      units: unitsToUntrain as {
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
    logError(error, logContext, 'API Error: /api/training/untrain');

    // Handle specific errors
    if (
      error.message?.startsWith('Not enough') ||
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
      .json({ error: 'An unexpected error occurred while untraining units.' });
  }
};

export default withAuth(handler);
