/**
 * Integration coverage for the defector-farming cheat signal (#205): a
 * receiver repeatedly collecting one loser's defectors signals for staff
 * review, while ordinary defections never do.
 *
 * Trigger: within a rolling 14-day window, one receiver collected the same
 * loser's defectors on 3+ distinct OT days, OR took at least half of
 * everything that loser lost to desertion. Signal only — gameplay is never
 * blocked. Detection runs on plain prisma right AFTER the loser's daily
 * morale pass commits (a failure inside the pass's transaction would roll
 * the whole day back on Postgres), and again on any same-day re-run of the
 * pass; the per-pair dedupe keeps every evaluation idempotent.
 *
 * Multi-day scenarios backdate each simulated day's desertion events so the
 * events land on distinct OT days (and yesterday's DEFECT rows stop counting
 * against the receiver's daily cap).
 */
import { beforeEach, describe, expect, spyOn, test } from 'bun:test';

import prisma from '@/lib/prisma';
import { loadProtectionContext } from '@/services/BattleProtection.service';
import { CheatDetectionService } from '@/services/CheatDetection.service';
import { CronJobService } from '@/services/CronJob.service';
import { KingdomMoraleService } from '@/services/KingdomMorale.service';
import { createUser } from '@/services/User.service';
import { getOTDayKey } from '@/utils/timefunctions';

import { resetDatabase, setDesertion } from './db';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
/** Level 10 (80k XP) ends new-player protection by the LEVEL rule. */
const UNPROTECTED_XP = 80_000;

const createPlayer = (name: string) =>
  createUser(
    `${name.toLowerCase().replace(/\s+/g, '-')}@example.test`,
    'not-a-real-hash',
    name,
    'HUMAN',
    'FIGHTER',
  );

const setUnits = async (
  userId: number,
  type: 'OFFENSE' | 'DEFENSE' | 'SPY' | 'SENTRY' | 'CITIZEN',
  quantity: number,
  level = 1,
) => {
  await prisma.userUnit.upsert({
    where: {
      userId_type_level_isMercenary: {
        userId,
        type,
        level,
        isMercenary: false,
      },
    },
    create: { userId, type, level, quantity, isMercenary: false },
    update: { quantity },
  });
};

const unitQuantity = async (userId: number, type: string) => {
  const rows = await prisma.userUnit.findMany({
    where: { userId, type, isMercenary: false },
  });
  return rows.reduce((sum, row) => sum + row.quantity, 0);
};

/** An era that started long enough ago that inactive players still count as participants. */
const seedEra = () =>
  prisma.era.create({
    data: {
      name: 'Farming era',
      startDate: new Date(Date.now() - 20 * DAY_MS),
    },
  });

/** One fabricated battle log: `attackerId` attacked `defenderId`. */
const logAttack = (attackerId: number, defenderId: number, timestamp: Date) =>
  prisma.attack_log.create({
    data: {
      timestamp,
      winner: attackerId,
      type: 'attack',
      pillaged_gold: 0n,
      attacker_losses_total: 0,
      defender_losses_total: 0,
      stats: {},
      attackerPlayer: { connect: { id: attackerId } },
      defenderPlayer: { connect: { id: defenderId } },
    },
  });

/**
 * Simulates the OT day rolling over: back-date every kingdom's morale day
 * marker so the next daily pass applies again.
 */
const nextDay = () =>
  prisma.users.updateMany({
    data: { kingdom_morale_day: getOTDayKey(new Date(Date.now() - DAY_MS)) },
  });

const maxDesertionEventId = async () => {
  const row = await prisma.desertionEvent.aggregate({ _max: { id: true } });
  return row._max.id ?? 0;
};

/** Backdates the events of one simulated day so it lands `daysAgo` OT days back. */
const backdateNewEvents = async (afterId: number, daysAgo: number) => {
  await prisma.desertionEvent.updateMany({
    where: { id: { gt: afterId } },
    data: { createdAt: new Date(Date.now() - daysAgo * DAY_MS) },
  });
};

