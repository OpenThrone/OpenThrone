import type { NextApiResponse } from 'next';

import prisma from '@/lib/prisma';
import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

const guardedHandler = withApiGuard({
  methods: ['GET'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.VIEW_ECONOMY],
  rateLimitProfile: 'admin',
});

async function handler(_req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    const goldAgg = await prisma.users.aggregate({
      _sum: { gold: true, gold_in_bank: true },
      _avg: { gold: true, gold_in_bank: true },
    });

    const topHolders = await prisma.users.findMany({
      orderBy: { gold: 'desc' },
      take: 10,
      select: {
        id: true,
        display_name: true,
        gold: true,
        gold_in_bank: true,
      },
    });

    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last24hTransfers = await prisma.bank_history.aggregate({
      where: { date_time: { gte: last24h } },
      _sum: { gold_amount: true },
      _count: true,
    });

    const totalUsers = await prisma.users.count();

    return res.status(200).json({
      totalLiquidGold: goldAgg._sum.gold?.toString() ?? '0',
      totalBankGold: goldAgg._sum.gold_in_bank?.toString() ?? '0',
      totalGold: (
        (goldAgg._sum.gold ?? BigInt(0)) +
        (goldAgg._sum.gold_in_bank ?? BigInt(0))
      ).toString(),
      avgLiquidGold: Math.round(Number(goldAgg._avg.gold ?? 0)),
      avgBankGold: Math.round(Number(goldAgg._avg.gold_in_bank ?? 0)),
      topHolders: topHolders.map((u) => ({
        id: u.id,
        display_name: u.display_name,
        gold: u.gold.toString(),
        bank: u.gold_in_bank.toString(),
        net: (u.gold + u.gold_in_bank).toString(),
      })),
      transfersLast24h: last24hTransfers._count,
      transferVolume24h: last24hTransfers._sum.gold_amount?.toString() ?? '0',
      totalUsers,
    });
  } catch (err) {
    logError('Failed to load economy:', err);
    return res.status(500).json({ error: 'Failed to load economy' });
  }
}

export default guardedHandler(handler);
