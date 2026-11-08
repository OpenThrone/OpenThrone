/* eslint-disable no-bitwise -- activity hour masks are bit sets */
/**
 * Integration coverage for the admin-only abuse signals (#6): shared
 * network, resource funnelling (transfers, one-sided attacks, recruit links,
 * treasury payouts, gold ping-pong), bot-like timing and fresh-account
 * farming. Each detector is proven both ways against a real database, the
 * thresholds are read from the "abuse" runtime settings, normal play raises
 * nothing, and reviewing a signal is audited and never touches the player.
 */
import { beforeEach, describe, expect, test } from 'bun:test';

import prisma from '@/lib/prisma';
import {
  detectBotTiming,
  evaluateAttackPair,
  evaluateTransferPair,
  runAbuseDetection,
} from '@/services/AbuseDetection.service';
import { raiseAbuseSignal } from '@/services/AbuseSignalStore.service';
import { CheatDetectionService } from '@/services/CheatDetection.service';
import {
  markGameplayActivity,
  settleActivityWrites,
} from '@/services/GameplayActivity.service';
import {
  recordSuccessfulLogin,
  settleLoginChecks,
} from '@/services/LoginTelemetry.service';
import {
  performExternalRecruitment,
  performRecruitment,
} from '@/services/Recruitment.service';
import { invalidateRuntimeConfigCache } from '@/services/RuntimeConfig.service';
import { createUser } from '@/services/User.service';
import { createBudget, withDbDeadline } from '@/utils/boundedWork';
import { cheatSignalIdentityLockKey } from '@/utils/cheatSignalLock';

import { resetDatabase } from './db';

const DAY_MS = 24 * 60 * 60 * 1000;
let counter = 0;

const createPlayer = (name: string) =>
  createUser(
    `${name.toLowerCase().replace(/\s+/g, '-')}-${(counter += 1)}@example.test`,
    'not-a-real-hash',
    `${name} ${counter}`,
    'HUMAN',
    'FIGHTER',
  );

const setSetting = async (key: string, value: number | boolean) => {
  await prisma.serverSetting.upsert({
    where: { key },
    create: {
      key,
      label: key,
      type: typeof value === 'boolean' ? 'BOOLEAN' : 'NUMBER',
      value,
      isPublic: false,
    },
    update: { value },
  });
  invalidateRuntimeConfigCache();
};

const transfer = (from: number, to: number, gold: number, at = new Date()) =>
  prisma.bank_history.create({
    data: {
      gold_amount: BigInt(gold),
      from_user_id: from,
      from_user_account_type: 'GOLD',
      to_user_id: to,
      to_user_account_type: 'GOLD',
      date_time: at,
      history_type: 'FRIEND_TRANSFER',
      stats: {},
    },
  });

const attack = (
  attackerId: number,
  defenderId: number,
  winnerId = attackerId,
  gold = 600_000,
  at = new Date(),
) =>
  prisma.attack_log.create({
    data: {
      timestamp: at,
      winner: winnerId,
      type: 'attack',
      pillaged_gold: BigInt(gold),
      attacker_losses_total: 0,
      defender_losses_total: 10,
      stats: {},
      attackerPlayer: { connect: { id: attackerId } },
      defenderPlayer: { connect: { id: defenderId } },
    },
  });

/** Login-time checks run in the background: wait for them before reading signals. */
const loginAndSettle = async (
  input: Parameters<typeof recordSuccessfulLogin>[0],
) => {
  await recordSuccessfulLogin(input);
  await settleLoginChecks();
};

const times = async (n: number, fn: (i: number) => Promise<unknown>) => {
  for (let i = 0; i < n; i += 1) await fn(i);
};

const signals = (type?: string) =>
  prisma.cheatSignal.findMany({
    where: type ? { type: type as any } : {},
    orderBy: { id: 'asc' },
  });

const ageAccount = (userId: number, days: number) =>
  prisma.users.update({
    where: { id: userId },
    data: { created_at: new Date(Date.now() - days * DAY_MS) },
  });

beforeEach(async () => {
  await resetDatabase();
  invalidateRuntimeConfigCache();
});

