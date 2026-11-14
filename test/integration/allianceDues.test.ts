import { beforeEach, describe, expect, test } from 'bun:test';

import { getDuesPeriodStart } from '@/constants/allianceDues';
import { emptyAlliancePermissions } from '@/constants/alliancePermissions';
import prisma from '@/lib/prisma';
import { AllianceService } from '@/services/Alliance.service';
import { AllianceDuesService } from '@/services/AllianceDues.service';
import { ensureActiveEra } from '@/services/Era.service';
import { createUser } from '@/services/User.service';

import { resetDatabase } from './db';

// Alliance join fee and dues against a real database: the fee on a real join
// (and its rollback), and concurrent dues runs charging each member once.
const DAY = 24 * 60 * 60 * 1000;
let leaderId: number;
let memberIds: number[];
let outsiderId: number;
let allianceId: number;

const makeUser = async (name: string) =>
  (
    await createUser(
      `${name}@example.test`,
      'synthetic',
      name,
      'HUMAN',
      'FIGHTER',
    )
  ).id;

const outcome = (promise: Promise<unknown>) =>
  promise.then(
    () => 'ok',
    (error: Error) => error.message,
  );

beforeEach(async () => {
  await resetDatabase();
  await ensureActiveEra();
  leaderId = await makeUser('DuesLeader');
  outsiderId = await makeUser('DuesOutsider');
  memberIds = [];
  for (let i = 0; i < 3; i++) memberIds.push(await makeUser(`DuesMember${i}`));

  const alliance = await prisma.alliances.create({
    data: {
      name: 'Dues alliance',
      leader_id: leaderId,
      gold_in_bank: 0n,
      dues_amount: 400_000n,
      dues_period: 'DAILY',
      alliance_roles: {
        create: [
          {
            name: 'Member',
            rank_order: 1,
            permissions: emptyAlliancePermissions(),
          },
        ],
      },
    },
    include: { alliance_roles: true },
  });
  allianceId = alliance.id;
  const roleId = alliance.alliance_roles[0].id;
  const yesterday = new Date(
    (getDuesPeriodStart('DAILY') as Date).getTime() - DAY,
  );
  await prisma.alliance_memberships.createMany({
    data: [leaderId, ...memberIds].map((user_id) => ({
      alliance_id: allianceId,
      user_id,
      role_id: roleId,
      dues_paid_through: yesterday,
    })),
  });
  await prisma.users.updateMany({
    where: { id: { in: [leaderId, outsiderId, ...memberIds] } },
    data: { gold: 1_000_000n },
  });
  // The last member can pay only part of the dues.
  await prisma.users.update({
    where: { id: memberIds[2] },
    data: { gold: 150_000n },
  });
});

describe('alliance dues collection', () => {
  test('two concurrent runs charge each member once', async () => {
    const runs = await Promise.all([
      AllianceDuesService.collectForAlliance(allianceId),
      AllianceDuesService.collectForAlliance(allianceId),
    ]);
    expect(runs.map((run) => run.charged).sort()).toEqual([0, 3]);

    const alliance = await prisma.alliances.findUniqueOrThrow({
      where: { id: allianceId },
    });
    expect(alliance.gold_in_bank).toBe(950_000n);
    const gold = await prisma.users.findMany({
      where: { id: { in: [leaderId, ...memberIds] } },
      select: { id: true, gold: true },
      orderBy: { id: 'asc' },
    });
    expect(gold.map((u) => u.gold)).toEqual([
      1_000_000n,
      600_000n,
      600_000n,
      0n,
    ]);
    const short = await prisma.alliance_memberships.findFirstOrThrow({
      where: { alliance_id: allianceId, user_id: memberIds[2] },
    });
    expect(short.dues_arrears).toBe(250_000n);
    const taxes = await prisma.alliance_bank_history.count({
      where: { alliance_id: allianceId, transaction_type: 'TAX' },
    });
    expect(taxes).toBe(3);

    // A third run later the same day changes nothing.
    expect((await AllianceDuesService.collectAll()).charged).toBe(0);
  });

  test('a member pays arrears from gold on hand', async () => {
    await AllianceDuesService.collectForAlliance(allianceId);
    await prisma.users.update({
      where: { id: memberIds[2] },
      data: { gold: 300_000n },
    });
    await AllianceDuesService.payArrears({
      allianceId,
      userId: memberIds[2],
      amount: 1_000_000,
    });
    const row = await prisma.alliance_memberships.findFirstOrThrow({
      where: { alliance_id: allianceId, user_id: memberIds[2] },
    });
    expect(row.dues_arrears).toBe(0n);
    const user = await prisma.users.findUniqueOrThrow({
      where: { id: memberIds[2] },
    });
    expect(user.gold).toBe(50_000n);
  });
});

describe('alliance join fee', () => {
  test('a join pays the fee and is not charged dues retroactively', async () => {
    await prisma.alliances.update({
      where: { id: allianceId },
      data: { join_fee: 250_000n },
    });
    expect(
      await outcome(AllianceService.joinAlliance(outsiderId, { allianceId })),
    ).toBe('ok');
    const user = await prisma.users.findUniqueOrThrow({
      where: { id: outsiderId },
    });
    expect(user.gold).toBe(750_000n);
    const fee = await prisma.alliance_bank_history.findFirstOrThrow({
      where: { alliance_id: allianceId, transaction_type: 'FEE' },
    });
    expect(fee).toMatchObject({
      amount: 250_000n,
      related_user_id: outsiderId,
    });

    await AllianceDuesService.collectForAlliance(allianceId);
    const after = await prisma.users.findUniqueOrThrow({
      where: { id: outsiderId },
    });
    expect(after.gold).toBe(750_000n);
  });

  test('a player who cannot pay is refused and nothing is written', async () => {
    await prisma.alliances.update({
      where: { id: allianceId },
      data: { join_fee: 5_000_000n },
    });
    expect(
      await outcome(AllianceService.joinAlliance(outsiderId, { allianceId })),
    ).toMatch(/join fee is 5,000,000 gold/);
    expect(
      await prisma.alliance_memberships.count({
        where: { alliance_id: allianceId, user_id: outsiderId },
      }),
    ).toBe(0);
    const user = await prisma.users.findUniqueOrThrow({
      where: { id: outsiderId },
    });
    expect(user.gold).toBe(1_000_000n);
    const alliance = await prisma.alliances.findUniqueOrThrow({
      where: { id: allianceId },
    });
    expect(alliance.gold_in_bank).toBe(0n);
  });
});
