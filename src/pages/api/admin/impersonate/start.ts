import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { createImpersonationTicket } from '@/lib/impersonationTickets';
import prisma from '@/lib/prisma';
import { withApiGuard } from '@/middleware/apiGuard';
import type { AuthenticatedRequest } from '@/types/api';

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
  const target = await prisma.users.findUnique({
    where: { id: context.body.targetUserId },
    select: { id: true, email: true, display_name: true },
  });

  if (!target) {
    return res.status(404).json({ error: 'Target user not found' });
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