describe('shared network', () => {
  test('three accounts on one network raise one signal, refreshed not duplicated', async () => {
    const [a, b, c] = await Promise.all([
      createPlayer('Net A'),
      createPlayer('Net B'),
      createPlayer('Net C'),
    ]);
    for (const user of [a, b, c])
      await loginAndSettle({
        userId: user.id,
        ip: '203.0.113.7',
        userAgent: 'Synthetic Browser/1.0',
      });
    const raised = await signals('LINKED_ACCOUNT_ACTIVITY');
    // One signal for the shared address, one for the address+browser pattern.
    expect(raised).toHaveLength(2);
    for (const signal of raised) {
      expect(signal.status).toBe('OPEN');
      expect(signal.userId).toBe(Math.min(a.id, b.id, c.id));
      expect(signal.linkedUserIds.sort()).toEqual(
        [a.id, b.id, c.id].filter((id) => id !== signal.userId).sort(),
      );
      expect(JSON.stringify(signal.evidence)).not.toContain('203.0.113.7');
    }
    await loginAndSettle({
      userId: a.id,
      ip: '203.0.113.7',
      userAgent: 'Synthetic Browser/1.0',
    });
    expect(await signals('LINKED_ACCOUNT_ACTIVITY')).toHaveLength(2);
  });

  test('two accounts on one network raise nothing under the default threshold', async () => {
    const [a, b] = await Promise.all([
      createPlayer('Home A'),
      createPlayer('Home B'),
    ]);
    for (const user of [a, b])
      await loginAndSettle({
        userId: user.id,
        ip: '198.51.100.20',
        userAgent: 'Synthetic Browser/1.0',
      });
    await runAbuseDetection();
    expect(await signals()).toHaveLength(0);
  });

  test('the account threshold comes from settings', async () => {
    const [a, b] = await Promise.all([
      createPlayer('Set A'),
      createPlayer('Set B'),
    ]);
    await setSetting('abuse.network.minAccounts', 2);
    for (const user of [a, b])
      await loginAndSettle({
        userId: user.id,
        ip: '198.51.100.21',
        userAgent: 'Synthetic Browser/1.0',
      });
    expect((await signals('LINKED_ACCOUNT_ACTIVITY')).length).toBeGreaterThan(
      0,
    );
  });

  test('the daily sweep finds clusters that already exist and honours the window', async () => {
    const users = await Promise.all(
      ['S1', 'S2', 'S3', 'Old1', 'Old2', 'Old3'].map(createPlayer),
    );
    const login = (userId: number, ipHash: string, daysAgo: number) =>
      prisma.loginEvent.create({
        data: {
          userId,
          ipHash,
          occurredAt: new Date(Date.now() - daysAgo * DAY_MS),
        },
      });
    for (const user of users.slice(0, 3))
      await login(user.id, 'hash-recent', 2);
    for (const user of users.slice(3)) await login(user.id, 'hash-old', 20);
    const summary = await runAbuseDetection();
    expect(summary.network).toBe(1);
    const [signal] = await signals('LINKED_ACCOUNT_ACTIVITY');
    expect([signal.userId, ...signal.linkedUserIds].sort()).toEqual(
      users
        .slice(0, 3)
        .map((u) => u.id)
        .sort(),
    );
  });

  test('bots and our own proxy address never form a cluster', async () => {
    const users = await Promise.all(['P1', 'P2', 'P3'].map(createPlayer));
    const original = process.env.TRUSTED_PROXY_IPS;
    process.env.TRUSTED_PROXY_IPS = '10.0.0.21';
    try {
      for (const user of users)
        await loginAndSettle({
          userId: user.id,
          ip: '10.0.0.21',
          userAgent: 'Synthetic Browser/1.0',
        });
      await runAbuseDetection();
      expect(await signals()).toHaveLength(0);
    } finally {
      if (original === undefined) delete process.env.TRUSTED_PROXY_IPS;
      else process.env.TRUSTED_PROXY_IPS = original;
    }
  });
});

