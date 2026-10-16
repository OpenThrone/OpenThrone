import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import { sendInactivityNotices } from '@/services/AccountInactivity.service';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp } from '@/utils/auditLogger';
import { logError } from '@/utils/logger';

const Body = z
  .object({
    userIds: z.array(z.number().int().positive()).min(1).max(1000).optional(),
    all: z.boolean().default(false),
  })
  .refine((v) => v.all || !!v.userIds?.length);
export default withApiGuard({
  methods: ['POST'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.MANAGE_USERS],
  rateLimitProfile: 'admin',
  bodySchema: Body,
})(async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { body: z.infer<typeof Body> },
) => {
  try {
    return res.status(200).json(
      await sendInactivityNotices({
        userIds: context.body.all ? undefined : context.body.userIds,
        actorId: Number(req.session.user.id),
        ip: getRequestIp(req),
      }),
    );
  } catch {
    logError('Inactivity notice send failed');
    return res.status(500).json({ error: 'Failed to send inactivity notices' });
  }
});
