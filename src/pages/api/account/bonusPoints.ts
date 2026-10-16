import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { DefaultLevelBonus } from '@/constants/Bonuses';
import { withAuth } from '@/middleware/auth';
import { AccountService } from '@/services';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

// Define BonusType enum using Zod based on DefaultLevelBonus
const BonusTypeEnum = z.enum(
  DefaultLevelBonus.map((b) => b.type) as [string, ...string[]],
);
type BonusType = z.infer<typeof BonusTypeEnum>;

// Zod schema for the change queue item
const ChangeQueueItemSchema = z.object({
  change: z.number().int({ message: 'Change must be an integer.' }),
});

// Zod schema for the request body (changeQueue)
const BonusPointsRequestSchema = z.object({
  changeQueue: z.record(BonusTypeEnum, ChangeQueueItemSchema),
});

// Define response types
type ApiErrorResponse = { error: string; details?: any };
type ApiSuccessResponse = {
  message: string;
  data: { updatedBonusPoints: BonusPointsItem[] };
};

// Define BonusPointsItem type
interface BonusPointsItem {
  type: BonusType;
  level: number;
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
      'Auth session missing in bonusPoints handler',
    );
    return res.status(401).json({ error: 'Authentication required.' });
  }

  // Validate request body
  const parseResult = BonusPointsRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body.',
      details: parseResult.error.flatten().fieldErrors,
    });
  }

  const { changeQueue } = parseResult.data;
  const userId = req.session.user.id;

  try {
    const result = await AccountService.updateBonusPoints(userId, {
      changeQueue: changeQueue as Record<string, { change: number }>,
    });

    return res.status(200).json(result);
  } catch (error: any) {
    const logContext = { userId, changeQueue };
    logError(error, logContext, 'API Error: /api/account/bonusPoints');

    // Handle specific errors
    if (
      error.message?.startsWith('Not enough proficiency points') ||
      error.message?.startsWith('Cannot reduce level') ||
      error.message?.startsWith('Cannot increase level')
    ) {
      return res.status(400).json({ error: error.message });
    }
    // Generic error
    return res.status(500).json({
      error: 'An unexpected error occurred while updating bonus points.',
    });
  }
};

export default withAuth(handler);
