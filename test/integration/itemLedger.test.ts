/**
 * The daily item check (#370) against a real database: every real writer
 * explains its own changes, an out-of-ledger write is caught once, and the
 * snapshot and day guard hold up under concurrency.
 */
import * as argon2 from 'argon2';
import { beforeEach, describe, expect, test } from 'bun:test';
import { randomUUID } from 'crypto';

import { ItemTypes } from '@/constants';
import prisma from '@/lib/prisma';
import { AccountService } from '@/services/Account.service';
import { ArmoryService } from '@/services/Armory.service';
import { resetCurrentEra } from '@/services/CurrentEraReset.service';
import { ensureActiveEra, startNewEra } from '@/services/Era.service';
import { runItemLedgerCheck } from '@/services/ItemLedger.service';
import { TemporaryForceLedgerService as Ledger } from '@/services/TemporaryForceLedger.service';
import { createUser } from '@/services/User.service';
import { eraResetPhrase } from '@/utils/eraResetPhrase';

import { resetDatabase, setRuntimeSwitch } from './db';

const DAY_MS = 86400000;
const day = (n: number) => new Date(Date.UTC(2026, 10, 10 + n, 17));
const weapon = { type: 'WEAPON', usage: 'OFFENSE', level: 1 } as const;
const SLOTS = [
  'WEAPON',
  'HELM',
  'BRACERS',
  'SHIELD',
  'BOOTS',
  'ARMOR',
] as const;

let userId: number;
let today = 0;
/** Runs the check for the next OT day, so no run hits the day guard. */
const check = () => {
  today += 1;
  return runItemLedgerCheck(day(today));
};
const mismatches = () =>
  prisma.itemLedgerMismatch.findMany({ orderBy: { id: 'asc' } });
const quantity = async (id = userId) =>
  (await prisma.userItem.findFirst({ where: { userId: id, ...weapon } }))
    ?.quantity ?? 0;

beforeEach(async () => {
  await resetDatabase();
  today = 0;
  await ensureActiveEra();
  userId = (
    await createUser(
      'ledger@example.test',
      'synthetic',
      'Ledger',
      'HUMAN',
      'FIGHTER',
    )
  ).id;
  await prisma.users.update({
    where: { id: userId },
    data: { gold: 100000000n, fort_level: 12 },
  });
  await prisma.userStructureUpgrade.updateMany({
    where: { userId, type: 'ARMORY' },
    data: { level: 12 },
  });
});

