import { beforeEach, describe, expect, test } from 'bun:test';
import { randomUUID } from 'crypto';

import { ItemTypes } from '@/constants/Items';
import prisma from '@/lib/prisma';
import {
  applyForceCasualtiesInTx,
  TemporaryForceLedgerService as Ledger,
} from '@/services/TemporaryForceLedger.service';
import { FORCE_DAY_MS } from '@/utils/temporaryForces';

import { resetDatabase } from './db';

let donorId: number;
let borrowerId: number;
let allianceId: number;
let roleId: number;
let unitId: number;
const equipment = [
  ...new Set(
    ItemTypes.filter((item) => item.usage === 'OFFENSE').map(
      (item) => item.type,
    ),
  ),
].map((type) => ({ type, level: 1 }));
const donate = (quantity = 10, operationId = randomUUID(), kit = equipment) =>
  Ledger.contribute({
    allianceId,
    userId: donorId,
    unitId,
    quantity,
    equipment: kit,
    operationId,
  });
const reserve = () =>
  prisma.forceReserve.findFirstOrThrow({ where: { allianceId } });
const loan = async (quantity: number, termDays = 7) =>
  Ledger.requestLoan({
    allianceId,
    userId: borrowerId,
    reserveId: (await reserve()).id,
    quantity,
    termDays,
    operationId: randomUUID(),
  });
const approve = (contractId: number) =>
  Ledger.approveLoan({
    contractId,
    actorId: donorId,
    operationId: randomUUID(),
  });
const recall = (contractId: number) =>
  Ledger.closeContract({
    contractId,
    actorId: donorId,
    reason: 'RECALLED',
    operationId: randomUUID(),
  });

beforeEach(async () => {
  await resetDatabase();
  const player = (name: string) =>
    prisma.users.create({
      data: {
        email: `${name}@example.test`,
        display_name: name,
        password_hash: 'synthetic',
        race: 'HUMAN',
        class: 'FIGHTER',
        locale: 'en',
        recruit_link: name,
        fort_level: 12,
      },
    });
  donorId = (await player('donor')).id;
  borrowerId = (await player('borrower')).id;
  const alliance = await prisma.alliances.create({
    data: {
      name: 'Reserve test',
      leader_id: donorId,
      alliance_roles: { create: { name: 'Member' } },
    },
    include: { alliance_roles: true },
  });
  allianceId = alliance.id;
  roleId = alliance.alliance_roles[0]!.id;
  await prisma.alliance_memberships.createMany({
    data: [donorId, borrowerId].map((user_id) => ({
      alliance_id: allianceId,
      user_id,
      role_id: roleId,
    })),
  });
  unitId = (
    await prisma.userUnit.create({
      data: { userId: donorId, type: 'OFFENSE', level: 1, quantity: 100 },
    })
  ).id;
  await prisma.userStructureUpgrade.create({
    data: { userId: donorId, type: 'ARMORY', level: 10 },
  });
  await prisma.userItem.createMany({
    data: equipment.map((item) => ({
      ...item,
      userId: donorId,
      usage: 'OFFENSE',
      quantity: 100,
    })),
  });
  await Ledger.savePolicy(allianceId, donorId, {});
});

