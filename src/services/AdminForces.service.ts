import { randomUUID } from 'crypto';

import prisma from '@/lib/prisma';
import type { ForceContract, Prisma, UnitType } from '@/lib/prisma-exports';
import { lockAllianceThenUsers } from '@/services/AllianceBank.service';
import { returnForceInTx } from '@/services/ForceLifecycle.service';
import { MercenaryService } from '@/services/Mercenary.service';
import {
  type AdminContractAction,
  adminContractOutcome,
  blocksAdminOnAdmin,
  elapsedAllianceContracts,
  type ForceMutation,
  forceMutationPermission,
  planAdminHealAll,
} from '@/utils/adminForces';
import { recomputeStoredStatsInTx } from '@/utils/adminRecomputeStats';
import { logActionStrict } from '@/utils/auditLogger';
import { hasAnyPermission } from '@/utils/authorization';
import { lockEraLifecycleShared } from '@/utils/eraLifecycleLock';

type Tx = Prisma.TransactionClient;

/** Staff identity recorded on audit rows and ForceEvents. */
export type AdminActor = { userId: number; ip: string };

export class AdminForceError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** Game lock order: era, then the alliance, then the borrower (see ForceWorker). */
async function lockContractOwner(
  tx: Tx,
  userId: number,
  allianceId: number | null,
) {
  await lockEraLifecycleShared(tx);
  if (allianceId) await lockAllianceThenUsers(tx, allianceId, [userId]);
  else await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
}

/**
 * Per-operation permission plus the admin-on-admin rule; call after the
 * target user row is locked so a concurrent role grant cannot slip past.
 */
async function assertMayMutate(
  tx: Tx,
  actor: AdminActor,
  targetUserId: number,
  mutation: ForceMutation,
) {
  const permission = forceMutationPermission(mutation);
  if (!(await hasAnyPermission(actor.userId, [permission])))
    throw new AdminForceError(`Requires ${permission}`, 403);
  // Unfiltered by revokedAt, as in the Edit Player API; the helper ignores revoked rows.
  const staffRows = await tx.staffRoleAssignment.findMany({
    where: { userId: targetUserId },
    select: { role: true, revokedAt: true },
  });
  if (blocksAdminOnAdmin(actor.userId, targetUserId, staffRows))
    throw new AdminForceError(
      'Administrators cannot edit other administrators',
      403,
    );
}

/** Refreshes the player's stored army stats after unit or contract changes. */
async function recomputeAfterForceChange(tx: Tx, userId: number) {
  await recomputeStoredStatsInTx(tx, userId);
}

/**
 * Closes a contract the way the game does: requested loans are cancelled,
 * active ones go through `returnForceInTx` (reserve stock and contract wounds
 * reconcile there). No gold is refunded: contracts store no prepaid balance
 * and the player-facing dismiss refunds nothing either.
 */
export async function adminCloseContract(
  contractId: number,
  action: AdminContractAction,
  actor: AdminActor,
  reason?: string,
) {
  return prisma.$transaction(async (tx) => {
    const found = await tx.forceContract.findUnique({
      where: { id: contractId },
      select: { userId: true, allianceId: true },
    });
    if (!found) throw new AdminForceError('Contract not found', 404);
    await lockContractOwner(tx, found.userId, found.allianceId);
    const contract = await tx.forceContract.findUniqueOrThrow({
      where: { id: contractId },
    });
    await assertMayMutate(tx, actor, contract.userId, {
      op: 'closeContract',
      kind: contract.kind,
    });
    const outcome = adminContractOutcome(contract.status, action);
    if (!outcome) throw new AdminForceError('Contract is already closed', 409);
    const now = new Date();
    if (outcome === 'CANCELLED') {
      await tx.forceContract.update({
        where: { id: contract.id },
        data: { status: 'CANCELLED', closedAt: now },
      });
    } else {
      await returnForceInTx(tx, contract, outcome, now);
      await recomputeAfterForceChange(tx, contract.userId);
    }
    await tx.forceEvent.create({
      data: {
        operationKey: `admin-${action.toLowerCase()}:${contract.id}:${randomUUID()}`,
        allianceId: contract.allianceId,
        contractId: contract.id,
        actorId: actor.userId,
        action: `ADMIN_${outcome}`,
        quantity: contract.survivingQuantity,
        details: { reason: reason ?? null, admin: true },
      },
    });
    await logActionStrict(
      {
        userId: actor.userId,
        action:
          action === 'EXPIRE'
            ? 'ADMIN_FORCE_CONTRACT_EXPIRE'
            : 'ADMIN_FORCE_CONTRACT_TERMINATE',
        ip: actor.ip,
        targetUserId: contract.userId,
        entityType: 'ForceContract',
        entityId: contract.id,
        details: {
          kind: contract.kind,
          fromStatus: contract.status,
          toStatus: outcome,
          survivingQuantity: contract.survivingQuantity,
          reason: reason ?? null,
        },
      },
      tx,
    );
    return { contractId: contract.id, status: outcome };
  });
}

