import { createHash } from 'crypto';
import { z } from 'zod';

import { ItemTypes, UnitTypes } from '@/constants';
import {
  getRequiredEconomyUpgradeName,
  hasFeature,
} from '@/constants/FeatureUnlocks';
import {
  ARMY_DESERTION_MORALE_THRESHOLD,
  KINGDOM_MORALE_DEFAULT,
  MERCENARY_REFUSAL_MESSAGE,
} from '@/constants/KingdomMorale';
import prisma from '@/lib/prisma';
import type { ForceContract, Prisma, UserUnit } from '@/lib/prisma-exports';
import { returnForceInTx } from '@/services/ForceLifecycle.service';
import { lockEraLifecycleShared } from '@/utils/eraLifecycleLock';
import {
  assertForceTierUnlocked,
  forceExpiration,
  ForceRoleSchema,
  MERCENARY_ARMY_SHARE_PERCENT,
  MERCENARY_ROLE_CAP,
  mercenaryShareCap,
  mercenaryTierFeatureKey,
  parseForceLoadout,
} from '@/utils/temporaryForces';

const terms = z.union([z.literal(1), z.literal(3), z.literal(7)]);
const hireSchema = z
  .object({
    userId: z.number().int().positive(),
    type: ForceRoleSchema,
    level: z.number().int().min(1).max(3),
    quantity: z.number().int().min(1).max(MERCENARY_ROLE_CAP),
    termDays: terms,
    operationId: z.string().uuid(),
  })
  .strict();
const changeSchema = z
  .object({
    userId: z.number().int().positive(),
    contractId: z.number().int().positive(),
    operationId: z.string().uuid(),
    termDays: terms.optional(),
  })
  .strict();
type Tx = Prisma.TransactionClient;
export type ContractUnit = UserUnit & {
  forceContractId: number;
  forceKind: 'MERCENARY' | 'ALLIANCE';
  forceEquipment: Array<{ type: string; level: number }>;
};
export type ForceWound = { forceContractId?: number; quantity?: number };

export function mercenaryOffer(
  type: z.infer<typeof ForceRoleSchema>,
  level: number,
) {
  const unit = UnitTypes.find((u) => u.type === type && u.level === level);
  if (!unit) throw new Error('Invalid mercenary tier');
  const items = ItemTypes.filter(
    (item) =>
      item.usage === type && item.level === level && item.race === 'ALL',
  );
  const equipment = parseForceLoadout(
    type,
    items.map(({ type: slot, level: tier }) => ({ type: slot, level: tier })),
  );
  const kitCost = items.reduce((sum, item) => sum + item.cost, 0);
  return {
    type,
    level,
    name: unit.name,
    fortLevel: unit.fortLevel,
    equipment,
    mobilization: BigInt(Math.ceil(unit.cost * 1.25)),
    dailyPrice: BigInt(Math.ceil((unit.cost + kitCost) * 0.05)),
  };
}

/** Project contracts without ever materializing them as permanent UserUnit rows. */
export function contractRoster(
  contracts: ForceContract[],
  wounded: unknown,
  now = new Date(),
): ContractUnit[] {
  const wounds = Array.isArray(wounded) ? (wounded as ForceWound[]) : [];
  return contracts
    .filter(
      (c) =>
        c.status === 'ACTIVE' &&
        c.startsAt &&
        c.startsAt <= now &&
        c.expiresAt &&
        c.expiresAt > now,
    )
    .map((c) => ({
      id: -c.id,
      userId: c.userId,
      type: c.type,
      level: c.level,
      quantity: Math.max(
        0,
        c.survivingQuantity -
          wounds
            .filter((w) => w.forceContractId === c.id)
            .reduce((sum, w) => sum + Number(w.quantity ?? 0), 0),
      ),
      isMercenary: true,
      forceContractId: c.id,
      forceKind: c.kind,
      forceEquipment: parseForceLoadout(
        ForceRoleSchema.parse(c.type),
        c.equipment,
      ).map((item) => ({ type: item.type!, level: item.level! })),
    }));
}

async function operation(tx: Tx, key: string, command: unknown) {
  const hash = createHash('sha256')
    .update(JSON.stringify(command))
    .digest('hex');
  const prior = await tx.forceEvent.findUnique({
    where: { operationKey: key },
  });
  if (prior && (prior.details as { commandHash?: string }).commandHash !== hash)
    throw new Error('Operation ID already used for different terms');
  return { hash, prior };
}

