import { createHash } from 'crypto';
import { z } from 'zod';

import { ItemTypes } from '@/constants/Items';
import prisma from '@/lib/prisma';
import type { ForceContract, Prisma } from '@/lib/prisma-exports';
import {
  ALLIANCE_BANK_TX_OPTIONS,
  lockAllianceThenUsers,
} from '@/services/AllianceBank.service';
import {
  assertForceBorrowingAllowed,
  returnForceInTx,
} from '@/services/ForceLifecycle.service';
import { lockEraLifecycleShared } from '@/utils/eraLifecycleLock';
import {
  assertForceTierUnlocked,
  forceExpiration,
  ForcePolicySchema,
  ForceQuantitySchema,
  ForceRoleSchema,
  ForceTermSchema,
  isForceContractUsable,
  MAX_FORCE_QUANTITY,
  parseForceLoadout,
} from '@/utils/temporaryForces';
import { calculateUserStats } from '@/utils/utilities';

const idSchema = z.number().int().positive();
const operationSchema = z.string().uuid();
const contributionSchema = z
  .object({
    allianceId: idSchema,
    userId: idSchema,
    unitId: idSchema,
    quantity: ForceQuantitySchema,
    equipment: z.unknown(),
    operationId: operationSchema,
  })
  .strict();
const requestSchema = z
  .object({
    allianceId: idSchema,
    userId: idSchema,
    reserveId: idSchema,
    quantity: ForceQuantitySchema,
    termDays: ForceTermSchema,
    operationId: operationSchema,
  })
  .strict();
const canonicalEquipment = (input: unknown) =>
  Array.isArray(input) &&
  input.every(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      !Array.isArray(item) &&
      Object.keys(item).length === 2 &&
      typeof (item as { type?: unknown }).type === 'string' &&
      typeof (item as { level?: unknown }).level === 'number',
  )
    ? [...(input as Array<{ type: string; level: number }>)]
        .map(({ type, level }) => ({ type, level }))
        .sort((a, b) => a.type.localeCompare(b.type))
    : input;
const commandHash = (command: unknown) =>
  createHash('sha256').update(JSON.stringify(command)).digest('hex');

type CommandKind =
  | 'CONTRIBUTE'
  | 'REQUEST'
  | 'APPROVE'
  | 'CLOSE'
  | 'CASUALTIES';
type Tx = Prisma.TransactionClient;
const member = async (tx: Tx, allianceId: number, userId: number) => {
  const membership = await tx.alliance_memberships.findUnique({
    where: {
      unique_alliance_user: { alliance_id: allianceId, user_id: userId },
    },
    include: { role: true },
  });
  if (!membership) throw new Error('Current alliance membership is required');
  return membership;
};
const leader = async (tx: Tx, allianceId: number, userId: number) => {
  const alliance = await tx.alliances.findUnique({
    where: { id: allianceId },
    select: { leader_id: true },
  });
  if (!alliance || alliance.leader_id !== userId)
    throw new Error('Alliance leadership is required');
};
/** Existing manual requests never bypass manual approval after a policy-mode change. */
const requireManualLending = (mode: 'MANUAL' | 'ROLE_ALLOWANCE') => {
  if (mode !== 'MANUAL')
    throw new Error(
      'Manual request approval is unavailable under automatic lending policy',
    );
};
const replay = async (
  tx: Tx,
  operationKey: string,
  kind: CommandKind,
  command: unknown,
) => {
  const prior = await tx.forceEvent.findUnique({ where: { operationKey } });
  if (
    prior &&
    (prior.details as { commandHash?: string })?.commandHash !==
      commandHash({ kind, command })
  )
    throw new Error('Operation ID has already been used for different terms');
  return prior;
};
const event = (
  tx: Tx,
  data: {
    operationKey: string;
    allianceId?: number;
    contractId?: number;
    actorId?: number;
    action: string;
    kind: CommandKind;
    quantity?: number;
    command: unknown;
    details?: Prisma.InputJsonObject;
  },
) => {
  const { command, details, kind, ...fields } = data;
  return tx.forceEvent.create({
    data: {
      ...fields,
      details: {
        ...details,
        commandHash: commandHash({ kind, command }),
      },
    },
  });
};

