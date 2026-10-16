import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { withApiGuard } from '@/middleware/apiGuard';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logActionStrict } from '@/utils/auditLogger';
import { logError } from '@/utils/logger';

const Schema = z.object({ userId: z.coerce.number().int().positive() });

const guardedHandler = withApiGuard({
  methods: ['GET'],
  // Exports include private messages, so administrators only.
  authMode: 'admin',
  rateLimitProfile: 'admin',
  querySchema: Schema,
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { query: z.infer<typeof Schema> },
) {
  try {
    const { userId } = context.query;
    const [user, attacks, defense, status, messages, reports] =
      await Promise.all([
        prisma.users.findUnique({ where: { id: userId } }),
        prisma.attack_log.findMany({
          where: { attacker_id: userId },
          take: 100,
        }),
        prisma.attack_log.findMany({
          where: { defender_id: userId },
          take: 100,
        }),
        prisma.accountStatusHistory.findMany({ where: { user_id: userId } }),
        prisma.messages.findMany({
          where: { OR: [{ from_user_id: userId }, { to_user_id: userId }] },
          take: 50,
        }),
        prisma.report.findMany({
          where: {
            OR: [{ reporterUserId: userId }, { reportedUserId: userId }],
          },
        }),
      ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      user: user
        ? {
            id: user.id,
            email: user.email,
            display_name: user.display_name,
            created_at: user.created_at,
            last_active: user.last_active,
          }
        : null,
      accountStatusHistory: status,
      recentAttacks: attacks,
      recentDefense: defense,
      recentMessages: messages,
      reports,
    };

    // Fail closed: the export is never returned unless it is on record.
    // logActionStrict throws, which lands in the 500 branch below.
    await logActionStrict({
      userId: Number(req.session?.user?.id),
      action: 'ADMIN_USER_EXPORT',
      ip: getRequestIp(req),
      targetUserId: userId,
      details: {
        messageCount: messages.length,
        reportCount: reports.length,
      },
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="user-${userId}-export-${Date.now()}.json"`,
    );
    return res.status(200).json(exportData);
  } catch (err) {
    logError('Failed to export user data:', err);
    return res.status(500).json({ error: 'Failed to export' });
  }
}

export default guardedHandler(handler);
