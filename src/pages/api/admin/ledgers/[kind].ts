import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logActionStrict } from '@/utils/auditLogger';

const querySchema = z.object({
  kind: z.enum(['transfers', 'recruits', 'logins', 'suppressions', 'blocks']),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  from: z.coerce.number().int().positive().optional(),
  to: z.coerce.number().int().positive().optional(),
  start: z.string().date().optional(),
  end: z.string().date().optional(),
  search: z.string().max(128).optional(),
});
const bodySchema = z.object({ id: z.number().int().positive() });
const permissions = {
  transfers: PermissionType.VIEW_ECONOMY,
  recruits: PermissionType.VIEW_ANALYTICS,
  logins: PermissionType.VIEW_MULTI_ACCOUNTS,
  suppressions: PermissionType.SEND_MASS_MESSAGES,
  blocks: PermissionType.MANAGE_ACCOUNT_STATUS,
} as const;
type Kind = keyof typeof permissions;

const handlers = Object.fromEntries(
  Object.entries(permissions).map(([kind, permission]) => [
    kind,
    withApiGuard({
      methods:
        kind === 'suppressions' || kind === 'blocks'
          ? ['GET', 'DELETE']
          : ['GET'],
      authMode: 'permission',
      requiredAnyPermissions: [permission],
      rateLimitProfile: 'admin',
      querySchema,
    })(
      async (
        req: AuthenticatedRequest,
        res: NextApiResponse,
        context: { query: z.infer<typeof querySchema> },
      ) => {
        const q = context.query;
        const actor = Number(req.session.user.id);
        if (req.method === 'DELETE') {
          const parsed = bodySchema.safeParse(req.body);
          if (!parsed.success)
            return res.status(400).json({ error: 'Invalid id' });
          const { id } = parsed.data;
          const outcome = await prisma.$transaction(async (tx) => {
            const now = new Date();
            if (kind === 'suppressions') {
              const row = await tx.emailSuppression.findUnique({
                where: { id },
              });
              if (!row) return 'missing';
              if (!['HARD_BOUNCE', 'MANUAL'].includes(row.reason))
                return 'protected';
              const deleted = await tx.emailSuppression.deleteMany({
                where: {
                  id,
                  reason: row.reason,
                  hash: row.hash,
                  createdAt: row.createdAt,
                  createdByUserId: row.createdByUserId,
                },
              });
              if (!deleted.count) return 'protected';
              await logActionStrict(
                {
                  userId: actor,
                  action: 'ADMIN_EMAIL_SUPPRESSION_REMOVE',
                  ip: getRequestIp(req),
                  details: {
                    id,
                    kind,
                    hash: row.hash,
                    reason: row.reason,
                    source: row.createdByUserId,
                    createdAt: row.createdAt.toISOString(),
                  },
                },
                tx,
              );
            } else {
              const row = await tx.identityBlock.findUnique({ where: { id } });
              if (!row) return 'missing';
              if (!row.expiresAt || row.expiresAt > now) return 'protected';
              const deleted = await tx.identityBlock.deleteMany({
                where: {
                  id,
                  reason: row.reason,
                  hash: row.hash,
                  kind: row.kind,
                  createdAt: row.createdAt,
                  sourceUserId: row.sourceUserId,
                  expiresAt: { equals: row.expiresAt, lte: now },
                },
              });
              if (!deleted.count) return 'protected';
              await logActionStrict(
                {
                  userId: actor,
                  action: 'ADMIN_IDENTITY_BLOCK_REMOVE',
                  ip: getRequestIp(req),
                  details: {
                    id,
                    kind: row.kind,
                    hash: row.hash,
                    reason: row.reason,
                    source: row.sourceUserId,
                    createdAt: row.createdAt.toISOString(),
                  },
                },
                tx,
              );
            }
            return 'deleted';
          });
          if (outcome === 'protected')
            return res.status(409).json({
              error:
                kind === 'blocks'
                  ? 'Active identity protections cannot be removed, or the entry has changed.'
                  : 'Unsubscribe and complaint suppressions cannot be removed, or the entry has changed.',
            });
          return res
            .status(outcome === 'deleted' ? 200 : 404)
            .json({ deleted: outcome === 'deleted' });
        }
        const skip = (q.page - 1) * 25;
        const date = {
          ...(q.start ? { gte: new Date(`${q.start}T00:00:00.000Z`) } : {}),
          ...(q.end
            ? {
                lt: new Date(
                  new Date(`${q.end}T00:00:00.000Z`).getTime() + 86400000,
                ),
              }
            : {}),
        };
        const hasDate = !!(q.start || q.end);
        if (q.start && q.end && q.start > q.end)
          return res.status(400).json({ error: 'Invalid date range' });
        let rows: unknown[] = [];
        let total = 0;
        let pairs: unknown[] = [];
        if (kind === 'transfers') {
          const where = {
            history_type: 'FRIEND_TRANSFER',
            to_user_account_type: 'HAND',
            ...(q.from ? { from_user_id: q.from } : {}),
            ...(q.to ? { to_user_id: q.to } : {}),
            ...(hasDate ? { date_time: date } : {}),
          };
          const [items, count] = await Promise.all([
            prisma.bank_history.findMany({
              where,
              orderBy: [{ date_time: 'desc' }, { id: 'desc' }],
              skip,
              take: 25,
            }),
            prisma.bank_history.count({ where }),
          ]);
          rows = items.map((item) => ({
            ...item,
            gold_amount: item.gold_amount.toString(),
          }));
          total = count;
          const keys = Array.from(
            new Map(
              items.map((item) => [
                `${item.from_user_id}:${item.to_user_id}`,
                [item.from_user_id, item.to_user_id] as const,
              ]),
            ).values(),
          );
          pairs = await Promise.all(
            keys.map(async ([from, to]) => {
              const sum = await prisma.bank_history.aggregate({
                where: { ...where, from_user_id: from, to_user_id: to },
                _sum: { gold_amount: true },
                _count: true,
              });
              return {
                from,
                to,
                amount: (sum._sum.gold_amount ?? BigInt(0)).toString(),
                count: sum._count,
              };
            }),
          );
        } else if (kind === 'recruits') {
          const where = {
            ...(q.from ? { to_user: q.from } : {}),
            ...(q.to ? { from_user: q.to } : {}),
            ...(hasDate ? { timestamp: date } : {}),
          };
          [rows, total] = await Promise.all([
            prisma.recruit_history.findMany({
              where,
              // ip_addr stays out: raw IPs need investigation permissions.
              select: {
                id: true,
                source: true,
                from_user: true,
                to_user: true,
                timestamp: true,
              },
              orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
              skip,
              take: 25,
            }),
            prisma.recruit_history.count({ where }),
          ]);
        } else if (kind === 'logins') {
          if (!q.from)
            return res.status(400).json({ error: 'User ID required' });
          const where = {
            userId: q.from,
            ...(hasDate ? { occurredAt: date } : {}),
          };
          [rows, total] = await Promise.all([
            prisma.loginEvent.findMany({
              where,
              orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
              skip,
              take: 25,
            }),
            prisma.loginEvent.count({ where }),
          ]);
        } else if (kind === 'suppressions') {
          const where = q.search
            ? { hash: { contains: q.search, mode: 'insensitive' as const } }
            : {};
          const [items, count] = await Promise.all([
            prisma.emailSuppression.findMany({
              where,
              orderBy: { id: 'desc' },
              skip,
              take: 25,
            }),
            prisma.emailSuppression.count({ where }),
          ]);
          rows = items.map((row) => ({
            ...row,
            removable: ['HARD_BOUNCE', 'MANUAL'].includes(row.reason),
          }));
          total = count;
        } else {
          const where = q.search
            ? { hash: { contains: q.search, mode: 'insensitive' as const } }
            : {};
          const [items, count] = await Promise.all([
            prisma.identityBlock.findMany({
              where,
              orderBy: { id: 'desc' },
              skip,
              take: 25,
            }),
            prisma.identityBlock.count({ where }),
          ]);
          const now = new Date();
          rows = items.map((row) => ({
            ...row,
            removable: !!row.expiresAt && row.expiresAt <= now,
          }));
          total = count;
        }
        await logActionStrict({
          userId: actor,
          action: `ADMIN_LEDGER_${kind.toUpperCase()}_READ`,
          ip: getRequestIp(req),
          // The free-text search can hold an email or identity; never log it.
          details: {
            ...q,
            search: undefined,
            searched: Boolean(q.search),
            resultCount: rows.length,
            total,
          },
        });
        return res.status(200).json({ rows, total, pairs });
      },
    ),
  ]),
) as Record<Kind, ReturnType<ReturnType<typeof withApiGuard>>>;

export default function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
) {
  const { kind } = req.query;
  if (
    typeof kind !== 'string' ||
    !Object.prototype.hasOwnProperty.call(permissions, kind)
  )
    return res.status(404).end();
  return handlers[kind as Kind](req, res);
}