/**
 * Ownership ledger for #10, shared by troop routes, dues payments and combat.
 * Alliance mutations lock alliance -> users, matching the treasury. Do not call
 * these entrypoints from a transaction that already holds a users row lock.
 */
export class TemporaryForceLedgerService {
  static async savePolicy(allianceId: number, actorId: number, input: unknown) {
    idSchema.parse(allianceId);
    idSchema.parse(actorId);
    const settings = ForcePolicySchema.parse(input);
    return prisma.$transaction(async (tx) => {
      await lockEraLifecycleShared(tx);
      await lockAllianceThenUsers(tx, allianceId, [actorId]);
      await leader(tx, allianceId, actorId);
      const roles = await tx.alliance_roles.findMany({
        where: { alliance_id: allianceId },
        select: { id: true },
      });
      if (
        settings.roleAllowances.some(
          (allowance) => !roles.some((role) => role.id === allowance.roleId),
        )
      )
        throw new Error('Allowance role does not belong to this alliance');
      const previous = await tx.allianceForcePolicy.findFirst({
        where: { allianceId },
        orderBy: { version: 'desc' },
      });
      if (
        previous &&
        JSON.stringify(ForcePolicySchema.parse(previous.settings)) ===
          JSON.stringify(settings)
      )
        return previous;
      // Append-only through this service; existing contracts retain their snapshot.
      return tx.allianceForcePolicy.create({
        data: { allianceId, version: (previous?.version ?? 0) + 1, settings },
      });
    }, ALLIANCE_BANK_TX_OPTIONS);
  }

  /** Permanently moves existing regular troops and one full kit per troop. */
  static async contribute(input: z.input<typeof contributionSchema>) {
    const params = contributionSchema.parse(input);
    return prisma.$transaction(async (tx) => {
      await lockEraLifecycleShared(tx);
      await lockAllianceThenUsers(tx, params.allianceId, [params.userId]);
      return this.contributeInTx(tx, params);
    }, ALLIANCE_BANK_TX_OPTIONS);
  }