describe('resource funnelling', () => {
  const makeFeeders = async (count: number) => {
    const sink = await createPlayer('Sink');
    const feeders = await Promise.all(
      Array.from({ length: count }, (_, i) => createPlayer(`Feeder ${i}`)),
    );
    return { sink, feeders };
  };

  test('three accounts sending nearly all their gold to one raise a signal', async () => {
    const { sink, feeders } = await makeFeeders(3);
    for (const feeder of feeders)
      await times(5, () => transfer(feeder.id, sink.id, 200_000));
    const summary = await runAbuseDetection();
    expect(summary.funnel).toBe(1);
    const [signal] = await signals('RESOURCE_FUNNELLING');
    expect(signal.userId).toBe(sink.id);
    expect(signal.linkedUserIds.sort()).toEqual(
      feeders.map((f) => f.id).sort(),
    );
    expect(signal.status).toBe('OPEN');
    expect((signal.evidence as any).via).toBe('transfer');
    expect((signal.evidence as any).totalGold).toBe(3_000_000);
    // A second run refreshes the same signal.
    await runAbuseDetection();
    expect(await signals('RESOURCE_FUNNELLING')).toHaveLength(1);
  });

  test('sources that split their gold across many accounts raise nothing', async () => {
    const { sink, feeders } = await makeFeeders(3);
    const other = await createPlayer('Other');
    for (const feeder of feeders) {
      await times(5, () => transfer(feeder.id, sink.id, 200_000));
      await times(5, () => transfer(feeder.id, other.id, 200_000));
    }
    await runAbuseDetection();
    expect(await signals('RESOURCE_FUNNELLING')).toHaveLength(0);
  });

  test('two sources, or too little gold, raise nothing; the volume floor is a setting', async () => {
    const { sink, feeders } = await makeFeeders(3);
    for (const feeder of feeders.slice(0, 2))
      await times(5, () => transfer(feeder.id, sink.id, 400_000));
    await runAbuseDetection();
    expect(await signals('RESOURCE_FUNNELLING')).toHaveLength(0); // two sources
    await prisma.bank_history.deleteMany();
    for (const feeder of feeders)
      await times(5, () => transfer(feeder.id, sink.id, 100_000));
    await runAbuseDetection();
    expect(await signals('RESOURCE_FUNNELLING')).toHaveLength(0); // 1.5M < 2M
    await setSetting('abuse.funnel.minGold', 1_000_000);
    await runAbuseDetection();
    expect(await signals('RESOURCE_FUNNELLING')).toHaveLength(1);
  });

  test('shared login patterns among the sources raise the severity', async () => {
    const { sink, feeders } = await makeFeeders(3);
    for (const feeder of feeders)
      await times(5, () => transfer(feeder.id, sink.id, 200_000));
    await runAbuseDetection();
    const before = (await signals('RESOURCE_FUNNELLING'))[0];
    await prisma.cheatSignal.deleteMany();
    for (const user of [sink, ...feeders])
      await prisma.loginEvent.create({
        data: {
          userId: user.id,
          ipHash: 'shared-hash',
          occurredAt: new Date(),
        },
      });
    await runAbuseDetection();
    const after = (await signals('RESOURCE_FUNNELLING'))[0];
    expect(after.score).toBeGreaterThan(before.score);
    expect((after.evidence as any).sharedLoginSources.length).toBe(3);
  });

  test('repeated one-sided attacks from one player on three accounts raise a funnel', async () => {
    const { sink: attacker, feeders: victims } = await makeFeeders(3);
    for (const victim of victims)
      await times(5, () => attack(attacker.id, victim.id));
    await runAbuseDetection();
    const [signal] = await signals('RESOURCE_FUNNELLING');
    expect(signal.userId).toBe(attacker.id);
    expect((signal.evidence as any).via).toBe('attack');
  });

  test('attacks the victims answer, or mostly lose, do not funnel', async () => {
    const { sink: attacker, feeders: victims } = await makeFeeders(3);
    for (const victim of victims) {
      await times(5, () => attack(attacker.id, victim.id));
      await attack(victim.id, attacker.id); // hits back
    }
    await runAbuseDetection();
    expect(await signals('RESOURCE_FUNNELLING')).toHaveLength(0);
  });

  /** One real internal recruitment: `recruiter` clicks `owner`'s link and is rewarded. */
  const recruit = (recruiterId: number, ownerId: number) =>
    prisma.$transaction((tx) =>
      performRecruitment({
        tx,
        fromUser: ownerId,
        toUser: recruiterId,
        userIdToUpdate: recruiterId,
        ipAddress: '203.0.113.50',
      }),
    );

  test("one recruiter using three accounts' links raises a funnel on the recruiter, the rewarded account", async () => {
    const { sink: recruiter, feeders: owners } = await makeFeeders(3);
    for (const owner of owners)
      await times(5, () => recruit(recruiter.id, owner.id));
    // The real service rewarded the recruiter, not the link owners.
    const goldAfter = await prisma.users.findMany({
      where: { id: { in: owners.map((o) => o.id) } },
      select: { gold: true },
    });
    expect(new Set(goldAfter.map((o) => String(o.gold))).size).toBe(1);
    await runAbuseDetection();
    const [signal] = await signals('RESOURCE_FUNNELLING');
    expect(signal.userId).toBe(recruiter.id);
    expect(signal.linkedUserIds.sort()).toEqual(owners.map((o) => o.id).sort());
    expect((signal.evidence as any).via).toBe('recruit');
  });

  test("three accounts all using one owner's link is not a funnel into that owner", async () => {
    const { sink: owner, feeders: recruiters } = await makeFeeders(3);
    for (const recruiter of recruiters)
      await times(5, () => recruit(recruiter.id, owner.id));
    await runAbuseDetection();
    expect(await signals('RESOURCE_FUNNELLING')).toHaveLength(0);
  });

  test('link owners whose clicks come mostly from other recruiters are not funnelled', async () => {
    const { sink: recruiter, feeders: owners } = await makeFeeders(3);
    const others = await Promise.all(
      [1, 2, 3].map((i) => createPlayer(`Other recruiter ${i}`)),
    );
    for (const owner of owners) {
      await times(5, () => recruit(recruiter.id, owner.id));
      for (const other of others)
        await times(5, () => recruit(other.id, owner.id));
    }
    await runAbuseDetection();
    expect(
      (await signals('RESOURCE_FUNNELLING')).filter(
        (s) => (s.evidence as any).sinkUserId === recruiter.id,
      ),
    ).toHaveLength(0);
  });

  test('external link visits are not counted: they have no source account', async () => {
    const owner = await createPlayer('External owner');
    for (let i = 0; i < 4; i += 1)
      await prisma.$transaction((tx) =>
        performExternalRecruitment({
          tx,
          ownerId: owner.id,
          ipAddress: `198.51.100.${10 + i}`,
        }),
      );
    expect(
      await prisma.recruit_history.count({ where: { source: 'EXTERNAL' } }),
    ).toBe(4);
    await runAbuseDetection();
    expect(await signals()).toHaveLength(0);
  });

  test('treasury payouts from one officer to a member raise a low-severity funnel', async () => {
    const officer = await createPlayer('Officer');
    const member = await createPlayer('Member');
    const alliance = await prisma.alliances.create({
      data: { name: 'Funnel Alliance', leader_id: officer.id },
    });
    await times(5, () =>
      prisma.alliance_bank_history.create({
        data: {
          alliance_id: alliance.id,
          transaction_type: 'WITHDRAWAL',
          amount: 1_000_000n,
          related_user_id: member.id,
          performed_by_user_id: officer.id,
        },
      }),
    );
    await runAbuseDetection();
    const [signal] = await signals('RESOURCE_FUNNELLING');
    expect(signal.userId).toBe(member.id);
    expect(signal.severity).toBe('LOW');
    expect((signal.evidence as any).via).toBe('alliance');
  });

  test('gold passed back and forth between two accounts raises a ping-pong signal', async () => {
    const [a, b] = await Promise.all([
      createPlayer('Ping'),
      createPlayer('Pong'),
    ]);
    await times(4, async () => {
      await transfer(a.id, b.id, 600_000);
      await transfer(b.id, a.id, 580_000);
    });
    const summary = await runAbuseDetection();
    expect(summary.pingPong).toBe(1);
    const found = (await signals('RESOURCE_FUNNELLING')).find(
      (s) => (s.evidence as any).kind === 'gold-ping-pong',
    );
    expect(found?.userId).toBe(Math.min(a.id, b.id));
    expect(found?.linkedUserIds).toEqual([Math.max(a.id, b.id)]);
  });

  test('one-way gifts and lopsided exchanges are not ping-pong', async () => {
    const [a, b] = await Promise.all([
      createPlayer('Giver'),
      createPlayer('Taker'),
    ]);
    await times(6, () => transfer(a.id, b.id, 800_000));
    await runAbuseDetection();
    expect(await signals()).toHaveLength(0);
  });

  test('the write-time check raises ping-pong right after a transfer', async () => {
    const [a, b] = await Promise.all([createPlayer('Wa'), createPlayer('Wb')]);
    await times(3, async () => {
      await transfer(a.id, b.id, 600_000);
      await transfer(b.id, a.id, 600_000);
    });
    expect(await signals()).toHaveLength(0);
    await evaluateTransferPair(b.id, a.id);
    expect(await signals('RESOURCE_FUNNELLING')).toHaveLength(1);
  });
});

