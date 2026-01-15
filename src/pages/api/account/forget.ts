import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withAuth } from '@/middleware/auth';
import { AccountService } from '@/services';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

const ForgetRequestSchema = z.object({
  password: z.string().min(1, { message: 'Password is required.' }),
  reason: z.string().optional(),
});

type ApiErrorResponse = { error: string; details?: any };
type ApiSuccessResponse = { message: string };

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
      'Auth session missing in forget account handler',
    );
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const parseResult = ForgetRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body.',
      details: parseResult.error.flatten().fieldErrors,
    });
  }

  const { password, reason } = parseResult.data;
  const userId = req.session.user.id;

  try {
    const result = await AccountService.forgetAccount(userId, {
      password,
      reason,
    });
    return res.status(200).json(result);
  } catch (error: any) {
    const logContext = { userId };
    logError(error, logContext, 'API Error: /api/account/forget');

    if (error.message === 'Invalid password.') {
      return res.status(401).json({ error: error.message });
    }
    if (error.message === 'User not found or password hash missing.') {
      return res
        .status(404)
        .json({ error: 'User not found or account issue.' });
    }
    return res.status(500).json({
      error: 'An unexpected error occurred while removing account data.',
    });
  }
};

export default withAuth(handler);