  /** Caller holds alliance then user locks; used by atomic troop-dues payments. */
  static async contributeInTx(
    tx: Tx,
    input: z.input<typeof contributionSchema>,
  ) {
    const params = contributionSchema.parse(input);
    const command = {
      ...params,
      equipment: canonicalEquipment(params.equipment),
    };
    const { allianceId, userId, unitId, quantity, operationId } = params;
    await member(tx, allianceId, userId);
    const prior = await replay(tx, operationId, 'CONTRIBUTE', command);
    if (prior) return prior;
    const user = await tx.users.findUnique({
      where: { id: userId },
      select: {
        race: true,
        currentEraId: true,
        fort_level: true,
        UserStructureUpgrade: true,
      },
    });
    const unit = await tx.userUnit.findFirst({
      where: { id: unitId, userId, isMercenary: false },
    });
    if (!user || !unit || unit.quantity < quantity)
      throw new Error('Insufficient permanent troops');
    const role = ForceRoleSchema.parse(unit.type);
    assertForceTierUnlocked(role, unit.level, user.fort_level);
    const equipment = parseForceLoadout(role, params.equipment);
    const armoryLevel =
      user.UserStructureUpgrade.find((upgrade) => upgrade.type === 'ARMORY')
        ?.level ?? 0;
    for (const item of equipment) {
      const known = ItemTypes.find(
        (entry) =>
          entry.usage === role &&
          entry.type === item.type &&
          entry.level === item.level,
      );
      if (
        (known.race !== 'ALL' && known.race !== user.race) ||
        (known.armoryLevel ?? 1) > armoryLevel
      )
        throw new Error('Equipment is not unlocked for the contributor');
      const debit = await tx.userItem.updateMany({
        where: {
          userId,
          usage: role,
          type: item.type,
          level: item.level,
          quantity: { gte: quantity },
        },
        data: { quantity: { decrement: quantity } },
      });
      if (debit.count !== 1)
        throw new Error('Insufficient equipment for fully equipped troops');
    }
    const debit = await tx.userUnit.updateMany({
      where: {
        id: unitId,
        userId,
        isMercenary: false,
        quantity: { gte: quantity },
      },
      data: { quantity: { decrement: quantity } },
    });
    if (debit.count !== 1) throw new Error('Troop balance changed');
    await tx.userItem.deleteMany({
      where: { userId, usage: role, quantity: 0 },
    });
    await tx.userUnit.deleteMany({
      where: { id: unitId, userId, isMercenary: false, quantity: 0 },
    });
    const updatedUser = await tx.users.findUniqueOrThrow({
      where: { id: userId },
      include: {
        UserUnit: true,
        UserItem: true,
        UserStructureUpgrade: true,
        UserBattleUpgrade: true,
        UserBonusPoints: true,
      },
    });
    const stats = calculateUserStats(
      updatedUser,
      updatedUser.UserUnit,
      'units',
    );
    await tx.users.update({
      where: { id: userId },
      data: {
        killing_str: stats.killingStrength,
        defense_str: stats.defenseStrength,
        offense: stats.newOffense,
        defense: stats.newDefense,
        spy: stats.newSpying,
        sentry: stats.newSentry,
      },
    });
    const loadoutKey = commandHash(equipment);
    const existingReserve = await tx.forceReserve.findUnique({
      where: {
        allianceId_type_level_loadoutKey: {
          allianceId,
          type: role,
          level: unit.level,
          loadoutKey,
        },
      },
    });
    if (existingReserve && existingReserve.eraId !== user.currentEraId) {
      await tx.forceReserve.update({
        where: { id: existingReserve.id },
        data: { available: 0, woundedQuantity: 0, eraId: user.currentEraId },
      });
      existingReserve.available = 0;
      existingReserve.woundedQuantity = 0;
    }
    const outstanding = existingReserve
      ? await tx.forceContract.aggregate({
          where: {
            reserveId: existingReserve.id,
            status: 'ACTIVE',
            eraId: user.currentEraId,
          },
          _sum: { survivingQuantity: true },
        })
      : null;
    // Capacity includes loans out: otherwise later donations could fill the
    // available pool and leave no room to return already-owned survivors.
    if (
      (existingReserve?.available ?? 0) +
        (existingReserve?.woundedQuantity ?? 0) +
        (outstanding?._sum.survivingQuantity ?? 0) +
        quantity >
      MAX_FORCE_QUANTITY
    )
      throw new Error('Reserve capacity includes troops currently on loan');
    const reserve = await tx.forceReserve.upsert({
      where: {
        allianceId_type_level_loadoutKey: {
          allianceId,
          type: role,
          level: unit.level,
          loadoutKey,
        },
      },
      create: {
        allianceId,
        type: role,
        level: unit.level,
        loadoutKey,
        equipment,
        eraId: user.currentEraId,
        available: quantity,
      },
      update: { available: { increment: quantity } },
    });
    return event(tx, {
      operationKey: operationId,
      allianceId,
      actorId: userId,
      action: 'CONTRIBUTE',
      kind: 'CONTRIBUTE',
      quantity,
      command,
      details: { reserveId: reserve.id, unitId, equipment },
    });
  }

