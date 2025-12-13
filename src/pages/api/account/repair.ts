import type { NextApiResponse } from 'next';
import type { AuthenticatedRequest } from '@/types/api';
import { z } from 'zod';
import { withAuth } from '@/middleware/auth';
import { logError } from '@/utils/logger';
import { AccountService } from '@/services';

// Zod schema for the request body
const RepairRequestSchema = z.object({
  repairPoints: z.preprocess(
    (val) => (typeof val === 'string' ? parseInt(val, 10) : val),
    z.number().int().positive({ message: 'Repair points must be a positive integer.' })
  ),
});

// Define response types
type ApiErrorResponse = { error: string; details?: any };
type ApiSuccessResponse = {
  message: string;
  data: {
    newGold: string; // Return gold as string for consistency with BigInt
    newFortHitpoints: number;
  };
};

const handler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiSuccessResponse | ApiErrorResponse>
) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  if (!req.session?.user?.id) {
    logError(null, { requestPath: req.url }, 'Auth session missing in repair handler');
    return res.status(401).json({ error: 'Authentication required.' });
  }

  // Validate request body
  const parseResult = RepairRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body.',
      details: parseResult.error.flatten().fieldErrors,
    });
  }

  const { repairPoints } = parseResult.data;
  const userId = req.session.user.id; // Get userId from session

  try {
    const result = await AccountService.repairFortification(userId, { repairPoints });

    return res.status(200).json(result);

  } catch (error: any) {
    const logContext = parseResult.success ? { userId, repairPoints: parseResult.data.repairPoints } : { userId, body: req.body };
    logError(error, logContext, 'API Error: /api/account/repair');

    // Handle specific errors thrown from the transaction
    if (error.message?.startsWith('Not enough gold') || error.message?.startsWith('Fortification is already at full health') || error.message?.startsWith('Invalid fortification level') || error.message?.startsWith('Calculated repair amount')) {
      return res.status(400).json({ error: error.message });
    }
     if (error.message === 'User not found within transaction') {
       return res.status(404).json({ error: 'User data inconsistency during transaction.' });
    }
    // Generic internal server error
    return res.status(500).json({ error: 'An unexpected error occurred while repairing fortification.' });
  }
}

export default withAuth(handler);