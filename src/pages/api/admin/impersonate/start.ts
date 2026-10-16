import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { createImpersonationTicket } from '@/lib/impersonationTickets';
import prisma from '@/lib/prisma';
import { withApiGuard } from '@/middleware/apiGuard';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logAction, logActionStrict } from '@/utils/auditLogger';
import { getStaffRank, isImpersonatedSession } from '@/utils/authorization';
import { logError } from '@/utils/logger';

const StartImpersonationSchema = z.object({
  targetUserId: z.number().int().positive(),
});

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'admin',
  rateLimitProfile: 'admin',
  bodySchema: StartImpersonationSchema,
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { body: z.infer<typeof StartImpersonationSchema> },
) {
  const adminUserId = Number(req.session?.user?.id);
  const ip = getRequestIp(req);

  // Impersonation cannot be chained from an impersonated session.
  if (isImpersonatedSession(req.session)) {
    return res
      .status(403)
      .json({ error: 'End the current impersonation session first' });
  }

  const target = await prisma.users.findUnique({
    where: { id: context.body.targetUserId },
    select: { id: true, email: true, display_name: true },
  });

  if (!target) {
    return res.status(404).json({ error: 'Target user not found' });
  }

  if (target.id === adminUserId) {
    return res.status(400).json({ error: 'You cannot impersonate yourself' });
  }

  // Impersonating staff would hand over their roles and grants.
  if ((await getStaffRank(target.id)) > 0) {
    await logAction(adminUserId, 'ADMIN_IMPERSONATE_DENIED', ip, {
      targetUserId: target.id,
      reason: 'staff_target',
    });
    return res
      .status(403)
      .json({ error: 'Staff accounts cannot be impersonated' });
  }

  // No ticket is issued unless the request is on record.
  try {
    await logActionStrict({
      userId: adminUserId,
      action: 'ADMIN_IMPERSONATE_TICKET_ISSUED',
      ip,
      targetUserId: target.id,
    });
  } catch (error) {
    logError('Impersonation refused: audit write failed', error);
    return res.status(500).json({ error: 'Failed to start impersonation' });
  }

  const ticket = createImpersonationTicket(adminUserId, target.id);

  return res.status(200).json({
    target,
    signInPayload: {
      impersonateUserId: target.id,
      impersonationTicket: ticket,
    },
    message:
      'Use signIn("credentials", { impersonateUserId, impersonationTicket }) while authenticated as admin.',
  });
}

export default guardedHandler(handler);
