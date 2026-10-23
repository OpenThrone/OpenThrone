import type { ForceContract, Prisma } from '@/lib/prisma-exports';

/** Caller holds the borrower lock. Reserve rows are leaf locks, never lock an alliance here. */
export async function returnForceInTx(
  tx: Prisma.TransactionClient,
  contract: ForceContract,
  status: 'EXPIRED' | 'RECALLED' | 'DISMISSED',
  now = new Date(),
) {
  if (contract.status !== 'ACTIVE') return;
  const user = await tx.users.findUniqueOrThrow({
    where: { id: contract.userId },
    select: { wounded_units: true },
  });
  const wounds = Array.isArray(user.wounded_units)
    ? (user.wounded_units as Array<{
        forceContractId?: number;
        quantity?: number;
      }>)
    : [];
  const wounded = Math.min(
    contract.survivingQuantity,
    wounds
      .filter((w) => w.forceContractId === contract.id)
      .reduce((sum, w) => sum + Number(w.quantity ?? 0), 0),
  );
  await tx.forceContract.update({
    where: { id: contract.id },
    data: { status, closedAt: now, requestedExtensionDays: null },
  });
  if (contract.kind === 'ALLIANCE')
    await tx.forceReserve.updateMany({
      where: { id: contract.reserveId!, eraId: contract.eraId },
      data: {
        available: { increment: contract.survivingQuantity - wounded },
        woundedQuantity: { increment: wounded },
        ...(wounded > 0 ? { lastHealedAt: now } : {}),
      },
    });
  if (wounded > 0)
    await tx.users.update({
      where: { id: contract.userId },
      data: {
        wounded_units: wounds.filter(
          (w) => w.forceContractId !== contract.id,
        ) as Prisma.InputJsonValue,
      },
    });
}

/** The caller already owns the alliance lock; borrower locks serialize with combat. */
export async function returnMemberForcesInTx(
  tx: Prisma.TransactionClient,
  allianceId: number,
  userId: number,
) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
  const contracts = await tx.forceContract.findMany({
    where: { userId, allianceId, status: 'ACTIVE' },
  });
  for (const contract of contracts)
    await returnForceInTx(tx, contract, 'RECALLED');
  await tx.forceObligation.updateMany({
    where: { userId, allianceId, cancelledAt: null },
    data: { cancelledAt: new Date() },
  });
  await tx.forceContract.updateMany({
    where: { userId, allianceId, status: 'REQUESTED' },
    data: { status: 'CANCELLED', closedAt: new Date() },
  });
}

/** Borrowed troops cannot participate against any current member of their source alliance. */
export async function hasForbiddenForceTarget(
  tx: Prisma.TransactionClient,
  attackerId: number,
  defenderId: number,
) {
  const contract = await tx.forceContract.findFirst({
    where: {
      userId: attackerId,
      kind: 'ALLIANCE',
      status: 'ACTIVE',
      expiresAt: { gt: new Date() },
      alliance: { members: { some: { user_id: defenderId } } },
    },
    select: { id: true },
  });
  return Boolean(contract);
}

export async function assertForceBorrowingAllowed(
  tx: Prisma.TransactionClient,
  allianceId: number,
  userId: number,
  suspendOverdue: boolean,
) {
  if (!suspendOverdue) return;
  const debts = await tx.forceObligation.findMany({
    where: { allianceId, userId, cancelledAt: null, dueAt: { lt: new Date() } },
  });
  if (
    debts.some(
      (debt) =>
        debt.amountGold > debt.paidGold ||
        debt.quantity > debt.paidQuantity ||
        debt.fineGold > debt.paidFineGold,
    )
  )
    throw new Error(
      'Alliance borrowing is suspended while dues or fines are overdue',
    );
}
