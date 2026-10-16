import type { NextApiResponse } from 'next';

import { withApiGuard } from '@/middleware/apiGuard';
import { startNewEra } from '@/services/Era.service';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logAction, logActionStrict } from '@/utils/auditLogger';
import { parseStartEraBody } from '@/utils/eraStartSettings';
import { logError } from '@/utils/logger';

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'admin',
  rateLimitProfile: 'admin',
});

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const parsed = parseStartEraBody(req.body);
  if (parsed.ok === false) {
    return res.status(400).json({ error: parsed.error });
  }

  const adminUserId = Number(req.session?.user?.id);
  const ip = getRequestIp(req);

  // An era start resets every account, so it never runs off the record.
  try {
    await logActionStrict({
      userId: adminUserId,
      action: 'ADMIN_ERA_START_REQUESTED',
      ip,
      details: { route: 'start-era' },
    });
  } catch (error) {
    logError('Era start refused: audit write failed', error);
    return res.status(500).json({ error: 'Internal server error' });
  }

  try {
    const newEra = await startNewEra(parsed.settings);
    await logAction(adminUserId, 'ADMIN_ERA_START', ip, {
      newEraId: newEra.id,
    });
    return res.status(200).json({ success: true, newEraId: newEra.id });
  } catch (error) {
    logError('Error starting new era:', error);
    await logAction(adminUserId, 'ADMIN_ERA_START_FAILED', ip, {});
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default guardedHandler(handler);