/** Returns an alliance deployment to its reserve (status RECALLED). */
export async function adminReturnForce(
  contractId: number,
  actor: AdminActor,
  reason?: string,
) {
  return prisma.$transaction(async (tx) => {
    const found = await tx.forceContract.findUnique({
      where: { id: contractId },
      select: { userId: true, kind: true, allianceId: true },
    });
    if (!found) throw new AdminForceError('Contract not found', 404);
    if (found.kind !== 'ALLIANCE')
      throw new AdminForceError(
        'Only alliance deployments return to a reserve',
      );
    await lockContractOwner(tx, found.userId, found.allianceId);
    const contract = await tx.forceContract.findUniqueOrThrow({
      where: { id: contractId },
    });
    await assertMayMutate(tx, actor, contract.userId, { op: 'returnForce' });
    if (contract.status !== 'ACTIVE')
      throw new AdminForceError('Deployment is not active', 409);
    await returnForceInTx(tx, contract, 'RECALLED');
    await recomputeAfterForceChange(tx, contract.userId);
    await tx.forceEvent.create({
      data: {
        operationKey: `admin-return:${contract.id}:${randomUUID()}`,
        allianceId: contract.allianceId,
        contractId: contract.id,
        actorId: actor.userId,
        action: 'ADMIN_RECALLED',
        quantity: contract.survivingQuantity,
        details: { reason: reason ?? null, admin: true },
      },
    });
    await logActionStrict(
      {
        userId: actor.userId,
        action: 'ADMIN_FORCE_RETURN',
        ip: actor.ip,
        targetUserId: contract.userId,
        entityType: 'ForceContract',
        entityId: contract.id,
        details: {
          allianceId: contract.allianceId,
          reserveId: contract.reserveId,
          survivingQuantity: contract.survivingQuantity,
          reason: reason ?? null,
        },
      },
      tx,
    );
    return { contractId: contract.id, status: 'RECALLED' as const };
  });
}

/** Waives an open obligation by setting cancelledAt, as alliance exits do. */
export async function adminCancelObligation(
  obligationId: number,
  actor: AdminActor,
  reason?: string,
) {
  return prisma.$transaction(async (tx) => {
    const found = await tx.forceObligation.findUnique({
      where: { id: obligationId },
      select: { userId: true, allianceId: true },
    });
    if (!found) throw new AdminForceError('Obligation not found', 404);
    await lockContractOwner(tx, found.userId, found.allianceId);
    await assertMayMutate(tx, actor, found.userId, { op: 'waiveObligation' });
    const now = new Date();
    const updated = await tx.forceObligation.updateMany({
      where: { id: obligationId, cancelledAt: null },
      data: { cancelledAt: now },
    });
    const row = await tx.forceObligation.findUniqueOrThrow({
      where: { id: obligationId },
    });
    if (updated.count !== 1)
      throw new AdminForceError('Obligation is already cancelled', 409);
    await logActionStrict(
      {
        userId: actor.userId,
        action: 'ADMIN_FORCE_OBLIGATION_CANCEL',
        ip: actor.ip,
        targetUserId: row.userId,
        entityType: 'ForceObligation',
        entityId: row.id,
        details: {
          allianceId: row.allianceId,
          title: row.title,
          outstandingGold: (row.amountGold - row.paidGold).toString(),
          outstandingQuantity: row.quantity - row.paidQuantity,
          outstandingFineGold: (row.fineGold - row.paidFineGold).toString(),
          reason: reason ?? null,
        },
      },
      tx,
    );
    return { obligationId: row.id, cancelledAt: now };
  });
}

