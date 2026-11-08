import { z } from 'zod';

import prisma from '@/lib/prisma';
import { withApiGuard } from '@/middleware/apiGuard';
import { getRequestIp, logActionStrict } from '@/utils/auditLogger';

const Query = z.object({
  view: z.enum(['erasure', 'exports']).default('erasure'),
  page: z.coerce.number().int().min(1).default(1),
  userId: z.coerce.number().int().positive().optional(),
  status: z
    .enum([
      'AWAITING_CONFIRMATION',
      'PENDING',
      'COMPLETED',
      'CANCELLED',
      'EXPIRED',
    ])
    .optional(),
});

const PAGE_SIZE = 50;

/**
 * Staff view of privacy requests: erasure requests (their state, schedule and
 * any failure) and data-export downloads. Administrators only. The read is
 * audited; the player's free-text reason and email address are not returned.
 */
export default withApiGuard({
  methods: ['GET'],
  authMode: 'admin',
  rateLimitProfile: 'admin',
  querySchema: Query,
})(async (req, res, context) => {
  res.setHeader('Cache-Control', 'private, no-store');
  const { view, page, status, userId } = context.query as z.infer<typeof Query>;
  const skip = (page - 1) * PAGE_SIZE;
  const data = await prisma.$transaction(async (tx) => {
    await logActionStrict(
      {
        userId: Number(req.session.user.id),
        action: 'ADMIN_PRIVACY_REQUESTS_READ',
        ip: getRequestIp(req),
        details: {
          view,
          page,
          status: status ?? null,
          targetUserId: userId ?? null,
        },
      },
      tx,
    );
    if (view === 'exports') {
      const [total, rows] = await Promise.all([
        tx.accountDataExport.count({ where: userId ? { userId } : {} }),
        tx.accountDataExport.findMany({
          where: userId ? { userId } : {},
          orderBy: { id: 'desc' },
          skip,
          take: PAGE_SIZE,
          select: {
            id: true,
            userId: true,
            requestedAt: true,
            completedAt: true,
            byteSize: true,
            user: { select: { display_name: true } },
          },
        }),
      ]);
      return {
        total,
        rows: rows.map(({ user, ...row }) => ({
          ...row,
          displayName: user.display_name,
        })),
      };
    }
    const where = {
      ...(status ? { status } : {}),
      ...(userId ? { userId } : {}),
    };
    const [total, rows] = await Promise.all([
      tx.accountErasureRequest.count({ where }),
      tx.accountErasureRequest.findMany({
        where,
        // Live requests first, then the newest finished ones.
        orderBy: [{ status: 'asc' }, { id: 'desc' }],
        skip,
        take: PAGE_SIZE,
        select: {
          id: true,
          userId: true,
          status: true,
          requestedAt: true,
          confirmedAt: true,
          scheduledFor: true,
          completedAt: true,
          cancelledAt: true,
          cancelledBy: true,
          expeditedByUserId: true,
          attempts: true,
          lastError: true,
          user: { select: { display_name: true } },
        },
      }),
    ]);
    return {
      total,
      rows: rows.map(({ user, ...row }) => ({
        ...row,
        displayName: user.display_name,
      })),
    };
  });
  return res.status(200).json({ ...data, page, pageSize: PAGE_SIZE });
});