  static async requestLoan(input: z.input<typeof requestSchema>) {
    const params = requestSchema.parse(input);
    return prisma.$transaction(async (tx) => {
      await lockEraLifecycleShared(tx);
      const { allianceId, userId, reserveId, quantity, termDays, operationId } =
        params;
      await lockAllianceThenUsers(tx, allianceId, [userId]);
      const membership = await member(tx, allianceId, userId);
      const prior = await replay(tx, operationId, 'REQUEST', params);
      if (prior)
        return tx.forceContract.findUniqueOrThrow({
          where: { id: prior.contractId },
        });
      const reserve = await tx.forceReserve.findFirst({
        where: { id: reserveId, allianceId },
      });
      const user = await tx.users.findUnique({
        where: { id: userId },
        select: { fort_level: true, currentEraId: true },
      });
      if (
        !reserve ||
        reserve.available < quantity ||
        !user ||
        reserve.eraId !== user.currentEraId
      )
        throw new Error('Insufficient alliance reserve');
      assertForceTierUnlocked(
        ForceRoleSchema.parse(reserve.type),
        reserve.level,
        user.fort_level,
      );
      const policy = await tx.allianceForcePolicy.findFirst({
        where: { allianceId },
        orderBy: { version: 'desc' },
      });
      if (!policy)
        throw new Error('Leader must configure a lending policy first');
      const settings = ForcePolicySchema.parse(policy.settings);
      await assertForceBorrowingAllowed(
        tx,
        allianceId,
        userId,
        settings.enforcement.suspendOverdue,
      );
      const allowance = settings.roleAllowances.find(
        (entry) => entry.roleId === membership.role_id,
      );
      if (settings.lendingMode === 'ROLE_ALLOWANCE' && !allowance)
        throw new Error('No automatic lending allowance for this role');
      if (allowance && termDays > allowance.maxTermDays)
        throw new Error('Loan term exceeds role allowance');
      const borrowed = await tx.forceContract.aggregate({
        where: {
          userId,
          allianceId,
          eraId: user.currentEraId,
          kind: 'ALLIANCE',
          status: 'ACTIVE',
          expiresAt: { gt: new Date() },
        },
        _sum: { survivingQuantity: true },
      });
      const maxBorrowed = allowance?.maxBorrowed ?? MAX_FORCE_QUANTITY;
      if ((borrowed._sum.survivingQuantity ?? 0) + quantity > maxBorrowed)
        throw new Error('Borrowing limit exceeded');
      const contract = await tx.forceContract.create({
        data: {
          kind: 'ALLIANCE',
          eraId: user.currentEraId,
          userId,
          allianceId,
          reserveId,
          type: reserve.type,
          level: reserve.level,
          equipment: reserve.equipment as Prisma.InputJsonValue,
          initialQuantity: quantity,
          survivingQuantity: quantity,
          termDays,
          policyVersion: policy.version,
          pillageRateBps: allowance?.loanRateBps ?? 0,
        },
      });
      await event(tx, {
        operationKey: operationId,
        allianceId,
        actorId: userId,
        contractId: contract.id,
        action: 'REQUEST',
        kind: 'REQUEST',
        quantity,
        command: params,
      });
      if (settings.lendingMode === 'ROLE_ALLOWANCE') {
        const race = await tx.users.findUniqueOrThrow({
          where: { id: userId },
          select: { race: true },
        });
        for (const kit of parseForceLoadout(
          ForceRoleSchema.parse(reserve.type),
          reserve.equipment,
        )) {
          const item = ItemTypes.find(
            (item) =>
              item.usage === reserve.type &&
              item.type === kit.type &&
              item.level === kit.level,
          )!;
          if (item.race !== 'ALL' && item.race !== race.race)
            throw new Error('Loan equipment is not available to this race');
        }
        const stock = await tx.forceReserve.updateMany({
          where: { id: reserve.id, available: { gte: quantity } },
          data: { available: { decrement: quantity } },
        });
        if (stock.count !== 1) throw new Error('Insufficient alliance reserve');
        const now = new Date();
        return tx.forceContract.update({
          where: { id: contract.id },
          data: {
            status: 'ACTIVE',
            startsAt: now,
            expiresAt: forceExpiration(now, termDays),
          },
        });
      }
      return contract;
    }, ALLIANCE_BANK_TX_OPTIONS);
  }

