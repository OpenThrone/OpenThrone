import prisma from '@/lib/prisma';
import { lockAllianceThenUsers } from '@/services/AllianceBank.service';
import { processForceDuesDay } from '@/services/ForceDuesWorker.service';
import { returnForceInTx } from '@/services/ForceLifecycle.service';
import { settleForcePillageInTx } from '@/services/ForcePillage.service';
import { getRuntimeConfig } from '@/services/RuntimeConfig.service';
import { lockEraLifecycleShared } from '@/utils/eraLifecycleLock';
import { getOTStartDate } from '@/utils/timefunctions';

/** Bounded, idempotent work; expired troops are already excluded synchronously by roster reads. */
export async function processTemporaryForces(now = new Date()) {
  const config = await getRuntimeConfig();
  if (config.eraResetInProgress) return;
  const elapsed = await prisma.forceContract.findMany({
    where: { status: 'ACTIVE', expiresAt: { lte: now } },
    select: { id: true, userId: true, allianceId: true },
    take: 100,
    orderBy: { id: 'asc' },
  });
  for (const owner of elapsed)
    await prisma.$transaction(async (tx) => {
      await lockEraLifecycleShared(tx);
      if (owner.allianceId)
        await lockAllianceThenUsers(tx, owner.allianceId, [owner.userId]);
      else
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${owner.userId} FOR UPDATE`;
      const contract = await tx.forceContract.findUnique({
        where: { id: owner.id },
      });
      if (
        !contract ||
        contract.status !== 'ACTIVE' ||
        !contract.expiresAt ||
        contract.expiresAt > now
      )
        return;
      await returnForceInTx(tx, contract, 'EXPIRED', now);
      await tx.forceEvent.create({
        data: {
          operationKey: `force-expire:${contract.id}`,
          contractId: contract.id,
          action: 'EXPIRED',
          quantity: contract.survivingQuantity,
          details: {},
        },
      });
    });
  await prisma.forceContract.updateMany({
    where: {
      status: 'REQUESTED',
      createdAt: { lte: new Date(now.getTime() - 86400000) },
    },
    data: { status: 'CANCELLED', closedAt: now },
  });
  const day = getOTStartDate(0, now);
  const reserves = await prisma.forceReserve.findMany({
    where: { woundedQuantity: { gt: 0 }, lastHealedAt: { lt: day } },
    select: { id: true, allianceId: true },
    take: 100,
    orderBy: { id: 'asc' },
  });
  for (const owner of reserves)
    await prisma.$transaction(async (tx) => {
      await lockEraLifecycleShared(tx);
      await lockAllianceThenUsers(tx, owner.allianceId, []);
      const reserve = await tx.forceReserve.findUnique({
        where: { id: owner.id },
      });
      if (!reserve || reserve.lastHealedAt >= day) return;
      const healed = Math.min(
        reserve.woundedQuantity,
        Math.max(1, Math.floor(reserve.woundedQuantity * 0.35)),
      );
      await tx.forceReserve.update({
        where: { id: reserve.id },
        data: {
          available: { increment: healed },
          woundedQuantity: { decrement: healed },
          lastHealedAt: now,
        },
      });
    });
  const pending = await prisma.forceEvent.findMany({
    where: { action: 'PILLAGE_PENDING' },
    take: 100,
    orderBy: { id: 'asc' },
  });
  const allianceIds = [
    ...new Set<number>(
      pending.map(
        (event) => (event.details as { allianceId: number }).allianceId,
      ),
    ),
  ].sort((a, b) => a - b);
  for (const allianceId of allianceIds)
    await prisma.$transaction(async (tx) => {
      await lockEraLifecycleShared(tx);
      await lockAllianceThenUsers(tx, allianceId, []);
      if (await tx.alliances.findUnique({ where: { id: allianceId } }))
        await settleForcePillageInTx(tx, allianceId);
    });
  await processForceDuesDay(now);
}