/** Hiring and renewal need the hall, plus the tier's economy upgrade. */
function assertMercenaryUnlocked(level: number, economyLevel: number) {
  const key = mercenaryTierFeatureKey(level);
  if (hasFeature({ economyLevel, fortLevel: 0 }, key)) return;
  const upgrade = getRequiredEconomyUpgradeName(key);
  throw new Error(
    level === 1
      ? `Mercenaries unlock with the ${upgrade}`
      : `Mercenary tier ${level} unlocks with the ${upgrade}`,
  );
}

/** Own trained army (citizens and workers excluded) and surviving mercenaries. */
async function armyShareInTx(
  tx: Tx,
  userId: number,
  eraId: number | null,
  now: Date,
) {
  const [trained, active] = await Promise.all([
    tx.userUnit.aggregate({
      where: {
        userId,
        isMercenary: false,
        type: { in: ['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'] },
      },
      _sum: { quantity: true },
    }),
    tx.forceContract.aggregate({
      where: {
        userId,
        eraId: eraId ?? undefined,
        kind: 'MERCENARY',
        status: 'ACTIVE',
        expiresAt: { gt: now },
      },
      _sum: { survivingQuantity: true },
    }),
  ]);
  const trainedUnits = trained._sum.quantity ?? 0;
  return {
    trainedUnits,
    mercenaries: active._sum.survivingQuantity ?? 0,
    allowed: mercenaryShareCap(trainedUnits),
  };
}

export class MercenaryService {
  static async expireInTx(tx: Tx, userId: number, now = new Date()) {
    const expired = await tx.forceContract.findMany({
      where: {
        userId,
        kind: 'MERCENARY',
        status: 'ACTIVE',
        expiresAt: { lte: now },
      },
    });
    for (const contract of expired) {
      await tx.forceContract.update({
        where: { id: contract.id },
        data: {
          status: 'EXPIRED',
          closedAt: now,
          requestedExtensionDays: null,
        },
      });
      await tx.forceEvent.create({
        data: {
          operationKey: `mercenary-expiry:${contract.id}`,
          contractId: contract.id,
          action: 'EXPIRED',
          quantity: contract.survivingQuantity,
          details: { reason: 'contract elapsed' },
        },
      });
    }
  }

