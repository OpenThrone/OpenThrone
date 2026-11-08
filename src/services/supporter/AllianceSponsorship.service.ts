import prisma from '@/lib/prisma';
import type { AllianceSponsorshipInfo } from '@/types/supporter';

import type { Prisma } from '../../../prisma/generated/prisma/client';

type Db = Prisma.TransactionClient;
export async function addContribution(
  allianceId: number,
  cents: number,
  db: Db = prisma,
) {
  if (!Number.isSafeInteger(cents) || cents < 500)
    throw new Error('Invalid contribution');
  return db.allianceSponsorship.upsert({
    where: { allianceId },
    create: { allianceId, poolCents: cents },
    update: { poolCents: { increment: cents } },
  });
}
/** Turns whole months of the pool into premium time (499 cents = 30 days). */
export async function convertPool(allianceId: number, db?: Db) {
  const run = async (tx: Db) => {
    await tx.$queryRaw`SELECT id FROM alliances WHERE id = ${allianceId} FOR UPDATE`;
    const row = await tx.allianceSponsorship.findUnique({
      where: { allianceId },
    });
    if (!row) return null;
    const months = Math.floor(row.poolCents / 499);
    if (!months) return row;
    return tx.allianceSponsorship.update({
      where: { allianceId },
      data: {
        poolCents: row.poolCents - months * 499,
        activeUntil: new Date(
          Math.max(Date.now(), row.activeUntil?.getTime() ?? 0) +
            months * 30 * 86_400_000,
        ),
      },
    });
  };
  return db ? run(db) : prisma.$transaction(run);
}
export async function getSponsorshipInfo(
  allianceId: number,
): Promise<AllianceSponsorshipInfo> {
  const [row, contributions] = await Promise.all([
    prisma.allianceSponsorship.findUnique({ where: { allianceId } }),
    prisma.payment.groupBy({
      by: ['userId'],
      where: {
        allianceId,
        kind: 'ALLIANCE_SPONSORSHIP',
        status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED'] },
      },
      _sum: { amountCents: true, refundedCents: true },
      orderBy: { _sum: { amountCents: 'desc' } },
    }),
  ]);
  const users = await prisma.users.findMany({
    where: { id: { in: contributions.map((c) => c.userId) } },
    select: { id: true, display_name: true },
  });
  return {
    allianceId,
    isPremium: !!row?.activeUntil && row.activeUntil > new Date(),
    poolCents: row?.poolCents ?? 0,
    activeUntil: row?.activeUntil?.toISOString() ?? null,
    contributors: contributions.map((c) => ({
      userId: c.userId,
      displayName: users.find((u) => u.id === c.userId)?.display_name ?? '',
      totalCents: (c._sum.amountCents ?? 0) - (c._sum.refundedCents ?? 0),
    })),
  };
}
