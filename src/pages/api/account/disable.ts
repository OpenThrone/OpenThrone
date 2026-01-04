import type { NextApiResponse } from 'next';
import type { AuthenticatedRequest } from '@/types/api';
import { z } from 'zod';
import { withAuth } from '@/middleware/auth';
import { logError } from '@/utils/logger';
import { AccountService } from '@/services';

const DisableRequestSchema = z.object({
  password: z.string().min(1, { message: 'Password is required.' }),
});

type ApiErrorResponse = { error: string; details?: any };
type ApiSuccessResponse = { message: string };

const handler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiSuccessResponse | ApiErrorResponse>
) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  if (!req.session?.user?.id) {
    logError(null, { requestPath: req.url }, 'Auth session missing in disable account handler');
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const parseResult = DisableRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body.',
      details: parseResult.error.flatten().fieldErrors,
    });
  }

  const { password } = parseResult.data;
  const userId = req.session.user.id;

  try {
    const result = await AccountService.disableAccount(userId, { password });
    return res.status(200).json(result);
  } catch (error: any) {
    const logContext = { userId };
    logError(error, logContext, 'API Error: /api/account/disable');

    if (error.message === 'Invalid password.') {
      return res.status(401).json({ error: error.message });
    }
    if (error.message === 'User not found or password hash missing.') {
      return res.status(404).json({ error: 'User not found or account issue.' });
    }
    return res.status(500).json({ error: 'An unexpected error occurred while disabling the account.' });
  }
};

export default withAuth(handler);
