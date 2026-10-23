import { beforeEach, describe, expect, test } from 'bun:test';
import { randomUUID } from 'crypto';

import { ItemTypes } from '@/constants';
import prisma from '@/lib/prisma';
import { AllianceService } from '@/services/Alliance.service';
import { extendAllianceForce } from '@/services/AllianceForceExtension.service';
import { AttackService } from '@/services/AttackService';
import {
  createForceLevy,
  designateForceCollection,
  payForceDues,
  saveForceDuesRule,
} from '@/services/ForceDues.service';
import { processForceDuesDay } from '@/services/ForceDuesWorker.service';
import {
  divertForcePillageInTx,
  settleForcePillageInTx,
} from '@/services/ForcePillage.service';
import { processTemporaryForces } from '@/services/ForceWorker.service';
import { TemporaryForceLedgerService as Ledger } from '@/services/TemporaryForceLedger.service';
import { createUser } from '@/services/User.service';

import { resetDatabase } from './db';

let leaderId: number;
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
const allowance = (extra = {}) => ({
  roleId,
  maxBorrowed: 100,
  maxTermDays: 7,
  pillageRateBps: 200,
  loanRateBps: 500,
  ...extra,
});
const policy = (extra = {}) =>
  Ledger.savePolicy(allianceId, leaderId, {
    roleAllowances: [allowance()],
    ...extra,
  });
const reserve = () =>
  prisma.forceReserve.findFirstOrThrow({ where: { allianceId } });
const loan = async (quantity = 8, termDays = 1) =>
  Ledger.requestLoan({
    allianceId,
    userId: borrowerId,
    reserveId: (await reserve()).id,
    quantity,
    termDays,
    operationId: randomUUID(),
  });
const levy = async (terms: {
  amountGold: string;
  quantity: number;
  type: 'OFFENSE' | null;
  level: number | null;
}) => {
  await createForceLevy(allianceId, leaderId, {
    title: 'Campaign levy',
    userIds: [borrowerId],
    dueAt: new Date(Date.now() + 86400000).toISOString(),
    terms,
    operationId: randomUUID(),
  });
  return prisma.forceObligation.findFirstOrThrow({
    where: { userId: borrowerId },
    orderBy: { id: 'desc' },
  });
};
beforeEach(async () => {
  await resetDatabase();
  leaderId = (
    await createUser(
      'force-leader@example.test',
      'synthetic',
      'Force leader',
      'HUMAN',
      'FIGHTER',
    )
  ).id;
  borrowerId = (
    await createUser(
      'force-member@example.test',
      'synthetic',
      'Force member',
      'HUMAN',
      'FIGHTER',
    )
  ).id;
  for (const userId of [leaderId, borrowerId]) {
    await prisma.users.update({
      where: { id: userId },
      data: { fort_level: 12, gold: 100000000n },
    });
    await prisma.userStructureUpgrade.updateMany({
      where: { userId, type: 'ARMORY' },
      data: { level: 12 },
    });
    await prisma.userUnit.updateMany({
      where: { userId, type: 'OFFENSE', level: 1 },
      data: { quantity: 100 },
    });
    for (const item of equipment)
      await prisma.userItem.upsert({
        where: {
          userId_type_usage_level: {
            userId,
            type: item.type,
            level: 1,
            usage: 'OFFENSE',
          },
        },
        create: {
          userId,
          type: item.type,
          level: 1,
          usage: 'OFFENSE',
          quantity: 100,
        },
        update: { quantity: 100 },
      });
  }
  unitId = (
    await prisma.userUnit.findFirstOrThrow({
      where: { userId: borrowerId, type: 'OFFENSE' },
    })
  ).id;
  const alliance = await prisma.alliances.create({
    data: {
      name: 'Gameplay alliance',
      leader_id: leaderId,
      alliance_roles: { create: { name: 'Member' } },
    },
    include: { alliance_roles: true },
  });
  allianceId = alliance.id;
  roleId = alliance.alliance_roles[0]!.id;
  await prisma.alliance_memberships.createMany({
    data: [leaderId, borrowerId].map((user_id) => ({
      alliance_id: allianceId,
      user_id,
      role_id: roleId,
    })),
  });
  await policy();
  const donorUnit = await prisma.userUnit.findFirstOrThrow({
    where: { userId: leaderId, type: 'OFFENSE' },
  });
  await Ledger.contribute({
    allianceId,
    userId: leaderId,
    unitId: donorUnit.id,
    quantity: 10,
    equipment,
    operationId: randomUUID(),
  });
});