describe('daily item check', () => {
  test('the first run is a baseline and reports nothing', async () => {
    await prisma.userItem.updateMany({
      where: { userId, ...weapon },
      data: { quantity: 40 },
    });
    expect(await check()).toMatchObject({
      skipped: false,
      kind: 'BASELINE',
      mismatchCount: 0,
    });
    expect(await mismatches()).toEqual([]);
    expect(
      await prisma.itemBalanceCheckpoint.findMany({ where: { userId } }),
    ).toEqual([{ userId, ...weapon, quantity: 40 }]);
  });

  test('armory buy, sell and upgrade explain themselves', async () => {
    await check();
    await ArmoryService.equipItems({
      userId,
      items: [
        { ...weapon, quantity: 10 },
        { ...weapon, quantity: 5 },
      ],
    });
    expect(await check()).toMatchObject({ kind: 'CHECK', mismatchCount: 0 });

    await ArmoryService.unequipItems({
      userId,
      items: [{ ...weapon, quantity: 5 }],
    });
    expect(await quantity()).toBe(10);
    expect(await check()).toMatchObject({ mismatchCount: 0 });

    const tiers = ItemTypes.filter(
      (item) =>
        item.type === 'WEAPON' &&
        item.usage === 'OFFENSE' &&
        ['ALL', 'HUMAN'].includes(item.race),
    ).sort((a, b) => a.level - b.level);
    await ArmoryService.upgradeItems({
      userId,
      conversions: [
        {
          fromItem: `OFFENSE_${tiers[0]!.id}`,
          toItem: `OFFENSE_${tiers[1]!.id}`,
          conversionAmount: 4,
        },
      ],
    });
    expect(await quantity()).toBe(6);
    expect(await check()).toMatchObject({ mismatchCount: 0 });
    expect(await mismatches()).toEqual([]);
  });

  test('a force contribution explains its debit', async () => {
    await prisma.userUnit.updateMany({
      where: { userId, type: 'OFFENSE', level: 1 },
      data: { quantity: 100 },
    });
    for (const type of SLOTS)
      await prisma.userItem.upsert({
        where: {
          userId_type_usage_level: {
            userId,
            type,
            usage: 'OFFENSE',
            level: 1,
          },
        },
        create: { userId, type, usage: 'OFFENSE', level: 1, quantity: 50 },
        update: { quantity: 50 },
      });
    const alliance = await prisma.alliances.create({
      data: {
        name: 'Ledger alliance',
        leader_id: userId,
        alliance_roles: { create: { name: 'Member' } },
      },
      include: { alliance_roles: true },
    });
    await prisma.alliance_memberships.create({
      data: {
        alliance_id: alliance.id,
        user_id: userId,
        role_id: alliance.alliance_roles[0]!.id,
      },
    });
    await check();

    const unit = await prisma.userUnit.findFirstOrThrow({
      where: { userId, type: 'OFFENSE' },
    });
    await Ledger.contribute({
      allianceId: alliance.id,
      userId,
      unitId: unit.id,
      quantity: 10,
      equipment: SLOTS.map((type) => ({ type, level: 1 })),
      operationId: randomUUID(),
    });
    expect(await quantity()).toBe(40);
    expect(await check()).toMatchObject({ mismatchCount: 0 });
  });

  test('an account reset explains the wipe', async () => {
    await check();
    await ArmoryService.equipItems({
      userId,
      items: [{ ...weapon, quantity: 7 }],
    });
    await prisma.users.update({
      where: { id: userId },
      data: { password_hash: await argon2.hash('synthetic-pass-1') },
    });
    await AccountService.resetAccount(userId, {
      password: 'synthetic-pass-1',
    });
    expect(await quantity()).toBe(0);
    expect(await check()).toMatchObject({ mismatchCount: 0 });
  });

  test('an era rollover and a new player raise no alarm', async () => {
    await ArmoryService.equipItems({
      userId,
      items: [{ ...weapon, quantity: 9 }],
    });
    await check();
    const era = await ensureActiveEra();
    await prisma.era.update({
      where: { id: era.id },
      data: { startDate: new Date(Date.now() - 10 * DAY_MS) },
    });
    await startNewEra();
    const late = await createUser(
      'late@example.test',
      'synthetic',
      'Latecomer',
      'ELF',
      'FIGHTER',
    );
    await prisma.users.update({
      where: { id: late.id },
      data: { gold: 100000000n },
    });
    expect(await check()).toMatchObject({ mismatchCount: 0 });
  });

  test('a current-era reset explains the wipe', async () => {
    await ArmoryService.equipItems({
      userId,
      items: [{ ...weapon, quantity: 8 }],
    });
    await check();
    await ArmoryService.equipItems({
      userId,
      items: [{ ...weapon, quantity: 2 }],
    });
    const era = await ensureActiveEra();
    await setRuntimeSwitch('DISABLE_LOGIN', true);
    await resetCurrentEra({
      eraId: era.id,
      expectedEraStartDate: era.startDate,
      confirmation: eraResetPhrase(era.id),
      adminUserId: userId,
      ip: '127.0.0.1',
    });
    expect(await quantity()).toBe(0);
    expect(await check()).toMatchObject({ mismatchCount: 0 });
  });

  test('flags an out-of-ledger change once, with the drift', async () => {
    await ArmoryService.equipItems({
      userId,
      items: [{ ...weapon, quantity: 500 }],
    });
    await check();
    await prisma.$executeRaw`
      UPDATE "UserItem" SET quantity = 501
      WHERE "userId" = ${userId} AND type = 'WEAPON' AND usage = 'OFFENSE'`;

    expect(await check()).toMatchObject({ mismatchCount: 1 });
    expect(await mismatches()).toMatchObject([
      {
        userId,
        ...weapon,
        checkpointQuantity: 500,
        ledgerDelta: 0,
        actualQuantity: 501,
        drift: 1,
      },
    ]);

    expect(await check()).toMatchObject({ mismatchCount: 0 });
    expect(await mismatches()).toHaveLength(1);
  });

  test('catches a deleted balance', async () => {
    await ArmoryService.equipItems({
      userId,
      items: [{ ...weapon, quantity: 3 }],
    });
    await check();
    await prisma.userItem.deleteMany({ where: { userId, ...weapon } });
    expect(await check()).toMatchObject({ mismatchCount: 1 });
    expect((await mismatches())[0]).toMatchObject({ drift: -3 });
  });

  test('a same-day rerun skips and consumes nothing', async () => {
    await runItemLedgerCheck(day(1));
    await ArmoryService.equipItems({
      userId,
      items: [{ ...weapon, quantity: 2 }],
    });
    expect(await runItemLedgerCheck(day(1))).toMatchObject({ skipped: true });
    expect(
      await prisma.itemLedgerEntry.count({ where: { checkRunId: null } }),
    ).toBe(1);
    expect(await runItemLedgerCheck(day(2))).toMatchObject({
      skipped: false,
      entriesConsumed: 1,
      mismatchCount: 0,
    });
  });

  test('two runs at once give one run and one skip', async () => {
    const results = await Promise.all([
      runItemLedgerCheck(day(1)),
      runItemLedgerCheck(day(1)),
    ]);
    expect(results.map((result) => result.skipped).sort()).toEqual([
      false,
      true,
    ]);
    expect(await prisma.itemLedgerRun.count()).toBe(1);
  });

  test('a skipped day rolls into the next run', async () => {
    await check();
    await ArmoryService.equipItems({
      userId,
      items: [{ ...weapon, quantity: 4 }],
    });
    today += 3;
    await ArmoryService.equipItems({
      userId,
      items: [{ ...weapon, quantity: 4 }],
    });
    expect(await check()).toMatchObject({
      mismatchCount: 0,
      entriesConsumed: 2,
    });
  });

  test('a purchase committing during a run waits for the next run', async () => {
    await check();
    // Hold the writer open across the check: it inserts first, commits later.
    let commit!: () => void;
    const gate = new Promise<void>((resolve) => {
      commit = resolve;
    });
    let written!: () => void;
    const ready = new Promise<void>((resolve) => {
      written = resolve;
    });
    const writer = prisma.$transaction(async (tx) => {
      await tx.userItem.upsert({
        where: {
          userId_type_usage_level: { userId, ...weapon },
        },
        create: { userId, ...weapon, quantity: 6 },
        update: { quantity: 6 },
      });
      await tx.itemLedgerEntry.create({
        data: { userId, ...weapon, delta: 6, reason: 'ARMORY_BUY' },
      });
      written();
      await gate;
    });
    await ready;
    expect(await check()).toMatchObject({
      mismatchCount: 0,
      entriesConsumed: 0,
    });
    commit();
    await writer;

    expect(await check()).toMatchObject({
      mismatchCount: 0,
      entriesConsumed: 1,
    });
  });

  test('a run finishes after a users row lock is released', async () => {
    await check();
    await ArmoryService.equipItems({
      userId,
      items: [{ ...weapon, quantity: 1 }],
    });
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked!: () => void;
    const lockHeld = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const rollover = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users FOR UPDATE`;
      locked();
      await hold;
    });
    await lockHeld;
    const run = check();
    const raced = await Promise.race([
      run.then(() => 'finished'),
      new Promise((resolve) => {
        setTimeout(() => resolve('waiting'), 300);
      }),
    ]);
    expect(raced).toBe('waiting');
    release();
    await rollover;
    expect(await run).toMatchObject({ mismatchCount: 0, entriesConsumed: 1 });
  });
});
