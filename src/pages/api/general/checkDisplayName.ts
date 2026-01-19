import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { withCors } from '@/middleware/cors';
import { GeneralService } from '@/services';
import { logError } from '@/utils/logger';

async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    const DisplayNameSchema = z.object({ displayName: z.string().min(1) });
    const parseResult = DisplayNameSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid or missing displayName',
        details: parseResult.error.flatten().fieldErrors,
      });
    }
    const { displayName } = parseResult.data;

    try {
      const result = await GeneralService.checkDisplayName(displayName);
      return res.status(200).json(result);
    } catch (error) {
      logError('Error checking display name:', error);
      return res.status(500).json({ error: 'Failed to check display name.' });
    }
  } else {
    return res.status(405).json({ error: 'Method not allowed.' });
  }
}

export default withCors(handle, { envVar: 'OT_AUTH_CORS_ORIGINS' });
