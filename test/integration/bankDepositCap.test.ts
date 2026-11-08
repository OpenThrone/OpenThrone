import { beforeEach, describe, expect, test } from 'bun:test';

import prisma from '@/lib/prisma';
import { AllianceBankService } from '@/services/AllianceBank.service';
import { depositGold } from '@/services/Bank.service';
import { createUser } from '@/services/User.service';

import { resetDatabase } from './db';

const GOLD_ON_HAND = 1_000_000n;
const DEPOSIT_AMOUNT = 1_000n;

const createPlayer = async (name: string) =>
  createUser(
    `${name.toLowerCase().replace(/\s+/g, '-')}@example.test`,
    'not-a-real-hash',
    name,
    'HUMAN',
    'FIGHTER',
  );

/** Seeds one hand-to-bank deposit row inside the current 24h/era window. */
const seedDepositRow = async (userId: number) => {
  await prisma.bank_history.create({
    data: {
      gold_amount: DEPOSIT_AMOUNT,
      from_user_id: userId,
      from_user_account_type: 'HAND',
      to_user_id: userId,
      to_user_account_type: 'BANK',
      date_time: new Date(),
      history_type: 'PLAYER_TRANSFER',
    },
  });
};

const countDepositRows = (userId: number) =>
  prisma.bank_history.count({
    where: {
      from_user_id: userId,
      to_user_id: userId,
      from_user_account_type: 'HAND',
      to_user_account_type: 'BANK',
      history_type: 'PLAYER_TRANSFER',
    },
  });

const outcome = async (promise: Promise<unknown>) => {
  try {
    const result = (await promise) as { gold?: unknown };
    return { ok: true, result };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
};

let player: number;

beforeEach(async () => {
  await resetDatabase();
  player = (await createPlayer('Cap Player')).id;
  // Economy level 0 (Farm) grants 3 deposits per day.
  await prisma.users.update({
    where: { id: player },
    data: { economy_level: 0, gold: GOLD_ON_HAND, gold_in_bank: 0n },
  });
});

describe('personal bank daily deposit count cap under concurrency (F-18)', () => {
  test('N concurrent deposits at the cap never exceed the daily count', async () => {
    const CAP = 3; // EconomyUpgrades[0].depositsPerDay
    // Two of the three daily deposits are already used.
    await seedDepositRow(player);
    await seedDepositRow(player);
    expect(await countDepositRows(player)).toBe(CAP - 1);

    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        outcome(depositGold(player, DEPOSIT_AMOUNT)),
      ),
    );

    const succeeded = results.filter((r) => r.ok);
    const refused = results.filter((r) => !r.ok);
    // Exactly one deposit fits the remaining slot...
    expect(succeeded).toHaveLength(1);
    // ...and every other attempt is refused with the cap message, never a 500.
    expect(refused).toHaveLength(5);
    for (const r of refused) {
      expect(r.message).toBe('Maximum deposits reached');
    }

    // The cap holds on committed state: 2 seeded + 1 racing deposit.
    expect(await countDepositRows(player)).toBe(CAP);

    // Gold conservation: exactly one debit moved hand -> bank.
    const user = await prisma.users.findUniqueOrThrow({
      where: { id: player },
      select: { gold: true, gold_in_bank: true },
    });
    expect(user.gold).toBe(GOLD_ON_HAND - DEPOSIT_AMOUNT);
    expect(user.gold_in_bank).toBe(DEPOSIT_AMOUNT);
  });

  test('N concurrent deposits from an empty history land exactly cap rows', async () => {
    const CAP = 3;
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        outcome(depositGold(player, DEPOSIT_AMOUNT)),
      ),
    );

    expect(results.filter((r) => r.ok)).toHaveLength(CAP);
    const refusedMessages = results
      .filter((r) => !r.ok)
      .map((r) => (r as { message: string }).message);
    expect(refusedMessages).toHaveLength(8 - CAP);
    for (const message of refusedMessages) {
      // Refusals are cap rejections (or the conditional-debit guard), never 500s.
      expect(
        message === 'Maximum deposits reached' ||
          message === 'Your gold balance changed, please try again',
      ).toBe(true);
    }

    expect(await countDepositRows(player)).toBe(CAP);

    const user = await prisma.users.findUniqueOrThrow({
      where: { id: player },
      select: { gold: true, gold_in_bank: true },
    });
    expect(user.gold_in_bank).toBe(BigInt(CAP) * DEPOSIT_AMOUNT);
    expect(user.gold).toBe(GOLD_ON_HAND - BigInt(CAP) * DEPOSIT_AMOUNT);
  });
});

describe('alliance bank member daily receive cap under concurrency (F-18)', () => {
  let allianceId: number;
  let leader: number;
  let member: number;
  const TREASURY = 1_000_000n;
  const TRANSFER = 400n;
  const DAILY_CAP = 1_000n; // 2 full transfers, the 3rd exceeds the cap

  beforeEach(async () => {
    leader = (await createPlayer('Alliance Leader Caprace')).id;
    member = (await createPlayer('Alliance Member Caprace')).id;
    const alliance = await prisma.alliances.create({
      data: {
        name: 'Caprace',
        leader_id: leader,
        gold_in_bank: TREASURY,
        member_daily_cap: DAILY_CAP,
        alliance_roles: { create: { name: 'Member' } },
      },
      include: { alliance_roles: true },
    });
    allianceId = alliance.id;
    const roleId = alliance.alliance_roles[0]!.id;
    await prisma.alliance_memberships.createMany({
      data: [leader, member].map((user_id) => ({
        alliance_id: allianceId,
        user_id,
        role_id: roleId,
      })),
    });
  });

  test('concurrent treasury payouts respect the per-member daily cap', async () => {
    const memberGoldBefore = (
      await prisma.users.findUniqueOrThrow({
        where: { id: member },
        select: { gold: true },
      })
    ).gold;

    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        outcome(
          AllianceBankService.transfer({
            allianceId,
            requesterId: leader,
            targetUserId: member,
            amount: TRANSFER,
          }),
        ),
      ),
    );

    const succeeded = results.filter((r) => r.ok);
    expect(succeeded).toHaveLength(2); // 400 + 400 <= 1000, further ones refuse
    for (const r of results.filter((x) => !x.ok)) {
      expect((r as { message: string }).message).toContain(
        'Daily limit reached',
      );
    }

    // Committed state: treasury and member gold moved by exactly 2 transfers.
    const alliance = await prisma.alliances.findUniqueOrThrow({
      where: { id: allianceId },
      select: { gold_in_bank: true },
    });
    const memberRow = await prisma.users.findUniqueOrThrow({
      where: { id: member },
      select: { gold: true },
    });
    expect(alliance.gold_in_bank).toBe(TREASURY - 2n * TRANSFER);
    expect(await prisma.alliance_bank_history.count()).toBe(2);
    expect(memberRow.gold).toBe(memberGoldBefore + 2n * TRANSFER);
  });
});
