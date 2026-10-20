import type { NextApiResponse } from 'next';

import { createImpersonationTicket } from '@/lib/impersonationTickets';
import { withApiGuard } from '@/middleware/apiGuard';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logAction } from '@/utils/auditLogger';
import { isAdmin } from '@/utils/authorization';

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'required',
});

/**
 * Ends an impersonation. When the admin who started it is still an admin, it
 * returns a single-use ticket the client redeems to switch back to that
 * admin's own account (#92); otherwise the client signs out. Both ids come
 * from the server-verified session, never from the request body.
 */
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const currentUserId = Number(req.session?.user?.id);
  const impersonatedBy = Number((req.session?.user as any)?.impersonatedBy);

  if (!impersonatedBy || Number.isNaN(impersonatedBy)) {
    return res.status(400).json({ error: 'No active impersonation session' });
  }

  await logAction(impersonatedBy, 'ADMIN_IMPERSONATE_STOP', getRequestIp(req), {
    targetUserId: currentUserId,
  });

  if (!(await isAdmin(impersonatedBy))) {
    return res.status(200).json({ returnTicket: null });
  }

  return res.status(200).json({
    returnTicket: createImpersonationTicket(
      impersonatedBy,
      currentUserId,
      'return',
    ),
  });
}

export default guardedHandler(handler);