describe('bot-like timing', () => {
  const activityDay = (
    userId: number,
    daysAgo: number,
    overrides: Record<string, number> = {},
  ) =>
    prisma.activityDay.create({
      data: {
        userId,
        day: new Date(
          Date.UTC(
            new Date().getUTCFullYear(),
            new Date().getUTCMonth(),
            new Date().getUTCDate() - daysAgo,
          ),
        ),
        hourMask: 0b111,
        actions: 50,
        gapCount: 0,
        gapSum: 0,
        gapSumSq: 0,
        lastAt: new Date(),
        ...overrides,
      },
    });

  test('activity in 22 hours a day for three days raises a signal', async () => {
    const user = await createPlayer('Always On');
    for (const daysAgo of [1, 2, 3])
      await activityDay(user.id, daysAgo, { hourMask: (1 << 22) - 1 });
    const summary = await runAbuseDetection();
    expect(summary.bot).toBe(1);
    const [signal] = await signals('BOT_TIMING');
    expect(signal.userId).toBe(user.id);
    expect((signal.evidence as any).reasons).toEqual(['always-on']);
  });

  test('perfectly regular action intervals over many actions raise a signal', async () => {
    const user = await createPlayer('Metronome');
    await activityDay(user.id, 1, {
      actions: 700,
      gapCount: 650,
      gapSum: 650 * 5,
      gapSumSq: 650 * 25,
    });
    await runAbuseDetection();
    const [signal] = await signals('BOT_TIMING');
    expect((signal.evidence as any).reasons).toContain('regular-intervals');
  });

  test('a long human day with varied intervals raises nothing', async () => {
    const user = await createPlayer('Human');
    // 650 gaps averaging 30 s with a wide spread.
    for (const daysAgo of [1, 2, 3])
      await activityDay(user.id, daysAgo, {
        hourMask: (1 << 14) - 1,
        actions: 300,
        gapCount: 250,
        gapSum: 250 * 30,
        gapSumSq: 250 * (30 * 30 + 25 * 25),
      });
    await runAbuseDetection();
    expect(await signals('BOT_TIMING')).toHaveLength(0);
  });

  test('the hours-per-day threshold is a setting', async () => {
    const user = await createPlayer('Night Owl');
    for (const daysAgo of [1, 2, 3])
      await activityDay(user.id, daysAgo, { hourMask: (1 << 16) - 1 });
    await runAbuseDetection();
    expect(await signals('BOT_TIMING')).toHaveLength(0);
    await setSetting('abuse.bot.minHoursPerDay', 16);
    await runAbuseDetection();
    expect(await signals('BOT_TIMING')).toHaveLength(1);
  });

  test('markGameplayActivity keeps per-day counters with hour set and interval sums', async () => {
    const user = await createPlayer('Counter');
    await markGameplayActivity(user.id);
    await settleActivityWrites();
    await new Promise((resolve) => setTimeout(resolve, 60));
    await markGameplayActivity(user.id);
    await settleActivityWrites();
    await new Promise((resolve) => setTimeout(resolve, 60));
    await markGameplayActivity(user.id);
    await settleActivityWrites();
    const rows = await prisma.activityDay.findMany({
      where: { userId: user.id },
    });
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row.actions).toBe(3);
    expect(row.gapCount).toBe(2);
    expect(row.gapSum).toBeGreaterThan(0.1);
    expect(row.gapSum).toBeLessThan(5);
    expect(row.gapSumSq).toBeGreaterThan(0);
    expect(row.hourMask).toBeGreaterThan(0);
  });

  test('counters older than the retention window are pruned by the daily run', async () => {
    const user = await createPlayer('Old Counter');
    await activityDay(user.id, 20);
    await activityDay(user.id, 1);
    const summary = await runAbuseDetection();
    expect(summary.prunedActivityDays).toBe(1);
    expect(await prisma.activityDay.count()).toBe(1);
  });
});

