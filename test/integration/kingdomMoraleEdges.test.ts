/**
 * Adversarial integration coverage for kingdom morale, desertion and
 * defection (#205), beyond the happy paths in kingdomMorale.test.ts.
 *
 * Covers the daily pass's once-per-OT-day idempotency (including overlapping
 * runs), the era-long desertion floor, whole-army rounding, defector
 * recipient eligibility and ordering, and the defects found by the original
 * adversarial review — double application, self-defection, rounding evasion
 * and repeated re-bleeding — all of which are now fixed behaviour.
 */
import { beforeEach, describe, expect, test } from 'bun:test';

import { ARMY_DESERTION_FLOOR_SHARE } from '@/constants/KingdomMorale';
import prisma from '@/lib/prisma';
import { AttackService } from '@/services/AttackService';
import { loadProtectionContext } from '@/services/BattleProtection.service';
import { CronJobService } from '@/services/CronJob.service';
import { startNewEra } from '@/services/Era.service';
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

const unitQuantity = async (userId: number, type: string, level?: number) => {
  const rows = await prisma.userUnit.findMany({
    where: {
      userId,
      type,
      isMercenary: false,
      ...(level !== undefined ? { level } : {}),
    },
  });
  return rows.reduce((sum, row) => sum + row.quantity, 0);
};

/** Trained army: every non-mercenary OFFENSE/DEFENSE/SPY/SENTRY unit. */
const armyOf = async (userId: number) =>
  (
    await prisma.userUnit.findMany({
      where: {
        userId,
        isMercenary: false,
        type: { in: ['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'] },
      },
    })
  ).reduce((sum, row) => sum + row.quantity, 0);

const userRow = (userId: number) =>
  prisma.users.findUniqueOrThrow({ where: { id: userId } });

/** An era that started long enough ago that 17-day-inactive players still count as participants. */
const seedEra = () =>
  prisma.era.create({
    data: { name: 'Morale era', startDate: new Date(Date.now() - 20 * DAY_MS) },
  });

/** Citizens the daily pass granted this user (reconcile army math around it). */
const citizensGranted = async (userId: number) => {
  const rows = await prisma.bank_history.findMany({
    where: { to_user_id: userId, history_type: 'DAILY_RECRUIT' },
  });
  return rows.reduce((sum, row) => {
    const stats = row.stats as {
      newCitizens: number;
      currentCitizens: number;
    };
    return sum + (Number(stats.newCitizens) - Number(stats.currentCitizens));
  }, 0);
};

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

const desertionTotal = async (
  userId: number,
  kind?: 'ABANDON' | 'DEFECT' | 'CITIZENS' | 'MERCENARY',
) => {
  const rows = await prisma.desertionEvent.findMany({
    where: { userId, ...(kind ? { kind } : {}) },
  });
  return rows.reduce((sum, row) => sum + row.quantity, 0);
};

/**
 * Simulates the OT day rolling over: back-date every kingdom's morale day
 * marker so the next daily pass applies again. Multi-day scenarios in one
 * test use this between processDailyUpdates() calls.
 */
const nextDay = () =>
  prisma.users.updateMany({
    data: { kingdom_morale_day: getOTDayKey(new Date(Date.now() - DAY_MS)) },
  });

beforeEach(async () => {
  await resetDatabase();
  // Desertion is an admin switch, off by default; these suites test it on.
  await setDesertion(true);
  await seedEra();
});