describe('temporary force ownership ledger on PostgreSQL', () => {
  test('donation transfers existing troops and a full kit, updates stats, and prunes zero rows', async () => {
    const before = await prisma.users.findUniqueOrThrow({
      where: { id: donorId },
    });
    await donate();
    expect((await reserve()).available).toBe(10);
    expect(
      (await prisma.userUnit.findUniqueOrThrow({ where: { id: unitId } }))
        .quantity,
    ).toBe(90);
    expect(
      (await prisma.userItem.findMany({ where: { userId: donorId } })).every(
        (item) => item.quantity === 90,
      ),
    ).toBe(true);
    const afterPartial = await prisma.users.findUniqueOrThrow({
      where: { id: donorId },
    });
    expect(afterPartial.gold).toBe(before.gold);
    expect(afterPartial.offense).toBeGreaterThan(0);
    expect(
      await prisma.userUnit.count({
        where: { userId: donorId, type: 'CITIZEN' },
      }),
    ).toBe(0);
    await donate(90);
    expect(await prisma.userUnit.count({ where: { userId: donorId } })).toBe(0);
    expect(await prisma.userItem.count({ where: { userId: donorId } })).toBe(0);
    const afterFull = await prisma.users.findUniqueOrThrow({
      where: { id: donorId },
    });
    expect(afterFull.offense).toBe(0);
  });
  test('a missing final equipment slot rolls back earlier item debits and troop transfer', async () => {
    await prisma.userItem.deleteMany({
      where: { userId: donorId, type: 'WEAPON' },
    });
    await expect(donate()).rejects.toThrow('Insufficient equipment');
    expect(
      (await prisma.userItem.findMany({ where: { userId: donorId } })).every(
        (item) => item.quantity === 100,
      ),
    ).toBe(true);
    expect(
      (await prisma.userUnit.findUniqueOrThrow({ where: { id: unitId } }))
        .quantity,
    ).toBe(100);
    expect(await prisma.forceReserve.count()).toBe(0);
    expect(await prisma.forceEvent.count()).toBe(0);
  });
  test("rejects mercenaries, civilian transfers and another player's units", async () => {
    for (const data of [
      { type: 'OFFENSE' as const, isMercenary: true },
      { type: 'CITIZEN' as const, isMercenary: false },
    ]) {
      const unit = await prisma.userUnit.create({
        data: { userId: donorId, level: 1, quantity: 100, ...data },
      });
      await expect(
        Ledger.contribute({
          allianceId,
          userId: donorId,
          unitId: unit.id,
          quantity: 1,
          equipment,
          operationId: randomUUID(),
        }),
      ).rejects.toThrow();
    }
    await expect(
      Ledger.contribute({
        allianceId,
        userId: borrowerId,
        unitId,
        quantity: 1,
        equipment,
        operationId: randomUUID(),
      }),
    ).rejects.toThrow('Insufficient permanent');
    expect(await prisma.forceReserve.count()).toBe(0);
  });
  test('same operation can retry once regardless of loadout slot order, but terms cannot change', async () => {
    const operationId = randomUUID();
    await Promise.all([
      donate(10, operationId, equipment),
      donate(10, operationId, [...equipment].reverse()),
    ]);
    expect((await reserve()).available).toBe(10);
    await expect(donate(11, operationId)).rejects.toThrow('different terms');
    expect(await prisma.forceEvent.count()).toBe(1);
  });
  test('concurrent donations cannot overspend units or equipment', async () => {
    const results = await Promise.allSettled([donate(80), donate(80)]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect((await reserve()).available).toBe(80);
    expect(
      (await prisma.userUnit.findUniqueOrThrow({ where: { id: unitId } }))
        .quantity,
    ).toBe(20);
    expect(
      (await prisma.userItem.findMany({ where: { userId: donorId } })).every(
        (item) => item.quantity === 20,
      ),
    ).toBe(true);
  });
  test('requests do not consume stock; competing approvals cannot lend it twice', async () => {
    await donate();
    const requests = await Promise.all([loan(8), loan(8)]);
    expect((await reserve()).available).toBe(10);
    const results = await Promise.allSettled(
      requests.map((request) => approve(request.id)),
    );
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect((await reserve()).available).toBe(2);
    expect(
      await prisma.forceContract.count({ where: { status: 'ACTIVE' } }),
    ).toBe(1);
  });
  test('reserve capacity leaves room for outstanding loan survivors to return', async () => {
    await donate(20);
    const contract = await approve((await loan(8)).id);
    await prisma.forceReserve.update({
      where: { id: (await reserve()).id },
      data: { available: 999990 },
    });
    await expect(donate(3)).rejects.toThrow('capacity includes');
    expect(
      (await prisma.userUnit.findUniqueOrThrow({ where: { id: unitId } }))
        .quantity,
    ).toBe(80);
    expect(
      (await prisma.userItem.findMany({ where: { userId: donorId } })).every(
        (item) => item.quantity === 80,
      ),
    ).toBe(true);
    await recall(contract.id);
    expect((await reserve()).available).toBe(999998);
  });
  test('approvals require leadership, current membership, and current tier unlocks', async () => {
    await donate();
    const request = await loan(5);
    await expect(
      Ledger.approveLoan({
        contractId: request.id,
        actorId: borrowerId,
        operationId: randomUUID(),
      }),
    ).rejects.toThrow('leadership');
    await prisma.users.update({
      where: { id: borrowerId },
      data: { fort_level: 0 },
    });
    await expect(approve(request.id)).rejects.toThrow('not unlocked');
    await prisma.users.update({
      where: { id: borrowerId },
      data: { fort_level: 12 },
    });
    await prisma.alliance_memberships.deleteMany({
      where: { user_id: borrowerId },
    });
    await expect(approve(request.id)).rejects.toThrow('membership');
    expect((await reserve()).available).toBe(10);
  });
  test('casualties belong to their contract; repeated recall returns only survivors once', async () => {
    await donate(20);
    const pending = await loan(4);
    await expect(recall(pending.id)).rejects.toThrow('not active');
    const first = await approve((await loan(8)).id);
    const second = await approve((await loan(8)).id);
    const operationId = randomUUID();
    const casualties = () =>
      prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${borrowerId} FOR UPDATE`;
        return applyForceCasualtiesInTx(
          tx,
          borrowerId,
          first.id,
          3,
          operationId,
          new Date(),
        );
      });
    await Promise.all([casualties(), casualties()]);
    expect(
      (
        await prisma.forceContract.findUniqueOrThrow({
          where: { id: second.id },
        })
      ).survivingQuantity,
    ).toBe(8);
    await Promise.all([recall(first.id), recall(first.id)]);
    expect((await reserve()).available).toBe(9); // 20 - 8 - 8 + 5
    expect(
      (await prisma.userUnit.findUniqueOrThrow({ where: { id: unitId } }))
        .quantity,
    ).toBe(80);
    expect(
      await prisma.forceEvent.count({
        where: { contractId: first.id, action: 'RECALLED' },
      }),
    ).toBe(1);
  });
  test('expired contracts cannot take casualties; expiry returns the loan without gold refund', async () => {
    await donate();
    const contract = await approve((await loan(6)).id);
    const yesterday = new Date(Date.now() - FORCE_DAY_MS);
    await prisma.forceContract.update({
      where: { id: contract.id },
      data: {
        startsAt: new Date(yesterday.getTime() - FORCE_DAY_MS),
        expiresAt: yesterday,
      },
    });
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${borrowerId} FOR UPDATE`;
        return applyForceCasualtiesInTx(
          tx,
          borrowerId,
          contract.id,
          1,
          randomUUID(),
          new Date(),
        );
      }),
    ).rejects.toThrow('no longer active');
    await Ledger.closeContract({
      contractId: contract.id,
      actorId: borrowerId,
      reason: 'EXPIRED',
      operationId: randomUUID(),
    });
    expect((await reserve()).available).toBe(10);
  });
  test('recall racing combat either returns pre-battle stock or exact survivors, never both', async () => {
    await donate();
    const contract = await approve((await loan(6)).id);
    const outcomes = await Promise.allSettled([
      prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${borrowerId} FOR UPDATE`;
        return applyForceCasualtiesInTx(
          tx,
          borrowerId,
          contract.id,
          2,
          randomUUID(),
          new Date(),
        );
      }),
      recall(contract.id),
    ]);
    expect(outcomes[1].status).toBe('fulfilled');
    const losses = await prisma.forceEvent.aggregate({
      where: { contractId: contract.id, action: 'CASUALTIES' },
      _sum: { quantity: true },
    });
    expect((await reserve()).available + (losses._sum.quantity ?? 0)).toBe(10);
  });
  test('mercenary expiry discards survivors without crediting a reserve, gold, citizens or gear', async () => {
    const before = await prisma.users.findUniqueOrThrow({
      where: { id: borrowerId },
    });
    const yesterday = new Date(Date.now() - FORCE_DAY_MS);
    const contract = await prisma.forceContract.create({
      data: {
        kind: 'MERCENARY',
        status: 'ACTIVE',
        userId: borrowerId,
        type: 'OFFENSE',
        level: 1,
        equipment,
        initialQuantity: 10,
        survivingQuantity: 7,
        termDays: 1,
        startsAt: new Date(yesterday.getTime() - FORCE_DAY_MS),
        expiresAt: yesterday,
      },
    });
    await Ledger.closeContract({
      contractId: contract.id,
      actorId: borrowerId,
      reason: 'EXPIRED',
      operationId: randomUUID(),
    });
    const after = await prisma.users.findUniqueOrThrow({
      where: { id: borrowerId },
    });
    expect(after.gold).toBe(before.gold);
    expect(await prisma.forceReserve.count()).toBe(0);
    expect(await prisma.userUnit.count({ where: { userId: borrowerId } })).toBe(
      0,
    );
    expect(await prisma.userItem.count({ where: { userId: borrowerId } })).toBe(
      0,
    );
    expect(
      (
        await prisma.forceContract.findUniqueOrThrow({
          where: { id: contract.id },
        })
      ).status,
    ).toBe('EXPIRED');
  });
  test('database rejects negative stock, missing expiry and mismatched alliance ownership', async () => {
    await donate();
    const request = await loan(5);
    // Prisma promises are lazy thenables; normalize before Bun's rejects matcher.
    const rejects = async (operation: PromiseLike<unknown>) => {
      await expect(Promise.resolve(operation)).rejects.toThrow();
    };
    await rejects(
      prisma.forceReserve.update({
        where: { id: (await reserve()).id },
        data: { available: -1 },
      }),
    );
    await rejects(
      prisma.forceContract.update({
        where: { id: request.id },
        data: { status: 'ACTIVE', startsAt: new Date(), expiresAt: null },
      }),
    );
    await rejects(
      prisma.forceContract.update({
        where: { id: request.id },
        data: { allianceId: null },
      }),
    );
    await rejects(
      prisma.forceContract.update({
        where: { id: request.id },
        data: { policyVersion: null },
      }),
    );
    await rejects(
      prisma.forceContract.update({
        where: { id: request.id },
        data: { survivingQuantity: 6 },
      }),
    );
    await rejects(
      prisma.forceContract.update({
        where: { id: request.id },
        data: { policyVersion: 999 },
      }),
    );
  });
  test('automatic lending requires a role allowance and activates within its limits', async () => {
    await donate();
    await Ledger.savePolicy(allianceId, donorId, {
      lendingMode: 'ROLE_ALLOWANCE',
    });
    await expect(loan(5)).rejects.toThrow('No automatic lending allowance');
    expect(await prisma.forceContract.count()).toBe(0);
    expect((await reserve()).available).toBe(10);
    await Ledger.savePolicy(allianceId, donorId, {
      lendingMode: 'ROLE_ALLOWANCE',
      roleAllowances: [
        {
          roleId,
          maxBorrowed: 10,
          maxTermDays: 7,
          pillageRateBps: 0,
          loanRateBps: 0,
        },
      ],
    });
    const active = await loan(5);
    expect(active.status).toBe('ACTIVE');
    expect((await reserve()).available).toBe(5);
    await expect(loan(6)).rejects.toThrow();
  });
  test('switching to automatic mode cannot activate a pending manual request', async () => {
    await donate();
    const request = await loan(5);
    await Ledger.savePolicy(allianceId, donorId, {
      lendingMode: 'ROLE_ALLOWANCE',
    });
    await expect(approve(request.id)).rejects.toThrow(
      'Manual request approval is unavailable',
    );
    expect(
      (
        await prisma.forceContract.findUniqueOrThrow({
          where: { id: request.id },
        })
      ).status,
    ).toBe('REQUESTED');
    expect((await reserve()).available).toBe(10);
    // Manual approval works again without rewriting accepted price/rate terms.
    await Ledger.savePolicy(allianceId, donorId, {});
    await approve(request.id);
    expect((await reserve()).available).toBe(5);
  });
  test('manual activation also rejects an automatic request-time policy snapshot', async () => {
    await donate();
    const request = await loan(5);
    // Exercise the stored-policy guard without enabling any automatic route.
    await prisma.allianceForcePolicy.update({
      where: {
        allianceId_version: { allianceId, version: request.policyVersion },
      },
      data: { settings: { lendingMode: 'ROLE_ALLOWANCE' } },
    });
    await Ledger.savePolicy(allianceId, donorId, {});
    await expect(approve(request.id)).rejects.toThrow(
      'Manual request approval is unavailable',
    );
    expect((await reserve()).available).toBe(10);
  });
  test('role changes recheck accepted role limits without rewriting the quoted rate', async () => {
    await donate();
    const restrictedRole = await prisma.alliance_roles.create({
      data: { alliance_id: allianceId, name: 'Restricted' },
    });
    await Ledger.savePolicy(allianceId, donorId, {
      roleAllowances: [
        {
          roleId,
          maxBorrowed: 10,
          maxTermDays: 7,
          pillageRateBps: 0,
          loanRateBps: 200,
        },
        {
          roleId: restrictedRole.id,
          maxBorrowed: 0,
          maxTermDays: 7,
          pillageRateBps: 0,
          loanRateBps: 500,
        },
      ],
    });
    const request = await loan(5);
    await prisma.alliance_memberships.update({
      where: {
        unique_alliance_user: { alliance_id: allianceId, user_id: borrowerId },
      },
      data: { role_id: restrictedRole.id },
    });
    await expect(approve(request.id)).rejects.toThrow(
      'Borrowing limit exceeded',
    );
    const unchanged = await prisma.forceContract.findUniqueOrThrow({
      where: { id: request.id },
    });
    expect(unchanged.pillageRateBps).toBe(200);
    expect(unchanged.status).toBe('REQUESTED');
    expect((await reserve()).available).toBe(10);
  });
  test('policy updates append versions, enforce role caps, and preserve accepted contract terms', async () => {
    await donate(20);
    const request = await loan(5);
    await Ledger.savePolicy(allianceId, donorId, {});
    expect(await prisma.allianceForcePolicy.count()).toBe(1);
    await Ledger.savePolicy(allianceId, donorId, {
      roleAllowances: [
        {
          roleId,
          maxBorrowed: 6,
          maxTermDays: 5,
          pillageRateBps: 0,
          loanRateBps: 200,
        },
      ],
      enforcement: { suspendOverdue: true },
    });
    expect(await prisma.allianceForcePolicy.count()).toBe(2);
    expect(
      (
        await prisma.forceContract.findUniqueOrThrow({
          where: { id: request.id },
        })
      ).policyVersion,
    ).toBe(1);
    await expect(loan(5, 7)).rejects.toThrow('Loan term exceeds');
    await expect(loan(7, 5)).rejects.toThrow('Borrowing limit exceeded');
    const cappedFirst = await loan(4, 5);
    const cappedSecond = await loan(4, 5);
    await approve(cappedFirst.id);
    await expect(approve(cappedSecond.id)).rejects.toThrow(
      'Borrowing limit exceeded',
    );
    await expect(Ledger.savePolicy(allianceId, borrowerId, {})).rejects.toThrow(
      'leadership',
    );
    await expect(
      Ledger.savePolicy(allianceId, donorId, {
        roleAllowances: [
          {
            roleId: 999,
            maxBorrowed: 10,
            maxTermDays: 7,
            pillageRateBps: 0,
            loanRateBps: 100,
          },
        ],
      }),
    ).rejects.toThrow('does not belong');
  });
});