describe('fresh-account farming', () => {
  test('five beaten attacks on a two-day-old account raise a signal', async () => {
    const [attacker, victim] = await Promise.all([
      createPlayer('Farmer'),
      createPlayer('Newbie'),
    ]);
    await ageAccount(attacker.id, 60);
    await ageAccount(victim.id, 2);
    await times(5, () => attack(attacker.id, victim.id));
    const summary = await runAbuseDetection();
    expect(summary.fresh).toBe(1);
    const [signal] = await signals('FRESH_ACCOUNT_FARMING');
    expect(signal.userId).toBe(attacker.id);
    expect(signal.relatedUserId).toBe(victim.id);
    expect(signal.linkedUserIds).toEqual([victim.id]);
  });

  test('the same attacks on an established account raise nothing', async () => {
    const [attacker, victim] = await Promise.all([
      createPlayer('Hunter'),
      createPlayer('Veteran'),
    ]);
    await ageAccount(victim.id, 30);
    await times(8, () => attack(attacker.id, victim.id));
    await runAbuseDetection();
    expect(await signals('FRESH_ACCOUNT_FARMING')).toHaveLength(0);
  });

  test('four attacks, or a new account that wins back, raise nothing; the minimum is a setting', async () => {
    const [attacker, victim] = await Promise.all([
      createPlayer('Light'),
      createPlayer('Fresh'),
    ]);
    await ageAccount(victim.id, 1);
    await times(4, () => attack(attacker.id, victim.id));
    await runAbuseDetection();
    expect(await signals('FRESH_ACCOUNT_FARMING')).toHaveLength(0);
    await setSetting('abuse.fresh.minAttacks', 4);
    await runAbuseDetection();
    expect(await signals('FRESH_ACCOUNT_FARMING')).toHaveLength(1);
  });

  test('attacks made after the account passed the age limit do not count', async () => {
    const [attacker, victim] = await Promise.all([
      createPlayer('Late'),
      createPlayer('Grown'),
    ]);
    await ageAccount(victim.id, 9);
    // Created 9 days ago: attacks 1 day ago happened at age 8 (> 7 days).
    await times(6, () =>
      attack(
        attacker.id,
        victim.id,
        attacker.id,
        1,
        new Date(Date.now() - DAY_MS),
      ),
    );
    await runAbuseDetection();
    expect(await signals('FRESH_ACCOUNT_FARMING')).toHaveLength(0);
  });

  test('the write-time check raises it right after the fifth attack', async () => {
    const [attacker, victim] = await Promise.all([
      createPlayer('Quick'),
      createPlayer('Quicker'),
    ]);
    await ageAccount(victim.id, 1);
    await times(5, () => attack(attacker.id, victim.id));
    await evaluateAttackPair(attacker.id, victim.id);
    expect(await signals('FRESH_ACCOUNT_FARMING')).toHaveLength(1);
  });
});