describe('defection cap across several losers on the same day', () => {
  test('five losers defect to one attacker, whose daily gain stays at 1% of its own army', async () => {
    const now = Date.now();
    const recipient = await createPlayer('Cap recipient');
    const losers = [];
    for (let i = 0; i < 5; i += 1) {
      losers.push(await createPlayer(`Cap loser ${i}`));
    }

    await prisma.users.update({
      where: { id: recipient.id },
      data: {
        experience: UNPROTECTED_XP,
        last_active: new Date(now - 1 * HOUR_MS),
        kingdom_morale: 100,
      },
    });
    await setUnits(recipient.id, 'OFFENSE', 1000);
    await setUnits(recipient.id, 'DEFENSE', 1000);

    for (const loser of losers) {
      await prisma.users.update({
        where: { id: loser.id },
        data: {
          experience: UNPROTECTED_XP,
          last_active: new Date(now - 30 * HOUR_MS),
          kingdom_morale: 15,
        },
      });
      await setUnits(loser.id, 'DEFENSE', 10000);
      await logAttack(recipient.id, loser.id, new Date(now - 1 * HOUR_MS));
    }

    // Every loser has 100 deserters today, half of them (50) flagged to defect:
    // 250 candidate defectors against a 2000-strong recipient, cap 20.
    const armyBefore = await armyOf(recipient.id);
    expect(armyBefore).toBe(2000);
    const recipientCitizensBefore = await unitQuantity(recipient.id, 'CITIZEN');

    await CronJobService.processDailyUpdates();

    const defectedRows = await prisma.desertionEvent.findMany({
      where: { kind: 'DEFECT', defectedToUserId: recipient.id },
    });
    const defectedTotal = defectedRows.reduce(
      (sum, row) => sum + row.quantity,
      0,
    );
    // The combined gain never exceeds the 1% daily cap of the recipient's army.
    expect(defectedTotal).toBeLessThanOrEqual(Math.floor(armyBefore * 0.01));
    expect(defectedTotal).toBe(20);
    expect(defectedRows.every((row) => row.quantity > 0)).toBe(true);
    // The excess abandons: each loser still loses exactly 100 today.
    for (const loser of losers) {
      expect(await desertionTotal(loser.id)).toBe(100);
      expect(await armyOf(loser.id)).toBe(9900);
    }
    // Units actually delivered match the ledger, never the candidate total —
    // and they arrive as citizens, so the trained army itself never grows.
    expect(await armyOf(recipient.id)).toBe(2000);
    expect(await unitQuantity(recipient.id, 'DEFENSE')).toBe(1000);
    expect(await unitQuantity(recipient.id, 'OFFENSE')).toBe(1000);
    expect(await unitQuantity(recipient.id, 'CITIZEN')).toBe(
      recipientCitizensBefore + (await citizensGranted(recipient.id)) + 20,
    );
    const credited = await prisma.bank_history.findMany({
      where: {
        history_type: 'KINGDOM_MORALE',
        to_user_id: recipient.id,
      },
    });
    expect(
      credited.reduce(
        (sum, row) =>
          sum +
          Number(
            (row.stats as { defectorsReceived?: number }).defectorsReceived ??
              0,
          ),
        0,
      ),
    ).toBe(20);
  });

  test('defectors arrive as untrained citizens, whatever tier they were (#205)', async () => {
    const now = Date.now();
    // A recipient whose fort only unlocks DEFENSE level 1 (Guard): Archer
    // needs fort 4, Royal Guard fort 7.
    const recipient = await createPlayer('Low-fort recipient');
    const loser = await createPlayer('High-tier loser');
    await prisma.users.update({
      where: { id: recipient.id },
      data: {
        experience: UNPROTECTED_XP,
        last_active: new Date(now - 1 * HOUR_MS),
        kingdom_morale: 100,
        fort_level: 1,
      },
    });
    await prisma.users.update({
      where: { id: loser.id },
      data: {
        experience: UNPROTECTED_XP,
        last_active: new Date(now - 30 * HOUR_MS),
        kingdom_morale: 15,
      },
    });
    await setUnits(recipient.id, 'OFFENSE', 1000);
    await setUnits(recipient.id, 'DEFENSE', 1000);
    // The loser's whole defense is Level 3 Royal Guards.
    await setUnits(loser.id, 'DEFENSE', 10000, 3);
    await logAttack(recipient.id, loser.id, new Date(now - 1 * HOUR_MS));

    const recipientCitizensBefore = await unitQuantity(recipient.id, 'CITIZEN');

    await CronJobService.processDailyUpdates();

    // The loser lost its 100 deserters from the Level 3 row...
    expect(await unitQuantity(loser.id, 'DEFENSE')).toBe(9900);
    // ...but the 20 the recipient gained arrived as Level 1 CITIZENS that
    // must still be paid for and trained: no trained tier, high or low,
    // ever lands with a defector.
    expect(await unitQuantity(recipient.id, 'DEFENSE', 1)).toBe(1000);
    expect(await unitQuantity(recipient.id, 'DEFENSE', 3)).toBe(0);
    expect(await unitQuantity(recipient.id, 'CITIZEN')).toBe(
      recipientCitizensBefore + (await citizensGranted(recipient.id)) + 20,
    );
    const defect = await prisma.desertionEvent.findFirstOrThrow({
      where: { kind: 'DEFECT', defectedToUserId: recipient.id },
    });
    // The ledger still records the loser's side: its Level 3 row left.
    expect(defect).toMatchObject({ unitType: 'DEFENSE', unitLevel: 3 });
  });
});

describe('citizens never count as trained army', () => {
  test('a citizen hoard inflates neither the desertion floor, the 1% loss nor the recipient cap', async () => {
    const now = Date.now();
    const recipient = await createPlayer('Hoard recipient');
    const loser = await createPlayer('Hoard loser');

    // A recipient with a 200-strong trained army and a million citizens.
    await prisma.users.update({
      where: { id: recipient.id },
      data: {
        experience: UNPROTECTED_XP,
        last_active: new Date(now - 1 * HOUR_MS),
        kingdom_morale: 100,
      },
    });
    await setUnits(recipient.id, 'OFFENSE', 100);
    await setUnits(recipient.id, 'DEFENSE', 100);
    await setUnits(recipient.id, 'CITIZEN', 1_000_000);

    // A loser with 10,000 trained soldiers and the same million citizens.
    await prisma.users.update({
      where: { id: loser.id },
      data: {
        experience: UNPROTECTED_XP,
        last_active: new Date(now - 3 * DAY_MS),
        kingdom_morale: 15,
      },
    });
    await setUnits(loser.id, 'DEFENSE', 10_000);
    await setUnits(loser.id, 'CITIZEN', 1_000_000);
    await logAttack(recipient.id, loser.id, new Date(now - 1 * HOUR_MS));

    await CronJobService.processDailyUpdates();

    // Loser side: 1% of the 10,000 trained soldiers desert (100) and the
    // floor is recorded at 10,000 — never at an army-plus-citizens total
    // (which would make both numbers a hundred times larger). The citizens
    // still leave through their own 1% CITIZENS path.
    const loserRow = await userRow(loser.id);
    expect(loserRow.kingdom_morale).toBe(10);
    expect(loserRow.desertion_floor).toBe(10_000);
    expect(await unitQuantity(loser.id, 'DEFENSE')).toBe(9_900);
    expect(await desertionTotal(loser.id, 'CITIZENS')).toBe(10_000);

    // Recipient side: the daily defector cap is 1% of the 200 trained
    // soldiers (2), not 1% of the million citizens they also hold. The 48
    // overflow candidates abandon, and the two that land arrive as citizens.
    const defectedRows = await prisma.desertionEvent.findMany({
      where: { kind: 'DEFECT', defectedToUserId: recipient.id },
    });
    expect(defectedRows.reduce((sum, row) => sum + row.quantity, 0)).toBe(2);
    expect(await desertionTotal(loser.id, 'ABANDON')).toBe(98);
    expect(await armyOf(recipient.id)).toBe(200);
    expect(await unitQuantity(recipient.id, 'CITIZEN')).toBe(
      1_000_000 + (await citizensGranted(recipient.id)) + 2,
    );
  });
});