  /** Manual approval rechecks membership, era, kit eligibility and current role limits. */
  static async approveLoan(input: {
    contractId: number;
    actorId: number;
    operationId: string;
  }) {
    const params = z
      .object({
        contractId: idSchema,
        actorId: idSchema,
        operationId: operationSchema,
      })
      .strict()
      .parse(input);
    const owner = await prisma.forceContract.findUniqueOrThrow({
      where: { id: params.contractId },
    });
    if (owner.kind !== 'ALLIANCE' || owner.allianceId === null)
      throw new Error('Not an alliance loan');
    return prisma.$transaction(async (tx) => {
      await lockEraLifecycleShared(tx);
      const { allianceId } = owner;
      await lockAllianceThenUsers(tx, allianceId, [
        owner.userId,
        params.actorId,
      ]);
      await leader(tx, allianceId, params.actorId);
      const membership = await member(tx, allianceId, owner.userId);
      const prior = await replay(tx, params.operationId, 'APPROVE', params);
      const contract = await tx.forceContract.findUniqueOrThrow({
        where: { id: params.contractId },
      });
      if (prior) return contract;
      if (contract.status !== 'REQUESTED')
        throw new Error('Loan request is no longer pending');
      if (Date.now() - contract.createdAt.getTime() >= 86400000)
        throw new Error('Loan request has expired');
      const currentPolicy = await tx.allianceForcePolicy.findFirstOrThrow({
        where: { allianceId },
        orderBy: { version: 'desc' },
      });
      requireManualLending(
        ForcePolicySchema.parse(currentPolicy.settings).lendingMode,
      );
      await assertForceBorrowingAllowed(
        tx,
        allianceId,
        contract.userId,
        ForcePolicySchema.parse(currentPolicy.settings).enforcement
          .suspendOverdue,
      );
      const user = await tx.users.findUniqueOrThrow({
        where: { id: contract.userId },
        select: { fort_level: true, race: true, currentEraId: true },
      });
      if (user.currentEraId !== contract.eraId)
        throw new Error('Current era participation is required');
      assertForceTierUnlocked(
        ForceRoleSchema.parse(contract.type),
        contract.level,
        user.fort_level,
      );
      const loadout = parseForceLoadout(
        ForceRoleSchema.parse(contract.type),
        contract.equipment,
      );
      if (
        loadout.some((item) => {
          const known = ItemTypes.find(
            (entry) =>
              entry.usage === contract.type &&
              entry.type === item.type &&
              entry.level === item.level,
          );
          return known.race !== 'ALL' && known.race !== user.race;
        })
      )
        throw new Error('Loan equipment is not available to this race');
      const policy = await tx.allianceForcePolicy.findUniqueOrThrow({
        where: {
          allianceId_version: {
            allianceId,
            version: contract.policyVersion ?? 0,
          },
        },
      });
      const settings = ForcePolicySchema.parse(policy.settings);
      requireManualLending(settings.lendingMode);
      // Limits use the current membership role against the accepted policy;
      // the stored contribution rate remains the request-time quote.
      const allowance = settings.roleAllowances.find(
        (entry) => entry.roleId === membership.role_id,
      );
      const currentAllowance = ForcePolicySchema.parse(
        currentPolicy.settings,
      ).roleAllowances.find((entry) => entry.roleId === membership.role_id);
      if (
        contract.termDays >
        Math.min(
          allowance?.maxTermDays ?? 30,
          currentAllowance?.maxTermDays ?? 30,
        )
      )
        throw new Error('Loan term exceeds role allowance');
      const borrowed = await tx.forceContract.aggregate({
        where: {
          userId: contract.userId,
          allianceId,
          eraId: contract.eraId,
          kind: 'ALLIANCE',
          status: 'ACTIVE',
          expiresAt: { gt: new Date() },
        },
        _sum: { survivingQuantity: true },
      });
      const maxBorrowed = Math.min(
        allowance?.maxBorrowed ?? MAX_FORCE_QUANTITY,
        currentAllowance?.maxBorrowed ?? MAX_FORCE_QUANTITY,
      );
      if (
        (borrowed._sum.survivingQuantity ?? 0) + contract.survivingQuantity >
        maxBorrowed
      )
        throw new Error('Borrowing limit exceeded');
      const debit = await tx.forceReserve.updateMany({
        where: {
          id: contract.reserveId,
          allianceId,
          type: contract.type,
          level: contract.level,
          loadoutKey: commandHash(loadout),
          available: { gte: contract.survivingQuantity },
        },
        data: { available: { decrement: contract.survivingQuantity } },
      });
      if (debit.count !== 1) throw new Error('Insufficient alliance reserve');
      const now = new Date();
      const result = await tx.forceContract.update({
        where: { id: contract.id },
        data: {
          status: 'ACTIVE',
          startsAt: now,
          expiresAt: forceExpiration(now, contract.termDays),
        },
      });
      await event(tx, {
        operationKey: params.operationId,
        allianceId,
        actorId: params.actorId,
        contractId: contract.id,
        action: 'APPROVE',
        kind: 'APPROVE',
        quantity: contract.survivingQuantity,
        command: params,
      });
      return result;
    }, ALLIANCE_BANK_TX_OPTIONS);
  }