describe('normal play', () => {
  test('a dev-seed style game raises no signal', async () => {
    const players = await Promise.all(
      ['Seed A', 'Seed B', 'Seed C'].map(createPlayer),
    );
    for (const [i, player] of players.entries()) {
      await ageAccount(player.id, 30);
      await loginAndSettle({
        userId: player.id,
        ip: `203.0.113.${100 + i}`,
        userAgent: 'Synthetic Browser/1.0',
      });
      await markGameplayActivity(player.id);
    }
    await settleActivityWrites();
    await times(2, () => attack(players[0].id, players[1].id));
    await attack(players[1].id, players[0].id);
    await attack(players[2].id, players[0].id);
    await transfer(players[0].id, players[1].id, 50_000);
    await transfer(players[1].id, players[0].id, 30_000);
    const summary = await runAbuseDetection();
    expect(summary).toMatchObject({
      skipped: false,
      network: 0,
      funnel: 0,
      pingPong: 0,
      bot: 0,
      fresh: 0,
    });
    expect(await signals()).toHaveLength(0);
  });

  test('turning detection off raises nothing and skips the sweep', async () => {
    const [a, b, c] = await Promise.all([
      createPlayer('Off A'),
      createPlayer('Off B'),
      createPlayer('Off C'),
    ]);
    await setSetting('abuse.enabled', false);
    for (const user of [a, b, c])
      await loginAndSettle({ userId: user.id, ip: '203.0.113.9' });
    const summary = await runAbuseDetection();
    expect(summary.skipped).toBe(true);
    expect(await signals()).toHaveLength(0);
  });
});