describe('running the daily pass twice on the same day', () => {
  // users.kingdom_morale_day gates the pass: a retried POST
  // /api/cronJobs/daily is a strict no-op for every player it already ran for.
  test('morale drift applies once per OT day even when the cron runs twice', async () => {
    const now = Date.now();
    const player = await createPlayer('Twin run decay');
    await prisma.users.update({
      where: { id: player.id },
      data: {
        experience: UNPROTECTED_XP,
        last_active: new Date(now - 30 * HOUR_MS),
        kingdom_morale: 50,
      },
    });

    await CronJobService.processDailyUpdates();
    expect((await userRow(player.id)).kingdom_morale).toBe(53);
    const ledgersAfterFirst = await prisma.bank_history.count({
      where: { to_user_id: player.id, history_type: 'KINGDOM_MORALE' },
    });
    expect(ledgersAfterFirst).toBe(1);

    await CronJobService.processDailyUpdates();

    // One day of being 30h inactive is worth +3, once.
    expect((await userRow(player.id)).kingdom_morale).toBe(53);
    expect((await userRow(player.id)).kingdom_morale_day).toBe(
      getOTDayKey(new Date()),
    );
    expect(
      await prisma.bank_history.count({
        where: { to_user_id: player.id, history_type: 'KINGDOM_MORALE' },
      }),
    ).toBe(1);
  });

  test('desertion applies once per OT day even when the cron runs twice', async () => {
    const now = Date.now();
    const player = await createPlayer('Twin run deserter');
    await prisma.users.update({
      where: { id: player.id },
      data: {
        experience: UNPROTECTED_XP,
        last_active: new Date(now - 3 * DAY_MS),
        kingdom_morale: 10,
      },
    });
    await setUnits(player.id, 'DEFENSE', 5000);

    await CronJobService.processDailyUpdates();
    expect((await userRow(player.id)).kingdom_morale).toBe(5);
    expect(await desertionTotal(player.id, 'ABANDON')).toBe(50);
    expect(await armyOf(player.id)).toBe(4950);
    expect((await userRow(player.id)).desertion_floor).toBe(5000);

    await CronJobService.processDailyUpdates();

    // One day below the threshold costs 1% of the army (50), once.
    expect(await desertionTotal(player.id)).toBe(50);
    expect(await armyOf(player.id)).toBe(4950);
    expect((await userRow(player.id)).desertion_floor).toBe(5000);
    expect(
      await prisma.bank_history.count({
        where: { to_user_id: player.id, history_type: 'KINGDOM_MORALE' },
      }),
    ).toBe(1);
  });
});

describe('overlapping daily passes on the same OT day', () => {
  const runMoralePass = async (userId: number) => {
    const era = await prisma.era.findFirstOrThrow({
      where: { endDate: null },
      orderBy: { startDate: 'desc' },
    });
    return KingdomMoraleService.processDailyKingdomMorale(
      userId,
      await loadProtectionContext(),
      { id: era.id, startDate: new Date(era.startDate) },
    );
  };

  test('two concurrent passes for the same player: exactly one applies', async () => {
    const now = Date.now();
    const player = await createPlayer('Contended kingdom');
    await prisma.users.update({
      where: { id: player.id },
      data: {
        experience: UNPROTECTED_XP,
        last_active: new Date(now - 3 * DAY_MS),
        kingdom_morale: 10,
      },
    });
    await setUnits(player.id, 'DEFENSE', 5000);

    const outcomes = await Promise.all([
      runMoralePass(player.id),
      runMoralePass(player.id),
    ]);

    // One run wins the row lock and applies; the other sees the day marker
    // under the lock and does nothing.
    expect(outcomes.sort()).toEqual(['stale', 'success']);
    expect(await armyOf(player.id)).toBe(4950);
    expect(await desertionTotal(player.id)).toBe(50);
    expect(
      await prisma.bank_history.count({
        where: { to_user_id: player.id, history_type: 'KINGDOM_MORALE' },
      }),
    ).toBe(1);
  });

  test('two losers deserting concurrently to one recipient cannot both spend its 1% cap', async () => {
    const now = Date.now();
    const recipient = await createPlayer('Contended recipient');
    const loserA = await createPlayer('Concurrent loser A');
    const loserB = await createPlayer('Concurrent loser B');

    await prisma.users.update({
      where: { id: recipient.id },
      data: {
        experience: UNPROTECTED_XP,
        last_active: new Date(now - 1 * HOUR_MS),
        kingdom_morale: 100,
      },
    });
    await setUnits(recipient.id, 'OFFENSE', 1000);
    await setUnits(recipient.id, 'DEFENSE', 1000);
    for (const loser of [loserA, loserB]) {
      await prisma.users.update({
        where: { id: loser.id },
        data: {
          experience: UNPROTECTED_XP,
          last_active: new Date(now - 30 * HOUR_MS),
          kingdom_morale: 15,
        },
      });
      await setUnits(loser.id, 'DEFENSE', 10000);
      await logAttack(recipient.id, loser.id, new Date(now - 1 * HOUR_MS));
    }

    const recipientCitizensBefore = await unitQuantity(recipient.id, 'CITIZEN');

    const outcomes = await Promise.all([
      runMoralePass(loserA.id),
      runMoralePass(loserB.id),
    ]);

    expect(outcomes).toEqual(['success', 'success']);
    // Each loser loses its 100; the combined defection to the recipient is
    // capped at 1% of its 2000-strong army: 20 in total, never 20 + 20 —
    // and they arrive as citizens, so the trained army never grows.
    expect(await armyOf(loserA.id)).toBe(9900);
    expect(await armyOf(loserB.id)).toBe(9900);
    const defectedRows = await prisma.desertionEvent.findMany({
      where: { kind: 'DEFECT', defectedToUserId: recipient.id },
    });
    const defectedTotal = defectedRows.reduce(
      (sum, row) => sum + row.quantity,
      0,
    );
    expect(defectedTotal).toBe(20);
    expect(await armyOf(recipient.id)).toBe(2000);
    // Direct service calls: no housing grant ran, so exactly the 20 arrived.
    expect(await unitQuantity(recipient.id, 'CITIZEN')).toBe(
      recipientCitizensBefore + 20,
    );
  });
});

