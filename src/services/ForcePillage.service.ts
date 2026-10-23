import type { Prisma } from '@/lib/prisma-exports';
import { ForcePolicySchema } from '@/utils/temporaryForces';

/** Caller holds the attacker lock. Credits are parked without acquiring alliance locks. */
export async function divertForcePillageInTx(
  tx: Prisma.TransactionClient,
  userId: number,
  gross: bigint,
  battleId: number | string,
) {
  if (gross <= 0n) return 0n;
  const memberships = await tx.alliance_memberships.findMany({
    where: { user_id: userId },
    select: { alliance_id: true, role_id: true },
  });
  if (!memberships.length) return 0n;
  const contracts = await tx.forceContract.findMany({
    where: {
      userId,
      kind: 'ALLIANCE',
      type: 'OFFENSE',
      status: 'ACTIVE',
      expiresAt: { gt: new Date() },
    },
  });
  const row = await tx.users.findUniqueOrThrow({
    where: { id: userId },
    select: { wounded_units: true, currentEraId: true },
  });
  const wounds = Array.isArray(row.wounded_units)
    ? (row.wounded_units as Array<{
        forceContractId?: number;
        quantity?: number;
      }>)
    : [];
  const rates: Array<{ allianceId: number; rate: number }> = [];
  for (const member of memberships) {
    const policy = await tx.allianceForcePolicy.findFirst({
      where: { allianceId: member.alliance_id },
      orderBy: { version: 'desc' },
    });
    const general = policy
      ? (ForcePolicySchema.parse(policy.settings).roleAllowances.find(
          (role) => role.roleId === member.role_id,
        )?.pillageRateBps ?? 0)
      : 0;
    const loan = Math.max(
      0,
      ...contracts
        .filter(
          (contract) =>
            contract.allianceId === member.alliance_id &&
            contract.eraId === row.currentEraId &&
            contract.survivingQuantity >
              wounds
                .filter((wound) => wound.forceContractId === contract.id)
                .reduce((sum, wound) => sum + Number(wound.quantity ?? 0), 0),
        )
        .map((contract) => contract.pillageRateBps),
    );
    const rate = Math.max(general, loan);
    if (rate) rates.push({ allianceId: member.alliance_id, rate });
  }
  const sum = rates.reduce((sum, entry) => sum + entry.rate, 0);
  if (!sum) return 0n;
  const denominator = BigInt(Math.max(2500, sum));
  const ceiling = (gross * BigInt(Math.min(sum, 2500))) / 10000n;
  const shares = rates.map((entry) => {
    const numerator = ceiling * BigInt(entry.rate);
    return {
      ...entry,
      gold: numerator / BigInt(sum),
      remainder: numerator % BigInt(sum),
    };
  });
  // Largest remainder makes the capped sum exact and deterministic for small pillages.
  let left = ceiling - shares.reduce((sum, entry) => sum + entry.gold, 0n);
  shares.sort((a, b) =>
    a.remainder === b.remainder
      ? a.allianceId - b.allianceId
      : a.remainder > b.remainder
        ? -1
        : 1,
  );
  for (const share of shares) {
    if (left > 0n) {
      share.gold++;
      left--;
    }
  }
  for (const share of shares.filter((entry) => entry.gold > 0n))
    await tx.forceEvent.create({
      data: {
        operationKey: `force-tax:${battleId}:${share.allianceId}`,
        actorId: userId,
        action: 'PILLAGE_PENDING',
        gold: share.gold,
        details: {
          allianceId: share.allianceId,
          battleId,
          gross: gross.toString(),
          rateBps: share.rate,
          denominator: denominator.toString(),
        },
      },
    });
  return ceiling;
}

/** Caller owns the alliance lock; pending credits never take player balances twice. */
export async function settleForcePillageInTx(
  tx: Prisma.TransactionClient,
  allianceId: number,
) {
  const events = await tx.forceEvent.findMany({
    where: {
      action: 'PILLAGE_PENDING',
      details: { path: ['allianceId'], equals: allianceId },
    },
    orderBy: { id: 'asc' },
  });
  let gold = 0n;
  for (const event of events) {
    const claimed = await tx.forceEvent.updateMany({
      where: { id: event.id, action: 'PILLAGE_PENDING' },
      data: { action: 'PILLAGE_SETTLED' },
    });
    if (claimed.count) {
      gold += event.gold;
      if (event.actorId)
        await tx.alliance_bank_history.create({
          data: {
            alliance_id: allianceId,
            transaction_type: 'TAX',
            amount: event.gold,
            performed_by_user_id: event.actorId,
            related_user_id: event.actorId,
            notes: `Pillage contribution: force event ${event.id}`,
          },
        });
    }
  }
  if (gold)
    await tx.alliances.update({
      where: { id: allianceId },
      data: { gold_in_bank: { increment: gold } },
    });
  return gold;
}