describe('staff review', () => {
  const raiseOne = async () => {
    const { sink, feeders } = await (async () => {
      const sinkUser = await createPlayer('Review Sink');
      const feederUsers = await Promise.all(
        [1, 2, 3].map((i) => createPlayer(`Review Feeder ${i}`)),
      );
      return { sink: sinkUser, feeders: feederUsers };
    })();
    for (const feeder of feeders)
      await times(5, () => transfer(feeder.id, sink.id, 200_000));
    await runAbuseDetection();
    const [signal] = await signals('RESOURCE_FUNNELLING');
    const staff = await createPlayer('Staff');
    return { signal, sink, feeders, staff };
  };

  test('reviewing records the note and an audit entry and leaves the player untouched', async () => {
    const { signal, sink, staff } = await raiseOne();
    const before = await prisma.users.findUniqueOrThrow({
      where: { id: sink.id },
    });
    await CheatDetectionService.applyAction(
      staff.id,
      signal.id,
      'acknowledge',
      '192.0.2.1',
      'Looks like a guild bank run',
    );
    const reviewed = await prisma.cheatSignal.findUniqueOrThrow({
      where: { id: signal.id },
    });
    expect(reviewed.status).toBe('ACKNOWLEDGED');
    expect(reviewed.reviewNote).toBe('Looks like a guild bank run');
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'ADMIN_CHEAT_SIGNAL_ACTION', entityId: signal.id },
    });
    expect((audit?.details as any).note).toBe('Looks like a guild bank run');
    const after = await prisma.users.findUniqueOrThrow({
      where: { id: sink.id },
    });
    expect(after.account_status).toBe(before.account_status);
    expect(after.gold).toBe(before.gold);
  });

  test('a closed signal cannot be changed again', async () => {
    const { signal, staff } = await raiseOne();
    await CheatDetectionService.applyAction(
      staff.id,
      signal.id,
      'dismiss',
      '192.0.2.1',
      'fine',
    );
    await expect(
      CheatDetectionService.applyAction(
        staff.id,
        signal.id,
        'takeAction',
        '192.0.2.1',
      ),
    ).rejects.toThrow('Signal state changed');
  });

  test('a dismissed pattern is not re-raised the next day, but a new pattern is', async () => {
    const { signal, sink, staff } = await raiseOne();
    await CheatDetectionService.applyAction(
      staff.id,
      signal.id,
      'dismiss',
      '192.0.2.1',
      'guild bank',
    );
    await runAbuseDetection();
    expect(await signals('RESOURCE_FUNNELLING')).toHaveLength(1);
    // A different sink is a different pattern and still signals.
    const other = await createPlayer('Other Sink');
    const feeders = await Promise.all(
      [1, 2, 3].map((i) => createPlayer(`Other Feeder ${i}`)),
    );
    for (const feeder of feeders)
      await times(5, () => transfer(feeder.id, other.id, 200_000));
    await runAbuseDetection();
    const all = await signals('RESOURCE_FUNNELLING');
    expect(all).toHaveLength(2);
    expect(all.filter((s) => s.status === 'OPEN').map((s) => s.userId)).toEqual(
      [other.id],
    );
    expect(sink.id).not.toBe(other.id);
  });

  test('the list filters by type, severity, status and any involved player', async () => {
    const { signal, sink, feeders } = await raiseOne();
    const byFeeder = await CheatDetectionService.listSignals({
      userId: feeders[0].id,
    });
    expect(byFeeder.total).toBe(1);
    expect(byFeeder.signals[0].linkedUsers.map((u) => u.id).sort()).toEqual(
      feeders.map((f) => f.id).sort(),
    );
    expect(
      (await CheatDetectionService.listSignals({ userId: sink.id })).total,
    ).toBe(1);
    expect(
      (await CheatDetectionService.listSignals({ type: 'BOT_TIMING' })).total,
    ).toBe(0);
    expect(
      (await CheatDetectionService.listSignals({ severity: signal.severity }))
        .total,
    ).toBe(1);
    expect(
      (await CheatDetectionService.listSignals({ status: 'DISMISSED' })).total,
    ).toBe(0);
  });
});

