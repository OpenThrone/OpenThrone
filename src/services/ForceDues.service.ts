import { createHash, randomUUID } from 'crypto';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import type { ForceObligation, Prisma } from '@/lib/prisma-exports';
import { lockAllianceThenUsers } from '@/services/AllianceBank.service';
import { TemporaryForceLedgerService as Ledger } from '@/services/TemporaryForceLedger.service';
import { lockEraLifecycleShared } from '@/utils/eraLifecycleLock';
import {
  ForcePolicySchema,
  ForceRoleSchema,
  parseForceLoadout,
} from '@/utils/temporaryForces';

const positiveId = z.number().int().positive();
const money = z
  .string()
  .regex(/^(0|[1-9]\d{0,14})$/)
  .transform(BigInt);
export const duesTermsSchema = z
  .object({
    amountGold: money.default('0'),
    quantity: z.number().int().min(0).max(1000000).default(0),
    type: ForceRoleSchema.nullable().default(null),
    level: z.number().int().min(1).max(3).nullable().default(null),
  })
  .superRefine((terms, ctx) => {
    if (
      !(
        (terms.amountGold > 0n &&
          terms.quantity === 0 &&
          terms.type === null &&
          terms.level === null) ||
        (terms.amountGold === 0n &&
          terms.quantity > 0 &&
          terms.type &&
          terms.level)
      )
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Choose gold or a specific troop tier',
      });
  });
export const levySchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    userIds: z.array(positiveId).min(1).max(1000),
    dueAt: z.string().datetime(),
    terms: duesTermsSchema,
    operationId: z.string().uuid(),
  })
  .strict();
export const ruleSchema = z
  .object({
    roleId: positiveId,
    minLevel: z.number().int().min(1).max(10000),
    terms: duesTermsSchema,
    intervalDays: z.number().int().min(1).max(365),
    dueDays: z.number().int().min(1).max(30),
    enabled: z.boolean(),
  })
  .strict();
export const duesPaymentSchema = z
  .object({
    obligationId: positiveId,
    amountGold: money.default('0'),
    quantity: z.number().int().min(0).max(1000000).default(0),
    unitId: positiveId.optional(),
    equipment: z.unknown().optional(),
    operationId: z.string().uuid(),
  })
  .strict();
const hash = (value: unknown) =>
  createHash('sha256')
    .update(
      JSON.stringify(value, (_, v) =>
        typeof v === 'bigint' ? v.toString() : v,
      ),
    )
    .digest('hex');
export const obligationOutstanding = (obligation: ForceObligation) =>
  obligation.amountGold > obligation.paidGold ||
  obligation.quantity > obligation.paidQuantity ||
  obligation.fineGold > obligation.paidFineGold;

async function leader(
  tx: Prisma.TransactionClient,
  allianceId: number,
  actorId: number,
) {
  const alliance = await tx.alliances.findUniqueOrThrow({
    where: { id: allianceId },
  });
  if (alliance.leader_id !== actorId)
    throw new Error('Alliance leadership is required');
}

export async function createForceLevy(
  allianceId: number,
  actorId: number,
  input: z.input<typeof levySchema>,
) {
  const command = levySchema.parse(input);
  if (new Date(command.dueAt) <= new Date())
    throw new Error('Due date must be in the future');
  return prisma.$transaction(async (tx) => {
    await lockEraLifecycleShared(tx);
    await lockAllianceThenUsers(tx, allianceId, [actorId]);
    await leader(tx, allianceId, actorId);
    const prior = await tx.forceEvent.findUnique({
      where: { operationKey: command.operationId },
    });
    const commandHash = hash({ action: 'LEVY', allianceId, actorId, command });
    if (prior) {
      if (
        (prior.details as { commandHash?: string }).commandHash !== commandHash
      )
        throw new Error('Operation ID already used for different terms');
      return;
    }
    const userIds = [...new Set(command.userIds)];
    const members = await tx.alliance_memberships.count({
      where: { alliance_id: allianceId, user_id: { in: userIds } },
    });
    if (members !== userIds.length)
      throw new Error('Every recipient must be a current alliance member');
    const policy = await tx.allianceForcePolicy.findFirst({
      where: { allianceId },
      orderBy: { version: 'desc' },
    });
    const { enforcement } = ForcePolicySchema.parse(policy?.settings ?? {});
    const era = await tx.users.findUniqueOrThrow({
      where: { id: actorId },
      select: { currentEraId: true },
    });
    await tx.forceObligation.createMany({
      data: userIds.map((userId) => ({
        allianceId,
        userId,
        eraId: era.currentEraId,
        enforcement,
        sourceKey: `levy:${command.operationId}:${userId}`,
        title: command.title,
        dueAt: new Date(command.dueAt),
        ...command.terms,
      })),
    });
    await tx.forceEvent.create({
      data: {
        operationKey: command.operationId,
        allianceId,
        actorId,
        action: 'LEVY',
        details: { commandHash, dueAt: command.dueAt, userIds },
      },
    });
  });
}