/**
 * One simulated OT day: re-arm the morale pass, run the daily cron, then
 * move the day's desertion events `daysAgo` back so later days see distinct
 * OT day keys (and the receiver's daily cap is free again).
 */
const runFarmingDay = async (daysAgo: number) => {
  await nextDay();
  const before = await maxDesertionEventId();
  await CronJobService.processDailyUpdates();
  await backdateNewEvents(before, daysAgo);
};

/** The loser's DEFECTOR_FARMING signals, newest first. */
const farmingSignals = (filters?: {
  userId?: number;
  relatedUserId?: number;
}) =>
  prisma.cheatSignal.findMany({
    where: { type: 'DEFECTOR_FARMING', ...filters },
    orderBy: { id: 'desc' },
  });

/**
 * A receiver with a 4000-strong trained army (daily defector cap 40) who
 * attacked the given losers an hour ago, plus each loser: 10000 trained
 * soldiers, 5000 citizens (their daily CITIZENS desertion dilutes the
 * receiver's share far below half) and morale 15, decaying -5/day because
 * the owner has been away three days — desertion applies every simulated day.
 */
const seedFarmingPair = async (
  receiverName: string,
  loserNames: string[],
  receiverExtra: Parameters<typeof prisma.users.update>[0]['data'] = {},
) => {
  const now = Date.now();
  const receiver = await createPlayer(receiverName);
  await prisma.users.update({
    where: { id: receiver.id },
    data: {
      experience: UNPROTECTED_XP,
      last_active: new Date(now - 1 * HOUR_MS),
      kingdom_morale: 100,
      ...receiverExtra,
    },
  });
  await setUnits(receiver.id, 'OFFENSE', 2000);
  await setUnits(receiver.id, 'DEFENSE', 2000);

  const losers = [];
  for (const name of loserNames) {
    const loser = await createPlayer(name);
    await prisma.users.update({
      where: { id: loser.id },
      data: {
        experience: UNPROTECTED_XP,
        last_active: new Date(now - 3 * DAY_MS),
        kingdom_morale: 15,
      },
    });
    await setUnits(loser.id, 'DEFENSE', 10000);
    await setUnits(loser.id, 'CITIZEN', 5000);
    await logAttack(receiver.id, loser.id, new Date(now - 1 * HOUR_MS));
    losers.push(loser);
  }
  return { receiver, losers };
};

beforeEach(async () => {
  await resetDatabase();
  // Desertion is an admin switch, off by default; these suites test it on.
  await setDesertion(true);
  await seedEra();
});

