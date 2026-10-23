import { createHash } from 'crypto';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { lockAllianceThenUsers } from '@/services/AllianceBank.service';
import { assertForceBorrowingAllowed } from '@/services/ForceLifecycle.service';
import { lockEraLifecycleShared } from '@/utils/eraLifecycleLock';
import { forceExpiration, ForcePolicySchema } from '@/utils/temporaryForces';

const schema = z
  .object({
    contractId: z.number().int().positive(),
    actorId: z.number().int().positive(),
    days: z.number().int().min(1).max(30),
    approve: z.boolean().default(false),
    operationId: z.string().uuid(),
  })
  .strict();
export async function extendAllianceForce(input: z.input<typeof schema>) {
  const command = schema.parse(input);
  const owner = await prisma.forceContract.findUniqueOrThrow({
    where: { id: command.contractId },
  });
  if (owner.kind !== 'ALLIANCE' || !owner.allianceId)
    throw new Error('Not an alliance loan');
  return prisma.$transaction(async (tx) => {
    await lockEraLifecycleShared(tx);
    await lockAllianceThenUsers(tx, owner.allianceId!, [
      owner.userId,
      command.actorId,
    ]);
    const hash = createHash('sha256')
      .update(JSON.stringify({ kind: 'EXTEND', ...command }))
      .digest('hex');
    const prior = await tx.forceEvent.findUnique({
      where: { operationKey: command.operationId },
    });
    if (prior) {
      if ((prior.details as { commandHash?: string }).commandHash !== hash)
        throw new Error('Operation ID already used for different terms');
      return tx.forceContract.findUniqueOrThrow({ where: { id: owner.id } });
    }
    const contract = await tx.forceContract.findUniqueOrThrow({
      where: { id: owner.id },
    });
    const now = new Date();
    if (
      contract.status !== 'ACTIVE' ||
      !contract.expiresAt ||
      contract.expiresAt <= now
    )
      throw new Error('Contract is no longer active');
    const membership = await tx.alliance_memberships.findUnique({
      where: {
        unique_alliance_user: {
          alliance_id: owner.allianceId!,
          user_id: owner.userId,
        },
      },
    });
    if (!membership) throw new Error('Current alliance membership is required');
    const alliance = await tx.alliances.findUniqueOrThrow({
      where: { id: owner.allianceId! },
    });
    const policy = await tx.allianceForcePolicy.findFirstOrThrow({
      where: { allianceId: owner.allianceId! },
      orderBy: { version: 'desc' },
    });
    const settings = ForcePolicySchema.parse(policy.settings);
    await assertForceBorrowingAllowed(
      tx,
      owner.allianceId!,
      owner.userId,
      settings.enforcement.suspendOverdue,
    );
    const allowance = settings.roleAllowances.find(
      (entry) => entry.roleId === membership.role_id,
    );
    if (command.approve) {
      if (alliance.leader_id !== command.actorId)
        throw new Error('Alliance leadership is required');
      if (contract.requestedExtensionDays !== command.days)
        throw new Error('Extension request has changed');
    } else if (command.actorId !== contract.userId)
      throw new Error('Contract belongs to another player');
    if (settings.lendingMode === 'ROLE_ALLOWANCE' && !allowance)
      throw new Error('No automatic lending allowance for this role');
    if (allowance) {
      const borrowed = await tx.forceContract.aggregate({
        where: {
          userId: contract.userId,
          allianceId: contract.allianceId,
          eraId: contract.eraId,
          kind: 'ALLIANCE',
          status: 'ACTIVE',
          expiresAt: { gt: now },
        },
        _sum: { survivingQuantity: true },
      });
      if ((borrowed._sum.survivingQuantity ?? 0) > allowance.maxBorrowed)
        throw new Error('Current borrowed troops exceed the role allowance');
    }
    const expiresAt = forceExpiration(contract.expiresAt, command.days);
    const maxDays = Math.min(30, allowance?.maxTermDays ?? 30);
    if (expiresAt.getTime() > now.getTime() + maxDays * 86400000)
      throw new Error('Extended loan exceeds the current role term limit');
    const active = command.approve || settings.lendingMode === 'ROLE_ALLOWANCE';
    const result = await tx.forceContract.update({
      where: { id: owner.id },
      data: active
        ? { expiresAt, requestedExtensionDays: null }
        : { requestedExtensionDays: command.days },
    });
    await tx.forceEvent.create({
      data: {
        operationKey: command.operationId,
        contractId: owner.id,
        allianceId: owner.allianceId,
        actorId: command.actorId,
        action: active ? 'EXTENDED' : 'EXTENSION_REQUESTED',
        details: { commandHash: hash, days: command.days },
      },
    });
    return result;
  });
}

export async function cancelAllianceForceRequest(
  contractId: number,
  actorId: number,
  operationId: string,
) {
  z.object({
    contractId: z.number().int().positive(),
    actorId: z.number().int().positive(),
    operationId: z.string().uuid(),
  }).parse({ contractId, actorId, operationId });
  const owner = await prisma.forceContract.findUniqueOrThrow({
    where: { id: contractId },
  });
  if (owner.kind !== 'ALLIANCE' || !owner.allianceId)
    throw new Error('Not an alliance request');
  return prisma.$transaction(async (tx) => {
    await lockEraLifecycleShared(tx);
    await lockAllianceThenUsers(tx, owner.allianceId!, [owner.userId, actorId]);
    const alliance = await tx.alliances.findUniqueOrThrow({
      where: { id: owner.allianceId! },
    });
    if (owner.userId !== actorId && alliance.leader_id !== actorId)
      throw new Error('Contract belongs to another player');
    const commandHash = createHash('sha256')
      .update(JSON.stringify({ kind: 'CANCEL_REQUEST', contractId, actorId }))
      .digest('hex');
    const prior = await tx.forceEvent.findUnique({
      where: { operationKey: operationId },
    });
    if (prior) {
      if (
        (prior.details as { commandHash?: string }).commandHash !== commandHash
      )
        throw new Error('Operation ID already used for different terms');
      return;
    }
    const cancelled = await tx.forceContract.updateMany({
      where: { id: contractId, status: 'REQUESTED' },
      data: { status: 'CANCELLED', closedAt: new Date() },
    });
    if (cancelled.count !== 1)
      throw new Error('Loan request is no longer pending');
    await tx.forceEvent.create({
      data: {
        operationKey: operationId,
        contractId,
        allianceId: owner.allianceId,
        actorId,
        action: 'CANCELLED',
        details: { commandHash },
      },
    });
  });
}