describe('desertion floor over 60 days', () => {
  test('the army never falls below 75% of the floor and the floor never ratchets down', async () => {
    const now = Date.now();
    const player = await createPlayer('Sixty day floor');
    await prisma.users.update({
      where: { id: player.id },
      data: {
        experience: UNPROTECTED_XP,
        last_active: new Date(now - 3 * DAY_MS),
        kingdom_morale: 0,
      },
    });
    await setUnits(player.id, 'OFFENSE', 5000);
    await setUnits(player.id, 'DEFENSE', 5000);

    const floors: Array<number | null> = [];
    const armies: number[] = [];
    for (let day = 1; day <= 60; day += 1) {
      await CronJobService.processDailyUpdates();
      await nextDay();
      const row = await userRow(player.id);
      expect(row.kingdom_morale).toBe(0);
      floors.push(row.desertion_floor);
      armies.push(await armyOf(player.id));
      // Never below the guarantee on any single day.
      expect(armies[armies.length - 1]).toBeGreaterThanOrEqual(7500);
    }

    expect(floors.every((floor) => floor === 10000)).toBe(true);
    // Monotonic drain (per-row 1% rounds down), never below the guarantee.
    expect(
      armies.every((army, index) => index === 0 || army <= armies[index - 1]),
    ).toBe(true);
    expect(armies[0]).toBe(9900);
    // Once the floor is reached it pins the army there on every later day.
    const reachedAt = armies.indexOf(7500);
    expect(reachedAt).toBeGreaterThan(0);
    expect(armies.slice(reachedAt).every((army) => army === 7500)).toBe(true);
    expect(await desertionTotal(player.id, 'ABANDON')).toBe(2500);
    // 75% of the recorded floor, exactly.
    expect(await armyOf(player.id)).toBe(
      Math.floor(10000 * ARMY_DESERTION_FLOOR_SHARE),
    );
  });
});

describe('desertion floor is era-long', () => {
  test('the floor is recorded once per era, survives recovery and is never re-recorded', async () => {
    const now = Date.now();
    const player = await createPlayer('Floor persists');
    await prisma.users.update({
      where: { id: player.id },
      data: {
        experience: UNPROTECTED_XP,
        last_active: new Date(now - 1 * HOUR_MS),
        kingdom_morale: 10,
      },
    });
    await setUnits(player.id, 'OFFENSE', 4000);

    // Day 1: active (+5) but still below the army threshold: floor recorded
    // at the first crossing, 1% of the army deserts.
    await CronJobService.processDailyUpdates();
    let row = await userRow(player.id);
    expect(row.kingdom_morale).toBe(15);
    expect(row.desertion_floor).toBe(4000);
    expect(await armyOf(player.id)).toBe(3960);

    // Recover above 20 (active +5): the floor now PERSISTS; nothing deserts.
    await prisma.users.update({
      where: { id: player.id },
      data: { kingdom_morale: 25, last_active: new Date() },
    });
    await nextDay();
    await CronJobService.processDailyUpdates();
    row = await userRow(player.id);
    expect(row.kingdom_morale).toBe(30);
    expect(row.desertion_floor).toBe(4000);
    expect(await armyOf(player.id)).toBe(3960);

    // Fall below again (inactive -5): the floor is NOT re-recorded at the
    // smaller army; the guarantee stays anchored to the first crossing.
    await prisma.users.update({
      where: { id: player.id },
      data: {
        kingdom_morale: 18,
        last_active: new Date(now - 3 * DAY_MS),
      },
    });
    await nextDay();
    await CronJobService.processDailyUpdates();
    row = await userRow(player.id);
    expect(row.kingdom_morale).toBe(13);
    expect(row.desertion_floor).toBe(4000);
    expect(await armyOf(player.id)).toBe(3921);

    // Repeating the cycle cannot re-arm a fresh 25% bleed: the total loss
    // stays bounded by 25% of the army at the first crossing (1000 of 4000).
    await prisma.users.update({
      where: { id: player.id },
      data: { kingdom_morale: 25, last_active: new Date() },
    });
    await nextDay();
    await CronJobService.processDailyUpdates();
    await prisma.users.update({
      where: { id: player.id },
      data: {
        kingdom_morale: 18,
        last_active: new Date(now - 3 * DAY_MS),
      },
    });
    await nextDay();
    await CronJobService.processDailyUpdates();
    expect((await userRow(player.id)).desertion_floor).toBe(4000);
    expect(await desertionTotal(player.id)).toBe(118);
    expect(await armyOf(player.id)).toBe(3882);
    expect(await armyOf(player.id)).toBeGreaterThanOrEqual(3000);
  });

  test('the floor ratchets up to a rebuilt army while morale recovers, never down', async () => {
    const now = Date.now();
    const player = await createPlayer('Ratchet floor');
    await prisma.users.update({
      where: { id: player.id },
      data: {
        experience: UNPROTECTED_XP,
        last_active: new Date(now - 3 * DAY_MS),
        kingdom_morale: 10,
      },
    });
    await setUnits(player.id, 'OFFENSE', 4000);

    // Day 1: below the threshold — the floor is recorded at the first crossing.
    await CronJobService.processDailyUpdates();
    expect((await userRow(player.id)).desertion_floor).toBe(4000);
    expect(await armyOf(player.id)).toBe(3960);

    // Recover above the threshold: the floor may only ratchet UP, and the
    // army (3960) is below it, so it stays at the first crossing's value.
    await prisma.users.update({
      where: { id: player.id },
      data: { kingdom_morale: 25, last_active: new Date() },
    });
    await nextDay();
    await CronJobService.processDailyUpdates();
    expect((await userRow(player.id)).kingdom_morale).toBe(30);
    expect((await userRow(player.id)).desertion_floor).toBe(4000);

    // Rebuild beyond the first crossing: at-or-above the threshold the
    // floor rises to the current trained army.
    await setUnits(player.id, 'OFFENSE', 8000);
    await nextDay();
    await CronJobService.processDailyUpdates();
    expect((await userRow(player.id)).kingdom_morale).toBe(35);
    expect((await userRow(player.id)).desertion_floor).toBe(8000);

    // Crash again: the bleed is bounded by 75% of the REBUILT army (6000),
    // not the stale 4000 floor — the guarantee tracks growth.
    await prisma.users.update({
      where: { id: player.id },
      data: {
        kingdom_morale: 10,
        last_active: new Date(now - 3 * DAY_MS),
      },
    });
    await nextDay();
    await CronJobService.processDailyUpdates();
    const row = await userRow(player.id);
    expect(row.kingdom_morale).toBe(5);
    expect(row.desertion_floor).toBe(8000);
    // 1% of 8000 deserts on day one of the new crash, far above 6000.
    expect(await armyOf(player.id)).toBe(7920);
    // 40 on the first crash day + 80 on the new crash day.
    expect(await desertionTotal(player.id)).toBe(120);
    expect(await armyOf(player.id)).toBeGreaterThan(
      Math.floor(8000 * ARMY_DESERTION_FLOOR_SHARE),
    );
  });
});

