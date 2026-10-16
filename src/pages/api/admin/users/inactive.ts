import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import { inactiveUsersWhere } from '@/services/AccountInactivity.service';
import { resolveEligibleRecipients } from '@/services/Email.service';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logActionStrict } from '@/utils/auditLogger';
import { logError } from '@/utils/logger';

const Query = z.object({
  page: z.coerce.number().int().min(1).default(1),
  status: z.enum(['none', 'warned', 'cancelled', 'completed']).optional(),
});
export default withApiGuard({
  methods: ['GET'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.MANAGE_USERS],
  rateLimitProfile: 'admin',
  querySchema: Query,
})(async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { query: z.infer<typeof Query> },
) => {
  try {
    const { page, status } = context.query;
    const where = inactiveUsersWhere(new Date(), status);
    const data = await prisma.$transaction(async (tx) => {
      await logActionStrict(
        {
          userId: Number(req.session.user.id),
          action: 'ADMIN_INACTIVE_USERS_READ',
          ip: getRequestIp(req),
          details: { page, status: status ?? null },
        },
        tx,
      );
      const [total, users] = await Promise.all([
        tx.users.count({ where }),
        tx.users.findMany({
          where,
          orderBy: { id: 'asc' },
          skip: (page - 1) * 50,
          take: 50,
          select: {
            id: true,
            display_name: true,
            last_active: true,
            created_at: true,
            accountInactivityNotice: true,
          },
        }),
      ]);
      return { total, users, page, pageSize: 50 };
    });
    const recipients = await resolveEligibleRecipients({
      category: 'ACCOUNT_LIFECYCLE',
      userIds: data.users.map((user) => user.id),
    });
    const deliverableIds = new Set(recipients.map((r) => r.userId));
    return res.status(200).json({
      ...data,
      users: data.users.map((user) => ({
        ...user,
        deliverableEmail: deliverableIds.has(user.id),
      })),
    });
  } catch {
    logError('Inactive user listing failed');
    return res.status(500).json({ error: 'Failed to load inactive users' });
  }
});