describe('alliance troop gameplay', () => {
  test('automatic loans fight, forbid attacks on source members, and recall returns wounds without healing them', async () => {
    await policy({ lendingMode: 'ROLE_ALLOWANCE' });
    const contract = await loan();
    expect(contract.status).toBe('ACTIVE');
    const turns = (
      await prisma.users.findUniqueOrThrow({ where: { id: borrowerId } })
    ).attack_turns;
    const attack = await AttackService.executeAttack(borrowerId, leaderId, 1);
    expect(attack).toMatchObject({
      status: 'failed',
      code: 'ALLIANCE_FORCE_TARGET_FORBIDDEN',
    });
    expect(
      (await prisma.users.findUniqueOrThrow({ where: { id: borrowerId } }))
        .attack_turns,
    ).toBe(turns);
    await prisma.users.update({
      where: { id: borrowerId },
      data: {
        wounded_units: [
          {
            type: 'OFFENSE',
            level: 1,
            quantity: 2,
            isMercenary: true,
            forceContractId: contract.id,
          },
        ],
      },
    });
    await Ledger.closeContract({
      contractId: contract.id,
      actorId: leaderId,
      reason: 'RECALLED',
      operationId: randomUUID(),
    });
    expect(await reserve()).toMatchObject({ available: 8, woundedQuantity: 2 });
    await processTemporaryForces(new Date(Date.now() + 2 * 86400000));
    expect(await reserve()).toMatchObject({ available: 9, woundedQuantity: 1 });
  });
  test('manual extensions need a matching leadership approval, then leaving immediately returns survivors', async () => {
    const request = await loan();
    await Ledger.approveLoan({
      contractId: request.id,
      actorId: leaderId,
      operationId: randomUUID(),
    });
    const original = await prisma.forceContract.findUniqueOrThrow({
      where: { id: request.id },
    });
    const pending = await extendAllianceForce({
      contractId: request.id,
      actorId: borrowerId,
      days: 1,
      operationId: randomUUID(),
    });
    expect(pending.expiresAt).toEqual(original.expiresAt);
    expect(pending.requestedExtensionDays).toBe(1);
    const extended = await extendAllianceForce({
      contractId: request.id,
      actorId: leaderId,
      days: 1,
      approve: true,
      operationId: randomUUID(),
    });
    expect(extended.expiresAt!.getTime()).toBe(
      original.expiresAt!.getTime() + 86400000,
    );
    await AllianceService.leaveAlliance(borrowerId, { allianceId });
    expect((await reserve()).available).toBe(10);
    expect(
      (
        await prisma.forceContract.findUniqueOrThrow({
          where: { id: request.id },
        })
      ).status,
    ).toBe('RECALLED');
  });
  test('partial manual gold and equipped-unit payments are atomic and idempotent', async () => {
    const due = await levy({
      amountGold: '1000',
      quantity: 0,
      type: null,
      level: null,
    });
    const command = {
      obligationId: due.id,
      amountGold: '400',
      quantity: 0,
      operationId: randomUUID(),
    };
    await payForceDues(allianceId, borrowerId, command);
    await payForceDues(allianceId, borrowerId, command);
    expect(
      (
        await prisma.forceObligation.findUniqueOrThrow({
          where: { id: due.id },
        })
      ).paidGold,
    ).toBe(400n);
    expect(
      (await prisma.alliances.findUniqueOrThrow({ where: { id: allianceId } }))
        .gold_in_bank,
    ).toBe(400n);
    await expect(
      payForceDues(allianceId, leaderId, {
        ...command,
        operationId: randomUUID(),
      }),
    ).rejects.toThrow('another player');
    const troops = await levy({
      amountGold: '0',
      quantity: 5,
      type: 'OFFENSE',
      level: 1,
    });
    await payForceDues(allianceId, borrowerId, {
      obligationId: troops.id,
      amountGold: '0',
      quantity: 3,
      unitId,
      equipment,
      operationId: randomUUID(),
    });
    expect(
      (await prisma.userUnit.findUniqueOrThrow({ where: { id: unitId } }))
        .quantity,
    ).toBe(97);
    expect((await reserve()).available).toBe(13);
    expect(
      (
        await prisma.forceObligation.findUniqueOrThrow({
          where: { id: troops.id },
        })
      ).paidQuantity,
    ).toBe(3);
  });
  test('daily collection uses only on-hand gold, assesses one fine and suspends overdue borrowing', async () => {
    await policy({
      lendingMode: 'ROLE_ALLOWANCE',
      enforcement: {
        suspendOverdue: true,
        autoCollectAfterDays: 2,
        fineGold: '100',
        expelAfterDays: 7,
      },
    });
    const due = await levy({
      amountGold: '1000',
      quantity: 0,
      type: null,
      level: null,
    });
    await prisma.forceObligation.update({
      where: { id: due.id },
      data: { dueAt: new Date(Date.now() - 4 * 86400000) },
    });
    await prisma.users.update({
      where: { id: borrowerId },
      data: { gold: 400n, gold_in_bank: 1000000n },
    });
    await processForceDuesDay();
    await processForceDuesDay();
    expect(
      await prisma.forceObligation.findUniqueOrThrow({ where: { id: due.id } }),
    ).toMatchObject({ paidGold: 400n, fineGold: 100n, paidFineGold: 0n });
    expect(
      (await prisma.users.findUniqueOrThrow({ where: { id: borrowerId } }))
        .gold_in_bank,
    ).toBe(1000000n);
    await expect(loan(1)).rejects.toThrow('suspended');
    await prisma.users.update({
      where: { id: borrowerId },
      data: { gold: 1000n },
    });
    await processForceDuesDay(new Date(Date.now() + 86400000));
    expect(
      await prisma.forceObligation.findUniqueOrThrow({ where: { id: due.id } }),
    ).toMatchObject({ paidGold: 1000n, fineGold: 100n, paidFineGold: 100n });
    expect((await loan(1)).status).toBe('ACTIVE');
  });
  test('automatic troop collection requires a designated eligible stack and owned full kit', async () => {
    await policy({ enforcement: { autoCollectAfterDays: 1 } });
    const due = await levy({
      amountGold: '0',
      quantity: 5,
      type: 'OFFENSE',
      level: 1,
    });
    await prisma.forceObligation.update({
      where: { id: due.id },
      data: { dueAt: new Date(Date.now() - 3 * 86400000) },
    });
    await processForceDuesDay();
    expect(
      (
        await prisma.forceObligation.findUniqueOrThrow({
          where: { id: due.id },
        })
      ).paidQuantity,
    ).toBe(0);
    await designateForceCollection(
      allianceId,
      borrowerId,
      due.id,
      unitId,
      equipment,
    );
    await processForceDuesDay(new Date(Date.now() + 86400000));
    expect(
      (
        await prisma.forceObligation.findUniqueOrThrow({
          where: { id: due.id },
        })
      ).paidQuantity,
    ).toBe(5);
    expect((await reserve()).available).toBe(15);
  });
  test('configured expulsion returns loans, cancels remaining dues and never starts an attack', async () => {
    await policy({
      lendingMode: 'ROLE_ALLOWANCE',
      enforcement: {
        autoCollectAfterDays: 1,
        fineGold: '100',
        expelAfterDays: 3,
      },
    });
    const contract = await loan();
    const due = await levy({
      amountGold: '1000',
      quantity: 0,
      type: null,
      level: null,
    });
    await prisma.forceObligation.update({
      where: { id: due.id },
      data: { dueAt: new Date(Date.now() - 5 * 86400000) },
    });
    await prisma.users.update({
      where: { id: borrowerId },
      data: { gold: 0n },
    });
    await processForceDuesDay();
    expect(
      await prisma.alliance_memberships.count({
        where: { alliance_id: allianceId, user_id: borrowerId },
      }),
    ).toBe(0);
    expect(
      (
        await prisma.forceContract.findUniqueOrThrow({
          where: { id: contract.id },
        })
      ).status,
    ).toBe('RECALLED');
    expect((await reserve()).available).toBe(10);
    expect(
      (
        await prisma.forceObligation.findUniqueOrThrow({
          where: { id: due.id },
        })
      ).cancelledAt,
    ).not.toBeNull();
    expect(await prisma.attack_log.count()).toBe(0);
  });
  test('recurring rules issue once per period and select the highest qualifying player-level rule', async () => {
    await saveForceDuesRule(allianceId, leaderId, {
      roleId,
      minLevel: 1,
      terms: { amountGold: '100', quantity: 0, type: null, level: null },
      intervalDays: 7,
      dueDays: 3,
      enabled: true,
    });
    await saveForceDuesRule(allianceId, leaderId, {
      roleId,
      minLevel: 999,
      terms: { amountGold: '900', quantity: 0, type: null, level: null },
      intervalDays: 7,
      dueDays: 3,
      enabled: true,
    });
    await processForceDuesDay();
    await processForceDuesDay();
    expect(await prisma.forceObligation.count()).toBe(2);
    expect(
      (await prisma.forceObligation.findMany()).every(
        (due) => due.amountGold === 100n,
      ),
    ).toBe(true);
  });
  test('pillage uses the higher rate, credits the treasury once and excludes fully wounded loan troops', async () => {
    await policy({ lendingMode: 'ROLE_ALLOWANCE' });
    const contract = await loan();
    const tax = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${borrowerId} FOR UPDATE`;
      return divertForcePillageInTx(tx, borrowerId, 10000n, 123);
    });
    expect(tax).toBe(500n);
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM alliances WHERE id = ${allianceId} FOR UPDATE`;
      expect(await settleForcePillageInTx(tx, allianceId)).toBe(500n);
      expect(await settleForcePillageInTx(tx, allianceId)).toBe(0n);
    });
    await prisma.users.update({
      where: { id: borrowerId },
      data: { wounded_units: [{ forceContractId: contract.id, quantity: 8 }] },
    });
    expect(
      await prisma.$transaction((tx) =>
        divertForcePillageInTx(tx, borrowerId, 10000n, 124),
      ),
    ).toBe(200n);
  });
});