describe('defector recipient eligibility', () => {
  test('inactive, vacation, protected and allied attackers all receive nothing; everything abandons', async () => {
    const now = Date.now();
    const loser = await createPlayer('Eligibility loser');
    const inactive = await createPlayer('Eligibility inactive');
    const vacationer = await createPlayer('Eligibility vacationer');
    const protectedNewbie = await createPlayer('Eligibility protected');
    const ally = await createPlayer('Eligibility ally');

    await prisma.users.update({
      where: { id: loser.id },
      data: {
        experience: UNPROTECTED_XP,
        last_active: new Date(now - 30 * HOUR_MS),
        kingdom_morale: 15,
      },
    });
    await setUnits(loser.id, 'DEFENSE', 10000);

    // Inactive for 25h: just outside the recipient activity window.
    await prisma.users.update({
      where: { id: inactive.id },
      data: {
        experience: UNPROTECTED_XP,
        last_active: new Date(now - 25 * HOUR_MS),
      },
    });
    // On vacation.
    await prisma.users.update({
      where: { id: vacationer.id },
      data: {
        experience: UNPROTECTED_XP,
        last_active: new Date(now - 1 * HOUR_MS),
      },
    });
    await prisma.accountStatusHistory.create({
      data: {
        user_id: vacationer.id,
        status: 'VACATION',
        start_date: new Date(now - 4 * DAY_MS),
        reason: 'synthetic vacation',
      },
    });
    // Protected new player: no XP, recent join, small population.
    await prisma.users.update({
      where: { id: protectedNewbie.id },
      data: { last_active: new Date(now - 1 * HOUR_MS) },
    });
    // Same alliance as the loser.
    await prisma.users.update({
      where: { id: ally.id },
      data: {
        experience: UNPROTECTED_XP,
        last_active: new Date(now - 1 * HOUR_MS),
      },
    });

    for (const attacker of [inactive, vacationer, protectedNewbie, ally]) {
      await setUnits(attacker.id, 'DEFENSE', 500);
      await logAttack(attacker.id, loser.id, new Date(now - 1 * HOUR_MS));
    }

    const alliance = await prisma.alliances.create({
      data: { name: 'Eligibility pact', leader_id: loser.id },
    });
    const role = await prisma.alliance_roles.create({
      data: { name: 'Member', alliance_id: alliance.id },
    });
    for (const memberId of [loser.id, ally.id]) {
      await prisma.alliance_memberships.create({
        data: { alliance_id: alliance.id, user_id: memberId, role_id: role.id },
      });
    }

    await CronJobService.processDailyUpdates();

    expect(
      await prisma.desertionEvent.count({ where: { kind: 'DEFECT' } }),
    ).toBe(0);
    for (const attacker of [inactive, vacationer, protectedNewbie, ally]) {
      expect(await armyOf(attacker.id)).toBe(500);
    }
    expect(await desertionTotal(loser.id, 'ABANDON')).toBe(100);
    expect(await armyOf(loser.id)).toBe(9900);
  });

  test('the loser never receives its own defectors: everything abandons', async () => {
    const now = Date.now();
    const player = await createPlayer('Self defection');
    await prisma.users.update({
      where: { id: player.id },
      data: {
        experience: UNPROTECTED_XP,
        // Active, so it passes the recipient activity window and morale still
        // drifts below the desertion threshold from a battle-driven low.
        last_active: new Date(now - 1 * HOUR_MS),
        kingdom_morale: 10,
      },
    });
    await setUnits(player.id, 'DEFENSE', 1000);
    // The loser is also its own most recent "attacker" in the attack window.
    await logAttack(player.id, player.id, new Date(now - 1 * HOUR_MS));

    await CronJobService.processDailyUpdates();

    // Correct behaviour: defectors must never be handed back to the loser, so
    // the kingdom still loses 1% (10) instead of only the abandoned half (5),
    // and no defection is credited to itself.
    const outcome = {
      defectedToSelf: await prisma.desertionEvent.count({
        where: { kind: 'DEFECT', defectedToUserId: player.id },
      }),
      army: await armyOf(player.id),
      selfCredits: await prisma.bank_history.count({
        where: {
          history_type: 'KINGDOM_MORALE',
          from_user_id: player.id,
          to_user_id: player.id,
        },
      }),
    };
    expect(outcome).toEqual({ defectedToSelf: 0, army: 990, selfCredits: 0 });
  });

  test('the busiest eligible attacker wins; ties break by most recent attack; ineligible busier attackers are skipped', async () => {
    const now = Date.now();
    const loser = await createPlayer('Ordering loser');
    const busier = await createPlayer('Busier attacker');
    const moreRecent = await createPlayer('More recent attacker');
    const alliedBusy = await createPlayer('Allied busy attacker');

    await prisma.users.update({
      where: { id: loser.id },
      data: {
        experience: UNPROTECTED_XP,
        last_active: new Date(now - 30 * HOUR_MS),
        kingdom_morale: 15,
      },
    });
    await setUnits(loser.id, 'DEFENSE', 10000);
    for (const attacker of [busier, moreRecent, alliedBusy]) {
      await prisma.users.update({
        where: { id: attacker.id },
        data: {
          experience: UNPROTECTED_XP,
          last_active: new Date(now - 1 * HOUR_MS),
        },
      });
      await setUnits(attacker.id, 'OFFENSE', 1000);
      await setUnits(attacker.id, 'DEFENSE', 1000);
    }
    // The allied attacker is busiest of all but shares the loser's alliance.
    for (let i = 0; i < 3; i += 1) {
      await logAttack(
        alliedBusy.id,
        loser.id,
        new Date(now - 2 * HOUR_MS - i * HOUR_MS),
      );
    }
    // Two attacks, the most recent of them 2h ago.
    await logAttack(busier.id, loser.id, new Date(now - 4 * HOUR_MS));
    await logAttack(busier.id, loser.id, new Date(now - 2 * HOUR_MS));
    // Fewer attacks but the single most recent one.
    await logAttack(moreRecent.id, loser.id, new Date(now - 1 * HOUR_MS));

    const alliance = await prisma.alliances.create({
      data: { name: 'Ordering pact', leader_id: loser.id },
    });
    const role = await prisma.alliance_roles.create({
      data: { name: 'Member', alliance_id: alliance.id },
    });
    for (const memberId of [loser.id, alliedBusy.id]) {
      await prisma.alliance_memberships.create({
        data: { alliance_id: alliance.id, user_id: memberId, role_id: role.id },
      });
    }

    const busierCitizensBefore = await unitQuantity(busier.id, 'CITIZEN');

    await CronJobService.processDailyUpdates();

    // Attack count beats recency: "busier" (2) over "moreRecent" (1), and
    // the allied triple-attacker is skipped entirely.
    const defections = await prisma.desertionEvent.findMany({
      where: { kind: 'DEFECT' },
    });
    expect(defections).toHaveLength(1);
    expect(defections[0]).toMatchObject({
      defectedToUserId: busier.id,
      userId: loser.id,
    });
    expect(defections[0].quantity).toBe(20);
    // The 20 landed as citizens; nobody's trained army grew.
    expect(await armyOf(busier.id)).toBe(2000);
    expect(await unitQuantity(busier.id, 'CITIZEN')).toBe(
      busierCitizensBefore + (await citizensGranted(busier.id)) + 20,
    );
    expect(await armyOf(moreRecent.id)).toBe(2000);
    expect(await armyOf(alliedBusy.id)).toBe(2000);
  });

  test('a recipient is found beyond the five busiest attackers when those are ineligible', async () => {
    const now = Date.now();
    const loser = await createPlayer('Deep search loser');
    const eligible = await createPlayer('Sixth attacker');
    const ineligible: Array<Awaited<ReturnType<typeof createPlayer>>> = [];
    for (let i = 0; i < 5; i += 1) {
      ineligible.push(await createPlayer(`Allied busy ${i}`));
    }

    await prisma.users.update({
      where: { id: loser.id },
      data: {
        experience: UNPROTECTED_XP,
        last_active: new Date(now - 30 * HOUR_MS),
        kingdom_morale: 15,
      },
    });
    await setUnits(loser.id, 'DEFENSE', 10000);
    await setUnits(eligible.id, 'OFFENSE', 1000);
    await prisma.users.update({
      where: { id: eligible.id },
      data: {
        experience: UNPROTECTED_XP,
        last_active: new Date(now - 1 * HOUR_MS),
      },
    });

    const alliance = await prisma.alliances.create({
      data: { name: 'Deep search pact', leader_id: loser.id },
    });
    const role = await prisma.alliance_roles.create({
      data: { name: 'Member', alliance_id: alliance.id },
    });
    await prisma.alliance_memberships.create({
      data: { alliance_id: alliance.id, user_id: loser.id, role_id: role.id },
    });
    // Five allied attackers with two attacks each outrank the eligible
    // attacker's single attack: the search must look past the top five.
    for (const attacker of ineligible) {
      await prisma.users.update({
        where: { id: attacker.id },
        data: {
          experience: UNPROTECTED_XP,
          last_active: new Date(now - 1 * HOUR_MS),
        },
      });
      await setUnits(attacker.id, 'OFFENSE', 1000);
      await logAttack(attacker.id, loser.id, new Date(now - 3 * HOUR_MS));
      await logAttack(attacker.id, loser.id, new Date(now - 2 * HOUR_MS));
      await prisma.alliance_memberships.create({
        data: {
          alliance_id: alliance.id,
          user_id: attacker.id,
          role_id: role.id,
        },
      });
    }
    await logAttack(eligible.id, loser.id, new Date(now - 1 * HOUR_MS));

    const eligibleCitizensBefore = await unitQuantity(eligible.id, 'CITIZEN');

    await CronJobService.processDailyUpdates();

    const defections = await prisma.desertionEvent.findMany({
      where: { kind: 'DEFECT' },
    });
    expect(defections).toHaveLength(1);
    expect(defections[0]).toMatchObject({
      defectedToUserId: eligible.id,
      userId: loser.id,
      quantity: 10,
    });
    // The 10 landed as citizens, not as trained soldiers.
    expect(await armyOf(eligible.id)).toBe(1000);
    expect(await unitQuantity(eligible.id, 'CITIZEN')).toBe(
      eligibleCitizensBefore + (await citizensGranted(eligible.id)) + 10,
    );
    for (const attacker of ineligible) {
      expect(await armyOf(attacker.id)).toBe(1000);
    }
  });
});

