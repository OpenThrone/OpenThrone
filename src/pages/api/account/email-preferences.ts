import { z } from 'zod';

import prisma from '@/lib/prisma';
import { withApiGuard } from '@/middleware/apiGuard';

export const EmailPreferencesSchema = z
  .object({
    newsEmails: z.boolean(),
    announcementEmails: z.boolean(),
    attackNotificationEmails: z.boolean().optional(),
    unsubscribedAll: z.boolean(),
  })
  .strict();

export default withApiGuard({
  methods: ['GET', 'PUT'],
  authMode: 'required',
  rateLimitProfile: 'auth',
  bodySchema: EmailPreferencesSchema,
})(async (req, res, context) => {
  const userId = Number(req.session.user.id);
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'GET') {
    const preferences = await prisma.emailPreference.findUnique({
      where: { userId },
    });
    return res.status(200).json({
      newsEmails: preferences?.newsEmails ?? true,
      announcementEmails: preferences?.announcementEmails ?? true,
      attackNotificationEmails: preferences?.attackNotificationEmails ?? false,
      unsubscribedAll: !!preferences?.unsubscribedAllAt,
    });
  }
  const {
    newsEmails,
    announcementEmails,
    attackNotificationEmails,
    unsubscribedAll,
  } = context.body;
  const data = {
    newsEmails,
    announcementEmails,
    ...(attackNotificationEmails === undefined
      ? {}
      : { attackNotificationEmails }),
    unsubscribedAllAt: unsubscribedAll ? new Date() : null,
  };
  const saved = await prisma.emailPreference.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
  return res.status(200).json({
    newsEmails,
    announcementEmails,
    attackNotificationEmails: saved.attackNotificationEmails,
    unsubscribedAll,
  });
});