/**
 * Heals every wounded group at once, applying the cron's rules in full.
 * Elapsed contracts are closed first the way the game closes them
 * (mercenaries via expireInTx, alliance deployments via returnForceInTx so
 * their wounded go to the reserve's wounded pool). Wounds are then re-read:
 * permanent wounds return to UserUnit, active-contract wounds are cleared
 * (roster projection restores them) and closed-contract wounds are dropped.
 */
export async function adminHealAll(
  userId: number,
  actor: AdminActor,
  reason?: string,
) {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    // Alliances must be locked before the user; read candidates first.
    const candidates = await tx.forceContract.findMany({
      where: {
        userId,
        kind: 'ALLIANCE',
        status: 'ACTIVE',
        expiresAt: { lte: now },
      },
      select: { allianceId: true },
    });
    const allianceIds = [
      ...new Set(
        candidates
          .map((c): number | null => c.allianceId)
          .filter((id): id is number => id !== null),
      ),
    ].sort((a: number, b: number) => a - b);
    await lockEraLifecycleShared(tx);
    for (const allianceId of allianceIds)
      await tx.$queryRaw`SELECT id FROM alliances WHERE id = ${allianceId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    const exists = await tx.users.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!exists) throw new AdminForceError('User not found', 404);
    await assertMayMutate(tx, actor, userId, { op: 'healWounded' });

    await MercenaryService.expireInTx(tx, userId, now);
    const open: ForceContract[] = await tx.forceContract.findMany({
      where: { userId, status: 'ACTIVE' },
    });
    const elapsed = elapsedAllianceContracts<ForceContract>(open, now);
    for (const contract of elapsed) {
      await returnForceInTx(tx, contract, 'EXPIRED', now);
      await tx.forceEvent.create({
        data: {
          operationKey: `force-expire:${contract.id}`,
          allianceId: contract.allianceId,
          contractId: contract.id,
          action: 'EXPIRED',
          quantity: contract.survivingQuantity,
          details: { via: 'admin-heal' },
        },
      });
    }

    // Re-read: returnForceInTx removed the returned contracts' wounds.
    const row = await tx.users.findUniqueOrThrow({
      where: { id: userId },
      select: { wounded_units: true },
    });
    const active = await tx.forceContract.findMany({
      where: { userId, status: 'ACTIVE', expiresAt: { gt: now } },
      select: { id: true },
    });
    const plan = planAdminHealAll(
      row.wounded_units,
      new Set(active.map((c) => c.id)),
    );
    for (const unit of plan.restore) {
      const type = unit.type as UnitType;
      await tx.userUnit.upsert({
        where: {
          userId_type_level_isMercenary: {
            userId,
            type,
            level: unit.level,
            isMercenary: unit.isMercenary,
          },
        },
        update: { quantity: { increment: unit.quantity } },
        create: {
          userId,
          type,
          level: unit.level,
          quantity: unit.quantity,
          isMercenary: unit.isMercenary,
        },
      });
    }
    await tx.users.update({
      where: { id: userId },
      data: { wounded_units: [] as Prisma.InputJsonValue },
    });
    await recomputeAfterForceChange(tx, userId);
    await logActionStrict(
      {
        userId: actor.userId,
        action: 'ADMIN_HEAL_WOUNDED',
        ip: actor.ip,
        targetUserId: userId,
        entityType: 'User',
        entityId: userId,
        details: {
          restored: plan.restore,
          contractHealed: plan.contractHealed,
          dropped: plan.dropped,
          returnedElapsedContracts: elapsed.map((c) => c.id),
          reason: reason ?? null,
        },
      },
      tx,
    );
    return plan;
  });
}
