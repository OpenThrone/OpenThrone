import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { withApiGuard } from '@/middleware/apiGuard';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logAction, logActionStrict } from '@/utils/auditLogger';
import { checkStaffTargetAction } from '@/utils/authorization';
import { logError } from '@/utils/logger';

const AdminVacationSchema = z.object({
  userId: z.number().int(),
  action: z.enum(['start', 'end']),
});

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'admin',
  rateLimitProfile: 'admin',
  bodySchema: AdminVacationSchema,
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { body: z.infer<typeof AdminVacationSchema> },
) {
  const sessionUserId = req.session?.user?.id;
  if (!sessionUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { userId, action } = context.body;
  if (action !== 'start' && action !== 'end') {
    return res.status(400).json({ error: 'Invalid action' });
  }

  const adminUserId = Number(sessionUserId);
  const ip = getRequestIp(req);

  // Vacation blocks login, so it is refused on yourself and on administrators.
  const denial = await checkStaffTargetAction(adminUserId, userId);
  if (denial) {
    await logAction(adminUserId, 'ADMIN_VACATION_DENIED', ip, {
      targetUserId: userId,
      action,
      reason: denial.reason,
    });
    return res.status(denial.status).json({ error: denial.error });
  }

  try {
    const now = new Date();
    const vacationEndDate = new Date();
    vacationEndDate.setDate(now.getDate() + 14); // 2 weeks

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      const currentDenial = await checkStaffTargetAction(adminUserId, userId, {
        client: tx,
      });
      if (currentDenial) throw new Error(currentDenial.error);
      const latestStatus = await tx.accountStatusHistory.findFirst({
        where: { user_id: userId, start_date: { lte: now } },
        orderBy: [{ start_date: 'desc' }, { id: 'desc' }],
        select: { status: true, end_date: true },
      });
      if (
        latestStatus &&
        ['BANNED', 'SUSPENDED', 'CLOSED'].includes(latestStatus.status) &&
        (!latestStatus.end_date || latestStatus.end_date > now)
      ) {
        throw new Error('Vacation cannot override an account restriction');
      }
      if (action === 'end' && latestStatus?.status !== 'VACATION') {
        throw new Error('Account is not in vacation mode');
      }
      if (action === 'start') {
        await tx.accountStatusHistory.create({
          data: {
            user_id: userId,
            status: 'VACATION',
            start_date: now,
            end_date: vacationEndDate,
            reason: 'Admin initiated vacation mode',
            admin_id: adminUserId,
          },
        });
      } else {
        await tx.accountStatusHistory.updateMany({
          where: { user_id: userId, status: 'VACATION', end_date: null },
          data: { end_date: now },
        });
        await tx.accountStatusHistory.create({
          data: {
            user_id: userId,
            status: 'ACTIVE',
            start_date: now,
            reason: 'Vacation mode ended by admin',
            admin_id: adminUserId,
          },
        });
      }

      await logActionStrict(
        {
          userId: adminUserId,
          action:
            action === 'start' ? 'ADMIN_VACATION_START' : 'ADMIN_VACATION_END',
          ip,
          targetUserId: userId,
          details:
            action === 'start'
              ? { vacationEndDate: vacationEndDate.toISOString() }
              : {},
        },
        tx,
      );
    });

    if (action === 'start') {
      return res
        .status(200)
        .json({ message: 'Vacation mode started for user', vacationEndDate });
    }
    return res.status(200).json({ message: 'Vacation mode ended for user' });
  } catch (error) {
    logError(`Error during admin vacation ${action}:`, error);
    return res.status(500).json({
      error:
        action === 'start'
          ? 'Failed to start vacation mode for user'
          : 'Failed to end vacation mode for user',
    });
  }
}

export default guardedHandler(handler);
