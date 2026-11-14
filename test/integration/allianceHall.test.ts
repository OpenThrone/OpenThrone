import { beforeEach, describe, expect, test } from 'bun:test';

import { emptyAlliancePermissions } from '@/constants/alliancePermissions';
import prisma from '@/lib/prisma';
import { AllianceService } from '@/services/Alliance.service';
import { AllianceBankService } from '@/services/AllianceBank.service';
import { AllianceUpgradeService } from '@/services/AllianceUpgrade.service';
import { ensureActiveEra } from '@/services/Era.service';
import { createUser } from '@/services/User.service';

import { resetDatabase } from './db';

// Alliance Hall levels against a real database: purchase debit and race,
// deposit slots, treasury cap and the member cap on a real join.
let leaderId: number;
let builderId: number;
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
  leaderId = await makeUser('HallLeader');
  builderId = await makeUser('HallBuilder');
  outsiderId = await makeUser('HallOutsider');
  memberIds = [];
  for (let i = 0; i < 3; i++) memberIds.push(await makeUser(`HallMember${i}`));

  const alliance = await prisma.alliances.create({
    data: {
      name: 'Hall alliance',
      leader_id: leaderId,
      gold_in_bank: 3_000_000n,
      alliance_roles: {
        create: [
          {
            name: 'Member',
            rank_order: 1,
            permissions: emptyAlliancePermissions(),
          },
          {
            name: 'Builder',
            rank_order: 0,
            permissions: {
              ...emptyAlliancePermissions(),
              upgrade_alliance: true,
            },
          },
        ],
      },
    },
    include: { alliance_roles: true },
  });
  allianceId = alliance.id;
  const roleId = (name: string) =>
    alliance.alliance_roles.find((r) => r.name === name)!.id;
  await prisma.alliance_memberships.createMany({
    data: [
      { alliance_id: allianceId, user_id: leaderId, role_id: roleId('Member') },
      {
        alliance_id: allianceId,
        user_id: builderId,
        role_id: roleId('Builder'),
      },
      ...memberIds.map((user_id) => ({
        alliance_id: allianceId,
        user_id,
        role_id: roleId('Member'),
      })),
    ],
  });
  await prisma.users.updateMany({
    where: { id: { in: [leaderId, builderId, outsiderId, ...memberIds] } },
    data: { gold: 50_000_000n },
  });
});

describe('Alliance Hall purchase', () => {
  test('two concurrent purchases of the same level charge once', async () => {
    const results = await Promise.all([
      outcome(
        AllianceUpgradeService.purchase({
          allianceId,
          actorId: leaderId,
          level: 1,
        }),
      ),
      outcome(
        AllianceUpgradeService.purchase({
          allianceId,
          actorId: builderId,
          level: 1,
        }),
      ),
    ]);
    expect(results.filter((r) => r === 'ok')).toHaveLength(1);
    const alliance = await prisma.alliances.findUniqueOrThrow({
      where: { id: allianceId },
    });
    expect(alliance).toMatchObject({ hall_level: 1, gold_in_bank: 1_000_000n });
    const rows = await prisma.alliance_bank_history.findMany({
      where: { alliance_id: allianceId, transaction_type: 'UPGRADE' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount: 2_000_000n, notes: 'Level 1' });
  });

  test('a member without upgrade_alliance is refused', async () => {
    expect(
      await outcome(
        AllianceUpgradeService.purchase({
          allianceId,
          actorId: memberIds[0],
          level: 1,
        }),
      ),
    ).toMatch(/permission/);
  });
});

describe('Alliance Hall deposit limits', () => {
  test('Camp allows two deposits per member per 24 hours', async () => {
    const deposit = () =>
      outcome(
        AllianceBankService.deposit({
          allianceId,
          userId: memberIds[0],
          amount: 10n,
        }),
      );
    expect(await deposit()).toBe('ok');
    expect(await deposit()).toBe('ok');
    expect(await deposit()).toMatch(/Camp allows 2 deposits/);
    // Another member still has both slots.
    expect(
      await outcome(
        AllianceBankService.deposit({
          allianceId,
          userId: memberIds[1],
          amount: 10n,
        }),
      ),
    ).toBe('ok');
  });

  test('a deposit past the Camp treasury cap is refused', async () => {
    expect(
      await outcome(
        AllianceBankService.deposit({
          allianceId,
          userId: memberIds[0],
          amount: 2_000_001n,
        }),
      ),
    ).toMatch(/at most 2,000,000 more/);
    const alliance = await prisma.alliances.findUniqueOrThrow({
      where: { id: allianceId },
    });
    expect(alliance.gold_in_bank).toBe(3_000_000n);
  });
});

describe('Alliance Hall member cap', () => {
  test('a full open alliance refuses a join', async () => {
    const fillers: number[] = [];
    for (let i = 0; i < 5; i++) fillers.push(await makeUser(`HallFill${i}`));
    for (const userId of fillers) {
      await AllianceService.joinAlliance(userId, { allianceId });
    }
    // 5 seeded + 5 joined = Camp's 10.
    expect(
      await outcome(AllianceService.joinAlliance(outsiderId, { allianceId })),
    ).toMatch(/alliance is full \(10\/10 members at Camp\)/);
  });
});