describe('bot-timing sweep covers every player', () => {
  const alwaysOnRows = (userId: number) =>
    [1, 2, 3].map((daysAgo) => ({
      userId,
      day: new Date(
        Date.UTC(
          new Date().getUTCFullYear(),
          new Date().getUTCMonth(),
          new Date().getUTCDate() - daysAgo,
        ),
      ),
      hourMask: (1 << 22) - 1,
      actions: 60,
      lastAt: new Date(),
    }));

  test('a player beyond the first 50,000 activity rows is still examined', async () => {
    // 8,000 ordinary players below the bot's id, 7 quiet days each: more than
    // the 50,000 rows the old single read stopped at.
    await prisma.$executeRawUnsafe(`
      INSERT INTO users (email, display_name, password_hash, race, class, locale, recruit_link)
      SELECT 'bulk' || n || '@example.test', 'Bulk ' || n, 'x', 'HUMAN', 'FIGHTER', 'en', 'bulk-link-' || n FROM generate_series(1, 8000) n`);
    await prisma.$executeRawUnsafe(`
      INSERT INTO "ActivityDay" ("userId","day","hourMask","actions","lastAt")
      SELECT u.id, (now() AT TIME ZONE 'UTC')::date - d, 3, 1, now()
      FROM users u CROSS JOIN generate_series(0, 6) d WHERE u.email LIKE 'bulk%'`);
    // Created after the bulk players, so it has the highest id of all.
    const late = await createPlayer('Highest Id Bot');
    await prisma.activityDay.createMany({ data: alwaysOnRows(late.id) });
    const summary = await runAbuseDetection();
    expect(summary.bot).toBe(1);
    expect((await signals('BOT_TIMING')).map((s) => s.userId)).toEqual([
      late.id,
    ]);
  }, 120000);

  test("batches walk every candidate and keep each player's window whole", async () => {
    const players = await Promise.all(
      Array.from({ length: 5 }, (_, i) => createPlayer(`Batch Bot ${i}`)),
    );
    for (const player of players)
      await prisma.activityDay.createMany({ data: alwaysOnRows(player.id) });
    const { DEFAULT_ABUSE_CONFIG } = await import('@/constants/abuseSignals');
    const raised = await detectBotTiming(
      DEFAULT_ABUSE_CONFIG,
      new Date(),
      createBudget(60_000),
      2, // two players per batch: three batches, the last one partial
    );
    expect(raised).toBe(5);
    for (const signal of await signals('BOT_TIMING'))
      expect((signal.evidence as any).daysObserved).toBe(3);
  });
});

describe('deadlines and indexes', () => {
  test('the sweep windows are indexed on their time column', async () => {
    const rows = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
        AND indexname IN (
          'bank_history_history_type_date_time_idx',
          'recruit_history_source_timestamp_idx',
          'LoginEvent_occurredAt_idx')`;
    expect(rows.map((r) => r.indexname).sort()).toEqual([
      'LoginEvent_occurredAt_idx',
      'bank_history_history_type_date_time_idx',
      'recruit_history_source_timestamp_idx',
    ]);
  });

  test('withDbDeadline cancels a statement that runs past its deadline', async () => {
    const started = Date.now();
    await expect(
      withDbDeadline((tx) => tx.$queryRaw`SELECT pg_sleep(5)`, {
        statementMs: 200,
      }),
    ).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(3000);
    // The deadline is transaction-local: it did not leak onto the pooled connection.
    const [row] = await prisma.$queryRaw<Array<{ statement_timeout: string }>>`
      SHOW statement_timeout`;
    expect(row.statement_timeout).not.toBe('200ms');
  });

  test('a signal write fails fast on a contended advisory lock instead of hanging', async () => {
    const user = await createPlayer('Locked');
    const lockKey = cheatSignalIdentityLockKey(
      'abuse:BOT_TIMING:bot:lock-test',
    );
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let acquired!: () => void;
    const lockTaken = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const holder = prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey}::bigint)`;
        acquired();
        await held;
      },
      { timeout: 30000 },
    );
    await lockTaken;
    const started = Date.now();
    try {
      await expect(
        raiseAbuseSignal({
          type: 'BOT_TIMING',
          userId: user.id,
          linkedUserIds: [],
          dedupeKey: 'bot:lock-test',
          score: 50,
          summary: 'x',
          evidence: {},
        }),
      ).rejects.toThrow();
      expect(Date.now() - started).toBeLessThan(6000);
    } finally {
      release();
      await holder;
    }
    expect(await signals()).toHaveLength(0);
  }, 30000);
});
