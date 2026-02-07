import type { NextApiResponse } from 'next';

import { withApiGuard } from '@/middleware/apiGuard';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logAction } from '@/utils/auditLogger';

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'required',
});

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const currentUserId = Number(req.session?.user?.id);
  const impersonatedBy = Number((req.session?.user as any)?.impersonatedBy);

  if (!impersonatedBy || Number.isNaN(impersonatedBy)) {
    return res.status(400).json({ error: 'No active impersonation session' });
  }

  await logAction(impersonatedBy, 'ADMIN_IMPERSONATE_STOP', getRequestIp(req), {
    targetUserId: currentUserId,
  });

  return res.status(200).json({
    message:
      'Impersonation stop recorded. Sign out to end impersonated session.',
  });
}

export default guardedHandler(handler);
