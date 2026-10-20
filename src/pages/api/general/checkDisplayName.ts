import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { withCors } from '@/middleware/cors';
import { GeneralService } from '@/services';
import { DISPLAY_NAME_SEARCH_MIN_LENGTH } from '@/services/General.service';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

const DisplayNameSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  // Substring matches are for signed-in callers only (e.g. autocomplete).
  search: z.boolean().optional(),
});

async function handle(req: AuthenticatedRequest, res: NextApiResponse) {
  const parseResult = DisplayNameSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid or missing displayName',
      details: parseResult.error.flatten().fieldErrors,
    });
  }
  const { displayName, search } = parseResult.data;

  try {
    if (!search) {
      // Anonymous-safe: one exact-match boolean, no list of other players.
      const exists = await GeneralService.isDisplayNameTaken(displayName);
      return res.status(200).json({ exists, available: !exists });
    }

    if (!req.session?.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (displayName.length < DISPLAY_NAME_SEARCH_MIN_LENGTH) {
      return res.status(400).json({
        error: `Search needs at least ${DISPLAY_NAME_SEARCH_MIN_LENGTH} characters`,
      });
    }
    const result = await GeneralService.checkDisplayName(displayName);
    return res.status(200).json(result);
  } catch (error) {
    logError('Error checking display name:', error);
    return res.status(500).json({ error: 'Failed to check display name.' });
  }
}

export default withCors(
  withApiGuard({
    methods: ['POST'],
    authMode: 'optional',
    rateLimitProfile: 'auth',
  })(handle),
  { envVar: 'OT_AUTH_CORS_ORIGINS' },
);
