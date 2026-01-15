import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withAuth } from '@/middleware/auth';
import { convertUnits } from '@/services';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

// Zod schema for parsing "TYPE_LEVEL" strings
const UnitIdentifierSchema = z
  .string()
  .regex(/^[A-Z]+_\d+$/, {
    message: 'Unit identifier must be in TYPE_LEVEL format (e.g., ATTACK_1)',
  })
  .transform((val) => {
    const [type, levelStr] = val.split('_');
    return { type, level: parseInt(levelStr, 10) };
  })
  .refine((val) => !isNaN(val.level) && val.level > 0, {
    message: 'Invalid level in unit identifier',
  });

// Zod schema for the request body
const ConvertRequestSchema = z.object({
  userId: z.preprocess(
    (val) => (typeof val === 'string' ? parseInt(val, 10) : val),
    z.number().int(),
  ),
  fromUnit: UnitIdentifierSchema,
  toUnit: UnitIdentifierSchema,
  conversionAmount: z.preprocess(
    (val) =>
      typeof val === 'string' ? parseInt(val.replace(/,/g, ''), 10) : val, // Handle potential commas
    z
      .number()
      .int()
      .positive({ message: 'Conversion amount must be a positive integer.' }),
  ),
});

// Define response types
type ApiErrorResponse = { error: string; details?: any };
type ApiSuccessResponse = { message: string; data: any }; // Consider defining a more specific Unit type

// Define UnitProps interface (consistent with train/untrain)
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
      'Auth session missing in convert handler',
    );
    return res.status(401).json({ error: 'Authentication required.' });
  }

  // Validate request body
  const parseResult = ConvertRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body.',
      details: parseResult.error.flatten().fieldErrors,
    });
  }

  const { userId, fromUnit, toUnit, conversionAmount } = parseResult.data;

  // Authorization check
  if (userId !== req.session.user.id) {
    return res.status(403).json({ error: 'Forbidden: User ID mismatch' });
  }

  // Basic validation checks
  if (fromUnit.type !== toUnit.type) {
    return res.status(400).json({
      error:
        'Conversion must be within the same unit type (e.g., ATTACK to ATTACK).',
    });
  }
  if (fromUnit.level === toUnit.level) {
    return res
      .status(400)
      .json({ error: 'Cannot convert units to the same level.' });
  }

  try {
    const result = await convertUnits({
      userId,
      fromUnit,
      toUnit,
      conversionAmount,
    });

    return res
      .status(200)
      .json({ message: result.message, data: result.units });
  } catch (error: any) {
    const logContext = parseResult.success
      ? { userId: parseResult.data.userId, ...parseResult.data }
      : { body: req.body };
    logError(error, logContext, 'API Error: /api/training/convert');

    // Handle specific errors
    if (
      error.message?.startsWith('Not enough') ||
      error.message?.startsWith('Invalid unit definition') ||
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
      .json({ error: 'An unexpected error occurred while converting units.' });
  }
};

export default withAuth(handler);