export async function saveForceDuesRule(
  allianceId: number,
  actorId: number,
  input: z.input<typeof ruleSchema>,
) {
  const command = ruleSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await lockEraLifecycleShared(tx);
    await lockAllianceThenUsers(tx, allianceId, [actorId]);
    await leader(tx, allianceId, actorId);
    if (
      !(await tx.alliance_roles.findFirst({
        where: { id: command.roleId, alliance_id: allianceId },
      }))
    )
      throw new Error('Role belongs to another alliance');
    const { terms, ...settings } = command;
    return tx.forceDuesRule.upsert({
      where: {
        allianceId_roleId_minLevel: {
          allianceId,
          roleId: command.roleId,
          minLevel: command.minLevel,
        },
      },
      create: { allianceId, ...settings, ...terms },
      update: { ...settings, ...terms },
    });
  });
}

/** Caller owns alliance then player locks. Used by explicit payments and the day tick. */
export async function payForceDuesInTx(
  tx: Prisma.TransactionClient,
  obligation: ForceObligation,
  input: {
    amountGold: bigint;
    quantity: number;
    unitId?: number;
    equipment?: unknown;
    operationId: string;
  },
  automatic = false,
) {
  const owner = await tx.users.findUniqueOrThrow({
    where: { id: obligation.userId },
    select: { currentEraId: true },
  });
  if (obligation.eraId !== owner.currentEraId)
    throw new Error('Obligation belongs to an earlier era');
  if (obligation.cancelledAt) throw new Error('Obligation is cancelled');
  if (
    !(await tx.alliance_memberships.findUnique({
      where: {
        unique_alliance_user: {
          alliance_id: obligation.allianceId,
          user_id: obligation.userId,
        },
      },
    }))
  )
    throw new Error('Current alliance membership is required');
  const commandHash = hash({
    action: 'DUES_PAYMENT',
    userId: obligation.userId,
    obligationId: obligation.id,
    automatic,
    ...input,
  });
  const prior = await tx.forceEvent.findUnique({
    where: { operationKey: input.operationId },
  });
  if (prior) {
    if ((prior.details as { commandHash?: string }).commandHash !== commandHash)
      throw new Error('Operation ID already used for different terms');
    return;
  }
  if (input.amountGold <= 0n && input.quantity <= 0)
    throw new Error('Payment must be positive');
  const principal = obligation.amountGold - obligation.paidGold;
  const fine = obligation.fineGold - obligation.paidFineGold;
  if (
    input.amountGold > principal + fine ||
    input.quantity > obligation.quantity - obligation.paidQuantity
  )
    throw new Error('Payment exceeds amount due');
  if (input.amountGold) {
    const debit = await tx.users.updateMany({
      where: { id: obligation.userId, gold: { gte: input.amountGold } },
      data: { gold: { decrement: input.amountGold } },
    });
    if (debit.count !== 1) throw new Error('Insufficient on-hand gold');
    await tx.alliances.update({
      where: { id: obligation.allianceId },
      data: { gold_in_bank: { increment: input.amountGold } },
    });
  }
  if (input.amountGold)
    await tx.alliance_bank_history.create({
      data: {
        alliance_id: obligation.allianceId,
        transaction_type: 'TAX',
        amount: input.amountGold,
        performed_by_user_id: obligation.userId,
        related_user_id: obligation.userId,
        notes: `Troop pool dues and fines: obligation ${obligation.id}`,
      },
    });
  if (input.quantity) {
    if (!input.unitId) throw new Error('Choose existing equipped troops');
    const unit = await tx.userUnit.findFirst({
      where: {
        id: input.unitId,
        userId: obligation.userId,
        isMercenary: false,
        type: obligation.type!,
        level: obligation.level!,
      },
    });
    if (!unit) throw new Error('Troops do not match the required tier');
    await Ledger.contributeInTx(tx, {
      allianceId: obligation.allianceId,
      userId: obligation.userId,
      unitId: unit.id,
      quantity: input.quantity,
      equipment: input.equipment,
      operationId: randomUUID(),
    });
  }
  const goldPrincipal =
    input.amountGold < principal ? input.amountGold : principal;
  await tx.forceObligation.update({
    where: { id: obligation.id },
    data: {
      paidGold: { increment: goldPrincipal },
      paidFineGold: { increment: input.amountGold - goldPrincipal },
      paidQuantity: { increment: input.quantity },
    },
  });
  await tx.forceEvent.create({
    data: {
      operationKey: input.operationId,
      allianceId: obligation.allianceId,
      actorId: obligation.userId,
      action: automatic ? 'DUES_AUTO_PAYMENT' : 'DUES_PAYMENT',
      gold: input.amountGold,
      quantity: input.quantity,
      details: { commandHash, obligationId: obligation.id },
    },
  });
}