describe('pre-lock peek accuracy', () => {
  test('a kingdom crossing the threshold only via the broke-mercenary upkeep hit still locks its recipient in order', async () => {
    const now = Date.now();
    // Created FIRST so the recipient's id is LOWER than the loser's: if the
    // peek misses the desertion, the fallback refuses to lock out of order
    // and every deserter abandons. The peek must therefore predict the
    // below-threshold outcome itself, upkeep delta included.
    const recipient = await createPlayer('Peek recipient');
    const loser = await createPlayer('Peek loser');

    await prisma.users.update({
      where: { id: recipient.id },
      data: {
        experience: UNPROTECTED_XP,
        last_active: new Date(now - 1 * HOUR_MS),
        kingdom_morale: 100,
      },
    });
    await setUnits(recipient.id, 'OFFENSE', 1000);
    await setUnits(recipient.id, 'DEFENSE', 1000);

    // Passive (+3) with zero gold and an active mercenary contract nets 0:
    // morale 18 stays 18, below the army threshold — but only when the
    // peek counts the -3 upkeep hit does it lock the recipient in order.
    await prisma.users.update({
      where: { id: loser.id },
      data: {
        experience: UNPROTECTED_XP,
        last_active: new Date(now - 30 * HOUR_MS),
        kingdom_morale: 18,
        gold: 0n,
      },
    });
    await setUnits(loser.id, 'DEFENSE', 10000);
    await prisma.forceContract.create({
      data: {
        kind: 'MERCENARY',
        status: 'ACTIVE',
        userId: loser.id,
        type: 'OFFENSE',
        level: 1,
        equipment: [],
        initialQuantity: 10,
        survivingQuantity: 10,
        termDays: 3,
        startsAt: new Date(now - DAY_MS),
        expiresAt: new Date(now + 2 * DAY_MS),
        unitPriceGold: 1n,
      },
    });
    await logAttack(recipient.id, loser.id, new Date(now - 1 * HOUR_MS));

    const recipientCitizensBefore = await unitQuantity(recipient.id, 'CITIZEN');

    await CronJobService.processDailyUpdates();

    // Morale landed at 18 (the upkeep hit applied) and the peek predicted
    // it, so the lower-id recipient was locked in order: defectors arrive.
    expect((await userRow(loser.id)).kingdom_morale).toBe(18);
    const defectedRows = await prisma.desertionEvent.findMany({
      where: { kind: 'DEFECT', defectedToUserId: recipient.id },
    });
    const defectedTotal = defectedRows.reduce(
      (sum, row) => sum + row.quantity,
      0,
    );
    expect(defectedTotal).toBe(20);
    expect(await armyOf(recipient.id)).toBe(2000);
    expect(await unitQuantity(recipient.id, 'CITIZEN')).toBe(
      recipientCitizensBefore + (await citizensGranted(recipient.id)) + 20,
    );
    expect(await armyOf(loser.id)).toBe(9900);
  });
});