  /** Return a loan's survivors once; mercenary survivors vanish without refunds. */
  static async closeContract(input: {
    contractId: number;
    actorId: number;
    reason: 'EXPIRED' | 'RECALLED' | 'DISMISSED';
    operationId: string;
  }) {
    const params = z
      .object({
        contractId: idSchema,
        actorId: idSchema,
        reason: z.enum(['EXPIRED', 'RECALLED', 'DISMISSED']),
        operationId: operationSchema,
      })
      .strict()
      .parse(input);
    const owner = await prisma.forceContract.findUniqueOrThrow({
      where: { id: params.contractId },
    });
    return prisma.$transaction(async (tx) => {
      await lockEraLifecycleShared(tx);
      if (owner.allianceId !== null)
        await lockAllianceThenUsers(tx, owner.allianceId, [
          owner.userId,
          params.actorId,
        ]);
      else
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${owner.userId} FOR UPDATE`;
      if (params.reason === 'RECALLED') {
        if (owner.allianceId === null)
          throw new Error('Only alliance loans can be recalled');
        await leader(tx, owner.allianceId, params.actorId);
      } else if (owner.userId !== params.actorId)
        throw new Error('Contract belongs to another player');
      const prior = await replay(tx, params.operationId, 'CLOSE', params);
      if (prior)
        return tx.forceContract.findUniqueOrThrow({
          where: { id: params.contractId },
        });
      const contract = await tx.forceContract.findUniqueOrThrow({
        where: { id: params.contractId },
      });
      const now = new Date();
      if (contract.status === 'REQUESTED' || contract.status === 'CANCELLED')
        throw new Error('Contract is not active');
      if (contract.status !== 'ACTIVE') return contract;
      if (
        params.reason === 'EXPIRED' &&
        (!contract.expiresAt || contract.expiresAt > now)
      )
        throw new Error('Contract has not expired');
      const status =
        contract.expiresAt && contract.expiresAt <= now
          ? 'EXPIRED'
          : params.reason;
      const closedAt =
        contract.startsAt && now < contract.startsAt ? contract.startsAt : now;
      await returnForceInTx(tx, contract, status, closedAt);
      const result = await tx.forceContract.findUniqueOrThrow({
        where: { id: contract.id },
      });
      await event(tx, {
        operationKey: params.operationId,
        contractId: contract.id,
        actorId: params.actorId,
        ...(contract.allianceId !== null
          ? { allianceId: contract.allianceId }
          : {}),
        action: status,
        kind: 'CLOSE',
        quantity: contract.survivingQuantity,
        command: params,
      });
      return result;
    }, ALLIANCE_BANK_TX_OPTIONS);
  }
}

/**
 * Combat integration primitive. Caller already holds the user's row lock and
 * supplies one battle-scoped operation ID. Does not lock/write the alliance,
 * avoiding inversion of treasury's alliance -> user lock order. Event attribution
 * links through contractId, not a new alliance FK acquired behind the user lock.
 */
export const applyForceCasualtiesInTx = async (
  tx: Tx,
  userId: number,
  contractId: number,
  killed: number,
  operationId: string,
  now: Date,
): Promise<ForceContract> => {
  idSchema.parse(userId);
  idSchema.parse(contractId);
  ForceQuantitySchema.parse(killed);
  operationSchema.parse(operationId);
  const command = { userId, contractId, killed };
  const prior = await replay(tx, operationId, 'CASUALTIES', command);
  const contract = await tx.forceContract.findFirstOrThrow({
    where: { id: contractId, userId },
  });
  if (prior) return contract;
  if (!isForceContractUsable(contract, now))
    throw new Error('Contract is no longer active');
  if (killed > contract.survivingQuantity)
    throw new Error('Casualties exceed surviving troops');
  const survivingQuantity = contract.survivingQuantity - killed;
  const result = await tx.forceContract.update({
    where: { id: contractId },
    data: {
      survivingQuantity,
      ...(survivingQuantity === 0
        ? { status: 'DEPLETED', closedAt: now, requestedExtensionDays: null }
        : {}),
    },
  });
  await event(tx, {
    operationKey: operationId,
    contractId,
    actorId: userId,
    action: 'CASUALTIES',
    kind: 'CASUALTIES',
    quantity: killed,
    command,
  });
  return result;
};