export async function payForceDues(
  allianceId: number,
  userId: number,
  input: z.input<typeof duesPaymentSchema>,
) {
  const command = duesPaymentSchema.parse(input);
  return prisma.$transaction(
    async (tx) => {
      await lockEraLifecycleShared(tx);
      await lockAllianceThenUsers(tx, allianceId, [userId]);
      const obligation = await tx.forceObligation.findFirst({
        where: { id: command.obligationId, allianceId, userId },
      });
      if (!obligation) throw new Error('Obligation belongs to another player');
      return payForceDuesInTx(tx, obligation, {
        amountGold: command.amountGold!,
        quantity: command.quantity!,
        operationId: command.operationId!,
        unitId: command.unitId,
        equipment: command.equipment,
      });
    },
    { timeout: 10000 },
  );
}

export async function designateForceCollection(
  allianceId: number,
  userId: number,
  obligationId: number,
  unitId: number,
  equipment: unknown,
) {
  return prisma.$transaction(async (tx) => {
    await lockEraLifecycleShared(tx);
    await lockAllianceThenUsers(tx, allianceId, [userId]);
    const obligation = await tx.forceObligation.findFirst({
      where: { id: obligationId, allianceId, userId, cancelledAt: null },
    });
    if (!obligation || !obligation.type)
      throw new Error('Troop obligation not found');
    const kit = parseForceLoadout(
      ForceRoleSchema.parse(obligation.type),
      equipment,
    );
    if (
      !(await tx.userUnit.findFirst({
        where: {
          id: unitId,
          userId,
          type: obligation.type,
          level: obligation.level!,
          isMercenary: false,
        },
      }))
    )
      throw new Error('Choose your eligible permanent troops');
    return tx.forceObligation.update({
      where: { id: obligationId },
      data: { collectionUnitId: unitId, collectionEquipment: kit },
    });
  });
}

export async function waiveForceObligation(
  allianceId: number,
  actorId: number,
  obligationId: number,
) {
  return prisma.$transaction(async (tx) => {
    await lockEraLifecycleShared(tx);
    await lockAllianceThenUsers(tx, allianceId, [actorId]);
    await leader(tx, allianceId, actorId);
    const cancelled = await tx.forceObligation.updateMany({
      where: { id: obligationId, allianceId, cancelledAt: null },
      data: { cancelledAt: new Date() },
    });
    if (cancelled.count)
      await tx.forceEvent.create({
        data: {
          operationKey: `waive:${obligationId}`,
          allianceId,
          actorId,
          action: 'DUES_WAIVED',
          details: { obligationId },
        },
      });
  });
}