  static async list(userId: number) {
    const user = await prisma.users.findUniqueOrThrow({
      where: { id: userId },
      select: { currentEraId: true, wounded_units: true },
    });
    const contracts = await prisma.forceContract.findMany({
      where: {
        userId,
        eraId: user.currentEraId,
        kind: 'MERCENARY',
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
      orderBy: { expiresAt: 'asc' },
    });
    const wounds = Array.isArray(user.wounded_units)
      ? (user.wounded_units as ForceWound[])
      : [];
    return contracts.map((contract) => ({
      ...contract,
      woundedQuantity: Math.min(
        contract.survivingQuantity,
        wounds
          .filter((wound) => wound.forceContractId === contract.id)
          .reduce((sum, wound) => sum + Number(wound.quantity ?? 0), 0),
      ),
    }));
  }

  /** Army-share totals for the barracks header; mirrors the hire-time check. */
  static async armyShare(userId: number, now = new Date()) {
    const user = await prisma.users.findUniqueOrThrow({
      where: { id: userId },
      select: { currentEraId: true },
    });
    return armyShareInTx(prisma, userId, user.currentEraId, now);
  }

  static async hire(input: z.input<typeof hireSchema>, now = new Date()) {
    const command = hireSchema.parse(input);
    return prisma.$transaction(async (tx) => {
      await lockEraLifecycleShared(tx);
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${command.userId} FOR UPDATE`;
      const { hash, prior } = await operation(tx, command.operationId, {
        action: 'HIRE',
        ...command,
      });
      if (prior)
        return tx.forceContract.findUniqueOrThrow({
          where: { id: prior.contractId! },
        });
      const user = await tx.users.findUniqueOrThrow({
        where: { id: command.userId },
      });
      const era = await tx.era.findFirst({
        where: { endDate: null },
        orderBy: { id: 'desc' },
        select: { id: true },
      });
      if (era && user.currentEraId !== era.id)
        throw new Error('Current era participation is required');
      // Mercenaries refuse a demoralised kingdom (#205).
      if (
        Number(user.kingdom_morale ?? KINGDOM_MORALE_DEFAULT) <
        ARMY_DESERTION_MORALE_THRESHOLD
      )
        throw new Error(MERCENARY_REFUSAL_MESSAGE);
      assertForceTierUnlocked(command.type, command.level, user.fort_level);
      assertMercenaryUnlocked(command.level, user.economy_level);
      const active = await tx.forceContract.aggregate({
        where: {
          userId: user.id,
          eraId: user.currentEraId,
          kind: 'MERCENARY',
          type: command.type,
          status: 'ACTIVE',
          expiresAt: { gt: now },
        },
        _sum: { survivingQuantity: true },
      });
      if (
        (active._sum.survivingQuantity ?? 0) + command.quantity >
        MERCENARY_ROLE_CAP
      )
        throw new Error('Maximum 100 mercenaries per role');
      const share = await armyShareInTx(tx, user.id, user.currentEraId, now);
      if (share.mercenaries + command.quantity > share.allowed)
        throw new Error(
          `Mercenary limit reached: contracts may cover at most ${MERCENARY_ARMY_SHARE_PERCENT}% of your trained army (${share.allowed} allowed)`,
        );
      const offer = mercenaryOffer(command.type, command.level);
      const cost =
        BigInt(command.quantity) *
        (offer.mobilization + BigInt(command.termDays) * offer.dailyPrice);
      if (user.gold < cost) throw new Error('Insufficient gold');
      const contract = await tx.forceContract.create({
        data: {
          kind: 'MERCENARY',
          status: 'ACTIVE',
          userId: user.id,
          eraId: user.currentEraId,
          type: command.type,
          level: command.level,
          equipment: offer.equipment,
          initialQuantity: command.quantity,
          survivingQuantity: command.quantity,
          termDays: command.termDays,
          startsAt: now,
          expiresAt: forceExpiration(now, command.termDays),
          unitPriceGold: offer.dailyPrice,
        },
      });
      await tx.users.update({
        where: { id: user.id },
        data: { gold: { decrement: cost } },
      });
      await tx.forceEvent.create({
        data: {
          operationKey: command.operationId,
          contractId: contract.id,
          actorId: user.id,
          action: 'HIRE',
          quantity: command.quantity,
          gold: cost,
          details: { commandHash: hash },
        },
      });
      return contract;
    });
  }

  static async change(input: z.input<typeof changeSchema>, now = new Date()) {
    const command = changeSchema.parse(input);
    return prisma.$transaction(async (tx) => {
      await lockEraLifecycleShared(tx);
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${command.userId} FOR UPDATE`;
      const { hash, prior } = await operation(tx, command.operationId, {
        action: command.termDays ? 'RENEW' : 'DISMISS',
        ...command,
      });
      if (prior)
        return tx.forceContract.findUniqueOrThrow({
          where: { id: prior.contractId! },
        });
      const owner = await tx.users.findUniqueOrThrow({
        where: { id: command.userId },
        select: {
          currentEraId: true,
          economy_level: true,
          kingdom_morale: true,
        },
      });
      const contract = await tx.forceContract.findFirst({
        where: {
          id: command.contractId,
          userId: command.userId,
          kind: 'MERCENARY',
          eraId: owner.currentEraId,
        },
      });
      if (
        !contract ||
        contract.status !== 'ACTIVE' ||
        !contract.expiresAt ||
        contract.expiresAt <= now
      )
        throw new Error('Contract is no longer active');
      // Dismissal stays available even when the feature is locked again.
      if (command.termDays)
        assertMercenaryUnlocked(contract.level, owner.economy_level);
      // Renewals are refused below the desertion threshold (#205); dismissals stay open.
      if (
        command.termDays &&
        Number(owner.kingdom_morale ?? KINGDOM_MORALE_DEFAULT) <
          ARMY_DESERTION_MORALE_THRESHOLD
      )
        throw new Error(MERCENARY_REFUSAL_MESSAGE);
      let gold = 0n;
      let updated: ForceContract;
      if (command.termDays) {
        const expiresAt = forceExpiration(contract.expiresAt, command.termDays);
        if (expiresAt.getTime() > now.getTime() + 30 * 86400000)
          throw new Error('Contract cannot extend beyond 30 days');
        gold =
          contract.unitPriceGold *
          BigInt(contract.survivingQuantity) *
          BigInt(command.termDays);
        const paid = await tx.users.updateMany({
          where: { id: command.userId, gold: { gte: gold } },
          data: { gold: { decrement: gold } },
        });
        if (paid.count !== 1) throw new Error('Insufficient gold');
        updated = await tx.forceContract.update({
          where: { id: contract.id },
          data: { expiresAt },
        });
      } else {
        await returnForceInTx(tx, contract, 'DISMISSED', now);
        updated = await tx.forceContract.findUniqueOrThrow({
          where: { id: contract.id },
        });
      }
      await tx.forceEvent.create({
        data: {
          operationKey: command.operationId,
          contractId: contract.id,
          actorId: command.userId,
          action: command.termDays ? 'RENEW' : 'DISMISS',
          gold,
          details: { commandHash: hash },
        },
      });
      return updated;
    });
  }
}