describe('defector farming cheat signal', () => {
  test("raised on the third distinct OT day one receiver collects a loser's defectors", async () => {
    const { receiver, losers } = await seedFarmingPair('Farm receiver', [
      'Farm loser',
    ]);
    const [loser] = losers;

    await runFarmingDay(2);
    // One day so far: below the 3-day minimum, share diluted by citizens.
    expect(await farmingSignals()).toHaveLength(0);

    await runFarmingDay(1);
    // Two distinct days: still no signal.
    expect(await farmingSignals()).toHaveLength(0);

    await runFarmingDay(0);
    // Three distinct days: exactly one signal on the receiver, pointing at
    // the loser it farmed.
    const signals = await farmingSignals();
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      userId: receiver.id,
      relatedUserId: loser.id,
      type: 'DEFECTOR_FARMING',
      status: 'OPEN',
      severity: 'LOW',
      score: 1,
    });
    expect(signals[0].evidence).toMatchObject({
      distinctDays: 3,
      reasons: ['DAYS'],
      windowDays: 14,
    });
    // Diluted share is far below half, so the day count alone triggered it.
    expect((signals[0].evidence as { share: number }).share).toBeLessThan(0.5);
  });

  test('not raised at two distinct days', async () => {
    await seedFarmingPair('Two day receiver', ['Two day loser']);

    await runFarmingDay(1);
    await runFarmingDay(0);

    expect(await farmingSignals()).toHaveLength(0);
  });

  test('raised on share alone when the receiver took half of everything a stripped loser bled', async () => {
    const now = Date.now();
    const { receiver, losers } = await seedFarmingPair('Share receiver', [
      'Share loser',
    ]);
    const [loser] = losers;
    // Strip the citizen dilution: a pure-army kingdom at morale 0 loses only
    // trained soldiers, half of which defect — the receiver takes exactly
    // half of everything it bled on a single day.
    await setUnits(loser.id, 'CITIZEN', 50);
    await prisma.users.update({
      where: { id: loser.id },
      data: { kingdom_morale: 0 },
    });
    // A cap big enough to take every defector (1% of 20000).
    await setUnits(receiver.id, 'OFFENSE', 10000);
    await setUnits(receiver.id, 'DEFENSE', 10000);

    await CronJobService.processDailyUpdates();

    const signals = await farmingSignals();
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      userId: receiver.id,
      relatedUserId: loser.id,
      severity: 'LOW',
      score: 1,
    });
    expect(signals[0].evidence).toMatchObject({
      distinctDays: 1,
      defectedToReceiver: 50,
      totalLostToDesertion: 100,
      share: 0.5,
      reasons: ['SHARE'],
    });
  });

  test('rerunning the daily pass on the same OT day is idempotent', async () => {
    const { losers } = await seedFarmingPair('Idempotent receiver', [
      'Idempotent loser',
    ]);
    const [loser] = losers;

    await runFarmingDay(2);
    await runFarmingDay(1);
    await runFarmingDay(0);
    const signals = await farmingSignals();
    expect(signals).toHaveLength(1);
    const before = signals[0];

    // A retried cron run the same OT day: every pass is stale. Detection
    // still runs after each one (it reads the committed desertionEvent
    // rows), re-confirming the open signal in place.
    await CronJobService.processDailyUpdates();
    const era = await prisma.era.findFirstOrThrow({
      where: { endDate: null },
      orderBy: { startDate: 'desc' },
    });

    // The direct re-run is stale, yet it still evaluates detection — the
    // recovery path for a detection that failed after a committed pass.
    const detection = spyOn(CheatDetectionService, 'detectDefectorFarming');
    try {
      const direct = await KingdomMoraleService.processDailyKingdomMorale(
        loser.id,
        await loadProtectionContext(),
        { id: era.id, startDate: new Date(era.startDate) },
      );
      expect(direct).toBe('stale');
      expect(detection).toHaveBeenCalledTimes(1);
      expect(detection).toHaveBeenCalledWith(loser.id, expect.any(Date));
    } finally {
      detection.mockRestore();
    }

    // One row per pair, never two: same id, same score, same evidence; the
    // re-evaluation only re-stamps the same pattern it already recorded.
    const after = await farmingSignals();
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(before.id);
    expect(after[0].score).toBe(before.score);
    expect(after[0].evidence).toEqual(before.evidence);
    expect(after[0].lastSeenAt.getTime()).toBeGreaterThanOrEqual(
      before.lastSeenAt.getTime(),
    );
  });

  test('a detection failure after the commit never rolls the morale pass back', async () => {
    const { receiver, losers } = await seedFarmingPair('Throwing receiver', [
      'Throwing loser',
    ]);
    const [loser] = losers;
    const era = await prisma.era.findFirstOrThrow({
      where: { endDate: null },
      orderBy: { startDate: 'desc' },
    });
    const recipientCitizensBefore = await unitQuantity(receiver.id, 'CITIZEN');

    // Detection blows up AFTER the pass commits. On Postgres a failed
    // statement inside the pass's transaction would abort it and roll the
    // whole day back; detection therefore runs outside, on plain prisma,
    // and its failure is only logged.
    const detection = spyOn(
      CheatDetectionService,
      'detectDefectorFarming',
    ).mockRejectedValue(new Error('detection exploded'));
    try {
      const outcome = await KingdomMoraleService.processDailyKingdomMorale(
        loser.id,
        await loadProtectionContext(),
        { id: era.id, startDate: new Date(era.startDate) },
      );
      expect(outcome).toBe('success');
      expect(detection).toHaveBeenCalledTimes(1);

      // Every morale-pass effect persisted: morale stamped for the OT day,
      // units lost, desertion events recorded, defectors transferred.
      const row = await prisma.users.findUniqueOrThrow({
        where: { id: loser.id },
      });
      expect(row.kingdom_morale).toBe(10);
      expect(row.kingdom_morale_day).toBe(getOTDayKey(new Date()));
      expect(await unitQuantity(loser.id, 'DEFENSE')).toBe(9900);
      const defected = await prisma.desertionEvent.findMany({
        where: { kind: 'DEFECT', defectedToUserId: receiver.id },
      });
      expect(defected.reduce((sum, event) => sum + event.quantity, 0)).toBe(40);
      expect(await unitQuantity(receiver.id, 'CITIZEN')).toBe(
        recipientCitizensBefore + 40,
      );
    } finally {
      detection.mockRestore();
    }
  });

  test('two concurrent detections of the same pair raise exactly one signal', async () => {
    const { receiver, losers } = await seedFarmingPair('Race receiver', [
      'Race loser',
    ]);
    const [loser] = losers;
    // Three days of committed DEFECT rows to the same receiver: enough to
    // trigger on distinct OT days. Seeded directly — the race under test is
    // the signal write, not the morale pass.
    for (const daysAgo of [2, 1, 0]) {
      await prisma.desertionEvent.create({
        data: {
          userId: loser.id,
          kind: 'DEFECT',
          unitType: 'DEFENSE',
          unitLevel: 1,
          quantity: 10,
          defectedToUserId: receiver.id,
          createdAt: new Date(Date.now() - daysAgo * DAY_MS),
        },
      });
    }

    // Two detections race, as an overlapping cron pass retried the loser.
    await Promise.all([
      CheatDetectionService.detectDefectorFarming(loser.id),
      CheatDetectionService.detectDefectorFarming(loser.id),
    ]);

    // The per-pair advisory lock serializes the find/update/create: the
    // second detection sees the first's committed signal and bumps it in
    // place instead of creating a duplicate.
    const signals = await farmingSignals();
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      userId: receiver.id,
      relatedUserId: loser.id,
      type: 'DEFECTOR_FARMING',
      status: 'OPEN',
    });
    expect(signals[0].evidence).toMatchObject({ distinctDays: 3 });
  });

  test('later days update the open signal instead of duplicating it', async () => {
    const { receiver, losers } = await seedFarmingPair('Update receiver', [
      'Update loser',
    ]);
    const [loser] = losers;

    await runFarmingDay(3);
    await runFarmingDay(2);
    await runFarmingDay(1);
    const dayThree = (await farmingSignals())[0];
    expect(dayThree).toMatchObject({ score: 1 });
    expect(dayThree.evidence).toMatchObject({ distinctDays: 3 });

    await runFarmingDay(0);

    const signals = await farmingSignals();
    expect(signals).toHaveLength(1);
    expect(signals[0].id).toBe(dayThree.id);
    // The fourth distinct day bumps the score and refreshes the evidence...
    expect(signals[0].score).toBe(2);
    expect(signals[0].evidence).toMatchObject({
      distinctDays: 4,
      defectedToReceiver: 160,
    });
    // ...and the pair stays pinned to the same receiver and loser.
    expect(signals[0]).toMatchObject({
      userId: receiver.id,
      relatedUserId: loser.id,
    });
    expect(signals[0].lastSeenAt.getTime()).toBeGreaterThan(
      dayThree.lastSeenAt.getTime(),
    );
  });

  test('independent pairs never cross-trigger', async () => {
    // R1 collects from two different losers on three calendar days in
    // total, but never three days from the SAME loser.
    const { receiver: receiver1, losers: diluted } = await seedFarmingPair(
      'Cross receiver',
      ['Cross loser A', 'Cross loser B'],
    );
    const [loserA, loserB] = diluted;
    // Loser B stays healthy until the last day, so it feeds R1 once only.
    await prisma.users.update({
      where: { id: loserB.id },
      data: { kingdom_morale: 40 },
    });
    // An independent pair that DOES farm: three days, one loser.
    const { receiver: receiver2, losers: farmed } = await seedFarmingPair(
      'True farm receiver',
      ['True farm loser'],
    );
    const [farmLoser] = farmed;

    await runFarmingDay(2);
    await runFarmingDay(1);
    // Loser A recovers; loser B crashes, so R1's day-3 intake comes from a
    // different loser than its day-1 and day-2 intake.
    await prisma.users.update({
      where: { id: loserA.id },
      data: { kingdom_morale: 40 },
    });
    await prisma.users.update({
      where: { id: loserB.id },
      data: { kingdom_morale: 0 },
    });
    await runFarmingDay(0);

    // Exactly one signal: the true farming pair. Receiving on three days
    // from two different losers never accumulates into either pair.
    const signals = await farmingSignals();
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      userId: receiver2.id,
      relatedUserId: farmLoser.id,
    });
    expect(signals[0].evidence).toMatchObject({ distinctDays: 3 });
    expect(await farmingSignals({ userId: receiver1.id })).toHaveLength(0);
    expect(
      await prisma.desertionEvent.count({
        where: { kind: 'DEFECT', defectedToUserId: receiver1.id },
      }),
    ).toBeGreaterThan(0);
  });

  test('a shared login device pattern adds weight to a triggered pair', async () => {
    const now = Date.now();
    const { receiver, losers } = await seedFarmingPair('Linked receiver', [
      'Linked loser',
    ]);
    const [loser] = losers;
    await setUnits(loser.id, 'CITIZEN', 50);
    await prisma.users.update({
      where: { id: loser.id },
      data: { kingdom_morale: 0 },
    });
    await setUnits(receiver.id, 'OFFENSE', 10000);
    await setUnits(receiver.id, 'DEFENSE', 10000);
    // The pair shares a device pattern (distinct IPs) inside the telemetry
    // retention window — the same data the multi-account clusters use.
    for (const userId of [receiver.id, loser.id]) {
      await prisma.loginEvent.create({
        data: {
          userId,
          ipHash: `linked-farm-ip-${userId}`,
          deviceHash: 'linked-farm-device',
          occurredAt: new Date(now - 1 * HOUR_MS),
        },
      });
    }

    await CronJobService.processDailyUpdates();

    const signals = await farmingSignals();
    expect(signals).toHaveLength(1);
    // Share trigger (1) plus the shared login pattern (+2).
    expect(signals[0]).toMatchObject({ score: 3, severity: 'MEDIUM' });
    expect(signals[0].evidence).toMatchObject({ sharedLoginPattern: true });
  });

  test('bots never signal in either direction', async () => {
    const { receiver, losers } = await seedFarmingPair('Bot receiver', [
      'Bot loser',
    ]);
    const [botLoser] = losers;
    await prisma.users.update({
      where: { id: botLoser.id },
      data: { isBot: true },
    });

    await runFarmingDay(2);
    await runFarmingDay(1);
    await runFarmingDay(0);
    // A bot loser feeding a human receiver is ordinary bot play.
    expect(await farmingSignals()).toHaveLength(0);

    // A human loser whose defectors land on a bot receiver is just bots
    // attacking a collapsed kingdom.
    await prisma.users.update({
      where: { id: botLoser.id },
      data: { isBot: false },
    });
    await prisma.users.update({
      where: { id: receiver.id },
      data: { isBot: true },
    });
    await nextDay();
    await CronJobService.processDailyUpdates();

    expect(await farmingSignals()).toHaveLength(0);
  });
});
