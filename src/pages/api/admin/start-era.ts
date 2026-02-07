import type { NextApiResponse } from 'next';

import { withApiGuard } from '@/middleware/apiGuard';
import { startNewEra } from '@/services/Era.service';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'admin',
  rateLimitProfile: 'admin',
});

async function handler(_req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    const newEra = await startNewEra();
    return res.status(200).json({ success: true, newEraId: newEra.id });
  } catch (error) {
    logError('Error starting new era:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default guardedHandler(handler);
