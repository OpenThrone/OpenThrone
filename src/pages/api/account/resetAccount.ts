import type { NextApiResponse } from 'next';
import type { AuthenticatedRequest } from '@/types/api';
import { z } from 'zod';
import { withAuth } from '@/middleware/auth';
import { logError } from '@/utils/logger';
import { AccountService } from '@/services';

// Zod schema for the request body
const ResetRequestSchema = z.object({
  password: z.string().min(1, { message: 'Password is required.' }),
});

// Define response types
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
    logError(null, { requestPath: req.url }, 'Auth session missing in resetAccount handler');
    return res.status(401).json({ error: 'Authentication required.' });
  }

  // Validate request body
  const parseResult = ResetRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body.',
      details: parseResult.error.flatten().fieldErrors,
    });
  }

  const { password } = parseResult.data;
  const userId = req.session.user.id;

  try {
    const result = await AccountService.resetAccount(userId, { password });

    return res.status(200).json(result);

  } catch (error: any) {
    const logContext = { userId }; // Don't log password
    logError(error, logContext, 'API Error: /api/account/resetAccount');

    // Handle specific errors
    if (error.message === 'Invalid password.') {
      return res.status(401).json({ error: error.message }); // Use 401 for invalid password
    }
    if (error.message === 'User not found or password hash missing.') {
       return res.status(404).json({ error: 'User not found or account issue.' });
    }
    // Generic error
    return res.status(500).json({ error: 'An unexpected error occurred while resetting the account.' });
  }
}

export default withAuth(handler);
