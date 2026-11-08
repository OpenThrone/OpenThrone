import type { NextApiResponse } from 'next';

import prisma from '@/lib/prisma';
import {
  giftRow,
  membershipRow,
  pagination,
  paymentRow,
  sponsorshipRow,
  summary,
  supporterGuard,
} from '@/services/supporter/admin';
import type { AuthenticatedRequest } from '@/types/api';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    const { section } = req.query;
    if (section === 'summary') return res.json(await summary());
    const { skip, take } = pagination(req.query);
    if (section === 'memberships') {
      const { status } = req.query;
      const { source } = req.query;
      if (
        status &&
        !['ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED'].includes(String(status))
      )
        return res.status(400).json({ error: 'Invalid status' });
      if (
        source &&
        !['SUBSCRIPTION', 'ONE_TIME', 'GIFT', 'COMP'].includes(String(source))
      )
        return res.status(400).json({ error: 'Invalid source' });
      const where: any = {
        ...(status ? { status } : {}),
        ...(source ? { source } : {}),
      };
      const [rows, total] = await Promise.all([
        prisma.supporterMembership.findMany({
          where,
          include: { user: { select: { display_name: true } } },
          orderBy: { startedAt: 'desc' },
          skip,
          take,
        }),
        prisma.supporterMembership.count({ where }),
      ]);
      return res.json({
        rows: await Promise.all(rows.map(membershipRow)),
        total,
      });
    }
    if (section === 'payments' || section === 'payments.csv') {
      const where = {};
      const [rows, total] = await Promise.all([
        prisma.payment.findMany({
          where,
          include: { user: { select: { display_name: true } } },
          orderBy: { createdAt: 'desc' },
          ...(section === 'payments' ? { skip, take } : {}),
        }),
        prisma.payment.count({ where }),
      ]);
      const records = rows.map((p) => ({
        ...paymentRow(p),
        userId: p.userId,
        displayName: p.user.display_name,
      }));
      if (section === 'payments.csv') {
        const keys = [
          'id',
          'userId',
          'displayName',
          'kind',
          'status',
          'amountCents',
          'refundedCents',
          'taxCents',
          'currency',
          'description',
          'createdAt',
          'allianceId',
          'provider',
          'providerPaymentId',
        ] as const;
        const escape = (value: unknown) =>
          `"${String(value ?? '').replace(/"/g, '""')}"`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          'attachment; filename="supporter-payments.csv"',
        );
        return res.send(
          [
            keys.join(','),
            ...records.map((row) =>
              keys.map((key) => escape(row[key])).join(','),
            ),
          ].join('\r\n'),
        );
      }
      return res.json({ rows: records, total });
    }
    if (section === 'events') {
      await prisma.paymentEvent.updateMany({
        where: {
          provider: 'mock',
          type: 'mock.checkout.pending',
          status: 'RECEIVED',
          receivedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        data: {
          status: 'IGNORED',
          error: 'Mock checkout expired',
          processedAt: new Date(),
        },
      });
      const { status } = req.query;
      if (
        status &&
        !['RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED'].includes(String(status))
      )
        return res.status(400).json({ error: 'Invalid status' });
      const where: any = status ? { status } : {};
      const [rows, total] = await Promise.all([
        prisma.paymentEvent.findMany({
          where,
          orderBy: { receivedAt: 'desc' },
          skip,
          take,
        }),
        prisma.paymentEvent.count({ where }),
      ]);
      return res.json({ rows, total });
    }
    if (section === 'gifts') {
      const [rows, total] = await Promise.all([
        prisma.giftCode.findMany({
          include: {
            purchaser: { select: { display_name: true } },
            recipient: { select: { display_name: true } },
            redeemedBy: { select: { display_name: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
        prisma.giftCode.count(),
      ]);
      return res.json({
        rows: rows.map((g) => ({
          ...giftRow(g),
          purchaserName: g.purchaser.display_name,
          purchaserUserId: g.purchaserUserId,
          recipientUserId: g.recipientUserId,
          redeemedByUserId: g.redeemedByUserId,
        })),
        total,
      });
    }
    if (section === 'alliances') {
      const [rows, total] = await Promise.all([
        prisma.allianceSponsorship.findMany({
          include: { alliance: { select: { name: true } } },
          orderBy: { updatedAt: 'desc' },
          skip,
          take,
        }),
        prisma.allianceSponsorship.count(),
      ]);
      return res.json({
        rows: await Promise.all(rows.map(sponsorshipRow)),
        total,
      });
    }
    return res.status(404).json({ error: 'Not found' });
  } catch {
    return res.status(400).json({ error: 'Unable to retrieve supporter data' });
  }
}
export default supporterGuard(['GET'])(handler);
