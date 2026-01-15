// pages/api/armory/convert.ts
import type { NextApiResponse } from 'next'; // Removed NextApiRequest
import { z } from 'zod';

import { withAuth } from '@/middleware/auth';
import { ArmoryService } from '@/services';
import type { AuthenticatedRequest } from '@/types/api'; // Import AuthenticatedRequest
import { logError } from '@/utils/logger';

const ConvertSchema = z.object({
  userId: z.number().int(),
  fromItem: z.string(),
  toItem: z.string(),
  conversionAmount: z.number().int(),
});

const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  // Use AuthenticatedRequest
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const validatedBody = ConvertSchema.safeParse(req.body);
  if (!validatedBody.success) {
    return res.status(400).json({
      error: 'Invalid input data',
      details: validatedBody.error.flatten().fieldErrors,
    });
  }

  const { userId, fromItem, toItem, conversionAmount } = validatedBody.data;

  if (userId !== req.session.user.id)
    return res.status(401).json({ error: 'Unauthorized' });

  try {
    const result = await ArmoryService.convertItems({
      userId: Number(userId),
      fromItem,
      toItem,
      conversionAmount: Number(conversionAmount),
    });

    return res.status(200).json({
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    logError(error);
    return res.status(500).json({ error: 'Failed to perform conversion' });
  }
};

export default withAuth(handler);