describe('protected players stay exempt at morale 0', () => {
  test('a new player and a vacation account get no decay and no desertion even at 0', async () => {
    const now = Date.now();
    const fresh = await createPlayer('Zero morale newbie');
    const vacationer = await createPlayer('Zero morale vacationer');

    // Small population keeps the new player inside the population rule while
    // still owning a trained army below the desertion floor.
    await prisma.users.update({
      where: { id: fresh.id },
      data: {
        last_active: new Date(now - 3 * DAY_MS),
        kingdom_morale: 0,
      },
    });
    await setUnits(fresh.id, 'DEFENSE', 2000);
    await setUnits(fresh.id, 'CITIZEN', 200);

    await prisma.users.update({
      where: { id: vacationer.id },
      data: {
        experience: UNPROTECTED_XP,
        last_active: new Date(now - 3 * DAY_MS),
        kingdom_morale: 0,
      },
    });
    await setUnits(vacationer.id, 'DEFENSE', 5000);
    await setUnits(vacationer.id, 'CITIZEN', 500);
    await prisma.accountStatusHistory.create({
      data: {
        user_id: vacationer.id,
        status: 'VACATION',
        start_date: new Date(now - 4 * DAY_MS),
        reason: 'synthetic vacation',
      },
    });

    await CronJobService.processDailyUpdates();

    for (const player of [fresh, vacationer]) {
      expect((await userRow(player.id)).kingdom_morale).toBe(0);
      expect(
        await prisma.desertionEvent.count({ where: { userId: player.id } }),
      ).toBe(0);
      expect(
        await prisma.bank_history.count({
          where: { to_user_id: player.id, history_type: 'KINGDOM_MORALE' },
        }),
      ).toBe(0);
    }
    expect(await unitQuantity(fresh.id, 'DEFENSE')).toBe(2000);
    // Housing growth still runs; only morale decay and desertion are exempt.
    expect(await unitQuantity(fresh.id, 'CITIZEN')).toBe(
      200 + (await citizensGranted(fresh.id)),
    );
    expect(await unitQuantity(vacationer.id, 'DEFENSE')).toBe(5000);
    expect(await unitQuantity(vacationer.id, 'CITIZEN')).toBe(
      500 + (await citizensGranted(vacationer.id)),
    );
  });
});

