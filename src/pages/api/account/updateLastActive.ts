import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withAuth } from '@/middleware/auth';
import { AccountService } from '@/services';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

const UpdateLastActiveSchema = z
  .object({
    email: z.string().email().optional(),
    userId: z.number().int().positive().optional(),
    displayName: z.string().optional(),
  })
  .refine((data) => data.email || data.userId || data.displayName, {
    message:
      'At least one identifier (email, userId, or displayName) must be provided',
  });

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const validatedBody = UpdateLastActiveSchema.safeParse(req.body);
  if (!validatedBody.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: validatedBody.error.flatten().fieldErrors,
    });
  }

  try {
    const { email, userId, displayName } = validatedBody.data;
    const { session } = req;

    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await AccountService.updateLastActive({
      email,
      userId,
      displayName,
    });

    return res.status(200).json(result);
  } catch (error) {
    logError('Error updating last active:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

export default withAuth(handler);