describe('rounding on tiny armies', () => {
  test('5 units and 90 citizens produce no events, no negatives and no zero-quantity rows', async () => {
    const now = Date.now();
    const tiny = await createPlayer('Tiny army');
    const citizens = await createPlayer('Hundred citizens');

    await prisma.users.update({
      where: { id: tiny.id },
      data: {
        experience: UNPROTECTED_XP,
        last_active: new Date(now - 3 * DAY_MS),
        kingdom_morale: 5,
      },
    });
    await setUnits(tiny.id, 'OFFENSE', 5);
    // 90, not 99: the daily housing grant (+1/day at house level 0) runs
    // before desertion, so 99 would be 100 by the time the check happens.
    await setUnits(tiny.id, 'CITIZEN', 90);

    await prisma.users.update({
      where: { id: citizens.id },
      data: {
        experience: UNPROTECTED_XP,
        last_active: new Date(now - 3 * DAY_MS),
        kingdom_morale: 0,
      },
    });
    await setUnits(citizens.id, 'CITIZEN', 100);

    // Three passes on three (simulated) days: 1% of 5 rounds to 0 every
    // day, and the citizens stay below the minimum deserting population, so
    // nothing should ever be recorded.
    for (let run = 0; run < 3; run += 1) {
      await CronJobService.processDailyUpdates();
      await nextDay();
    }

    expect((await userRow(tiny.id)).kingdom_morale).toBe(0);
    expect(await unitQuantity(tiny.id, 'OFFENSE')).toBe(5);
    expect((await userRow(tiny.id)).desertion_floor).toBe(5);
    expect(
      await prisma.desertionEvent.count({ where: { userId: tiny.id } }),
    ).toBe(0);

    const tinyCitizens = await citizensGranted(tiny.id);
    expect(await unitQuantity(tiny.id, 'CITIZEN')).toBe(90 + tinyCitizens);

    // 100 citizens is exactly the minimum: 1 leaves per run, never a fraction.
    const citizenEvents = await prisma.desertionEvent.findMany({
      where: { userId: citizens.id, kind: 'CITIZENS' },
    });
    expect(citizenEvents.map((event) => event.quantity)).toEqual([1, 1, 1]);
    expect(await unitQuantity(citizens.id, 'CITIZEN')).toBe(
      100 + (await citizensGranted(citizens.id)) - 3,
    );

    // Globally: every recorded quantity is a positive integer, never 0, NaN
    // or negative, and no unit row anywhere went negative.
    const events = await prisma.desertionEvent.findMany();
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(Number.isInteger(event.quantity)).toBe(true);
      expect(event.quantity).toBeGreaterThan(0);
    }
    const units = await prisma.userUnit.findMany();
    for (const unit of units) expect(unit.quantity).toBeGreaterThanOrEqual(0);
  });

  test('rounding evasion closed: twelve stacks of 99 desert 1% of the whole army per day', async () => {
    const now = Date.now();
    const player = await createPlayer('Spread stack');
    await prisma.users.update({
      where: { id: player.id },
      data: {
        experience: UNPROTECTED_XP,
        last_active: new Date(now - 3 * DAY_MS),
        kingdom_morale: 0,
      },
    });
    // The game offers levels 1-3 for each of the four trained types: twelve
    // rows of 99 (1188 units). The loss is computed on the WHOLE army and
    // distributed proportionally, so 11 desert today even though every row
    // is under 100 — no stack layout can floor its way out of desertion.
    for (const type of ['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'] as const) {
      for (const level of [1, 2, 3]) {
        await setUnits(player.id, type, 99, level);
      }
    }

    await CronJobService.processDailyUpdates();

    expect(await armyOf(player.id)).toBe(1177);
    expect((await userRow(player.id)).desertion_floor).toBe(1188);
    expect(await desertionTotal(player.id, 'ABANDON')).toBe(11);
    expect(
      await prisma.desertionEvent.count({ where: { userId: player.id } }),
    ).toBe(11);
    // No row went negative or lost more than it held.
    const rows = await prisma.userUnit.findMany({
      where: {
        userId: player.id,
        type: { in: ['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'] },
      },
    });
    expect(
      rows.every((row) => row.quantity === 98 || row.quantity === 99),
    ).toBe(true);
    expect(rows.filter((row) => row.quantity === 98)).toHaveLength(11);

    // The next day deserts 1% of 1177 (11 more), floor unchanged.
    await nextDay();
    await CronJobService.processDailyUpdates();
    expect(await armyOf(player.id)).toBe(1166);
    expect((await userRow(player.id)).desertion_floor).toBe(1188);
  });
});

describe('era rollover', () => {
  test('a new era resets morale to 100, clears the desertion floor and re-arms the daily pass', async () => {
    const now = Date.now();
    const player = await createPlayer('Rollover kingdom');
    await prisma.users.update({
      where: { id: player.id },
      data: {
        experience: UNPROTECTED_XP,
        last_active: new Date(now - 3 * DAY_MS),
        kingdom_morale: 4,
        desertion_floor: 1000,
        kingdom_morale_day: getOTDayKey(new Date()),
      },
    });
    await setUnits(player.id, 'DEFENSE', 900);

    await startNewEra();

    const row = await userRow(player.id);
    expect(row.kingdom_morale).toBe(100);
    expect(row.desertion_floor).toBeNull();
    expect(row.kingdom_morale_day).toBeNull();
    expect(await prisma.era.count({ where: { endDate: null } })).toBe(1);
    expect(await prisma.desertionEvent.count()).toBe(0);
  });
});

describe('morale clamps', () => {
  test('repeated wins at 100 stay at 100 and repeated losses at 0 stay at 0', async () => {
    const winner = await createPlayer('Clamp winner');
    const winnerAttacker = await createPlayer('Clamp winner attacker');
    const loser = await createPlayer('Clamp loser');
    const loserAttacker = await createPlayer('Clamp loser attacker');

    for (const id of [
      winner.id,
      winnerAttacker.id,
      loser.id,
      loserAttacker.id,
    ]) {
      await prisma.users.update({
        where: { id },
        data: { experience: UNPROTECTED_XP },
      });
    }
    // The defender holds every time at 100 morale.
    await prisma.users.update({
      where: { id: winner.id },
      data: { kingdom_morale: 100 },
    });
    await setUnits(winner.id, 'DEFENSE', 100000);
    await setUnits(winnerAttacker.id, 'OFFENSE', 50);
    // The defender breaks every time at 0 morale.
    await prisma.users.update({
      where: { id: loser.id },
      data: { kingdom_morale: 0 },
    });
    await setUnits(loser.id, 'DEFENSE', 100);
    await setUnits(loserAttacker.id, 'OFFENSE', 5000);

    for (let attack = 0; attack < 3; attack += 1) {
      const repelled = await AttackService.executeAttack(
        winnerAttacker.id,
        winner.id,
        5,
      );
      expect(repelled.status).toBe('success');
      expect((await userRow(winner.id)).kingdom_morale).toBe(100);

      const breached = await AttackService.executeAttack(
        loserAttacker.id,
        loser.id,
        5,
      );
      expect(breached.status).toBe('success');
      expect((await userRow(loser.id)).kingdom_morale).toBe(0);
    }
  });
});
