/**
 * Integration coverage for captives and the dungeon (#210, phase 4 of #205):
 * capture on a breached win (and every refusal case), capacity, whole-battle
 * rounding against stack-splitting, ransom economics with burn and
 * idempotency, release morale, the 72h conversion gate, daily escapes (age,
 * dungeon lost), era rollover clearing, and ransom-vs-convert racing on the
 * same row.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { randomUUID } from 'crypto';

import {
  CAPTURE_PERCENT,
  convertCostPerUnit,
  DUNGEON_BASE_CAPACITY,
  ransomPricePerUnit,
} from '@/constants/Captives';
import prisma from '@/lib/prisma';
import { AttackService } from '@/services/AttackService';
import {
  CaptiveService,
  type KilledUnitRow,
} from '@/services/Captives.service';
import { startNewEra } from '@/services/Era.service';
import { createUser } from '@/services/User.service';

import { resetDatabase, setShowDungeon } from './db';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
/** Level 10 (80k XP) ends new-player protection by the LEVEL rule. */
const UNPROTECTED_XP = 80_000;
/** The fort level that unlocks the dungeon (a Citadel). */
const DUNGEON_FORT = 13;

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

const userRow = (userId: number) =>
  prisma.users.findUniqueOrThrow({ where: { id: userId } });

/** An era that started long enough ago that every player counts as a participant. */
const seedEra = () =>
  prisma.era.create({
    data: {
      name: 'Captives era',
      startDate: new Date(Date.now() - 20 * DAY_MS),
    },
  });

/** Directly seeds one captive row, as a battle capture would have written it. */
const seedCaptive = async (data: {
  captorId: number;
  sourceId: number;
  unitType: 'OFFENSE' | 'DEFENSE' | 'SPY' | 'SENTRY';
  unitLevel: number;
  quantity: number;
  capturedAt?: Date;
  eraId: number | null;
}) =>
  prisma.captive.create({
    data: {
      captorId: data.captorId,
      sourceId: data.sourceId,
      unitType: data.unitType,
      unitLevel: data.unitLevel,
      quantity: data.quantity,
      capturedAt: data.capturedAt ?? new Date(),
      eraId: data.eraId,
    },
  });

let eraId: number;

beforeEach(async () => {
  await resetDatabase();
  eraId = (await seedEra()).id;
  await setShowDungeon(true);
});

describe('capture on a breached win', () => {
  test('a dungeon-holding attacker captures 10% of the killed combat units', async () => {
    const captor = await createPlayer('Dungeon captor');
    const loser = await createPlayer('Capture loser');
    // Only the ATTACKER gets a Citadel: the defender's default fort keeps the
    // breach achievable, and the attacker's own fort never enters the battle.
    await prisma.users.update({
      where: { id: captor.id },
      data: { experience: UNPROTECTED_XP, fort_level: DUNGEON_FORT },
    });
    // A wall already ground down to its last hitpoint by earlier raids (fort
    // HP only erodes 2-7% of max per assault turn), a population big enough
    // that the casualty budget allows real kills, and housing that can
    // actually replace them.
    await prisma.users.update({
      where: { id: loser.id },
      data: {
        experience: UNPROTECTED_XP,
        fort_hitpoints: 1,
        house_level: 5,
      },
    });
    await setUnits(captor.id, 'OFFENSE', 5000);
    await setUnits(loser.id, 'DEFENSE', 500);
    await setUnits(loser.id, 'CITIZEN', 1000);

    const outcome = await AttackService.executeAttack(captor.id, loser.id, 10);
    expect(outcome.status).toBe('success');

    const log = await prisma.attack_log.findFirstOrThrow({
      where: { defender_id: loser.id },
    });
    expect(log.winner).toBe(captor.id);
    expect(log.stats).toMatchObject({ fort_breached: true });

    // The killed combat units are recorded on the log; captives are 10% of
    // them, rounded once on the battle total.
    const losses = JSON.parse(
      (log.stats as { defender_losses: string }).defender_losses,
    ) as { units: Array<{ type: string; quantity: number }> };
    const killedCombat = losses.units
      .filter(
        (unit) =>
          ['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'].includes(unit.type) &&
          unit.quantity > 0,
      )
      .reduce((sum, unit) => sum + unit.quantity, 0);
    const expected = Math.floor(killedCombat * CAPTURE_PERCENT);
    expect(expected).toBeGreaterThan(0);
    expect(log.stats).toMatchObject({ captives_taken: expected });

    const captives = await prisma.captive.findMany({
      where: { captorId: captor.id, sourceId: loser.id },
    });
    const heldTotal = captives.reduce((sum, row) => sum + row.quantity, 0);
    expect(heldTotal).toBe(expected);
    // Captives replace deaths: the captured troops are NOT back on the
    // defender's roster, and only combat units were ever eligible.
    for (const row of captives) {
      expect(['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY']).toContain(row.unitType);
      expect(row.eraId).toBe(eraId);
    }

    const events = await prisma.captiveEvent.findMany({
      where: { captorId: captor.id, kind: 'CAPTURED' },
    });
    expect(events.reduce((sum, event) => sum + event.quantity, 0)).toBe(
      expected,
    );
  });
});

describe('no capture when', () => {
  test('the dungeon is hidden (SHOW_DUNGEON off): captured units are killed instead', async () => {
    await setShowDungeon(false);
    const captor = await createPlayer('Hidden captor');
    const loser = await createPlayer('Hidden loser');
    await prisma.users.update({
      where: { id: captor.id },
      data: { experience: UNPROTECTED_XP, fort_level: DUNGEON_FORT },
    });
    await prisma.users.update({
      where: { id: loser.id },
      data: {
        experience: UNPROTECTED_XP,
        fort_hitpoints: 1,
        house_level: 5,
      },
    });
    await setUnits(captor.id, 'OFFENSE', 5000);
    await setUnits(loser.id, 'DEFENSE', 500);
    await setUnits(loser.id, 'CITIZEN', 1000);

    const outcome = await AttackService.executeAttack(captor.id, loser.id, 10);
    expect(outcome.status).toBe('success');

    // Same breached win that would have taken captives with the dungeon on.
    const log = await prisma.attack_log.findFirstOrThrow({
      where: { defender_id: loser.id },
    });
    expect(log.winner).toBe(captor.id);
    expect(log.stats).toMatchObject({ fort_breached: true, captives_taken: 0 });
    expect(await prisma.captive.count({ where: { captorId: captor.id } })).toBe(
      0,
    );
    expect(await prisma.captiveEvent.count()).toBe(0);

    // Every killed defender is simply gone from the roster; only the wounded
    // (moved to the recovery pool) leave it too.
    const stats = log.stats as { defender_losses: string; wounded: string };
    const losses = JSON.parse(stats.defender_losses) as {
      units: Array<{ type: string; quantity: number }>;
    };
    const wounded = JSON.parse(stats.wounded) as {
      defender: Array<{ type: string; quantity: number }>;
    };
    const defense = (rows: Array<{ type: string; quantity: number }>) =>
      rows
        .filter((unit) => unit.type === 'DEFENSE')
        .reduce((sum, unit) => sum + unit.quantity, 0);
    const killedDefense = defense(losses.units);
    expect(killedDefense).toBeGreaterThan(0);
    expect(await unitQuantity(loser.id, 'DEFENSE')).toBe(
      500 - killedDefense - defense(wounded.defender),
    );
  });

  test('the attacker has no dungeon (fort below the unlock level)', async () => {
    const captor = await createPlayer('Fortless attacker');
    const loser = await createPlayer('Fortless loser');
    await prisma.users.update({
      where: { id: captor.id },
      data: { experience: UNPROTECTED_XP, fort_level: DUNGEON_FORT - 1 },
    });
    await prisma.users.update({
      where: { id: loser.id },
      data: {
        experience: UNPROTECTED_XP,
        fort_hitpoints: 1,
        house_level: 5,
      },
    });
    await setUnits(captor.id, 'OFFENSE', 5000);
    await setUnits(loser.id, 'DEFENSE', 500);
    await setUnits(loser.id, 'CITIZEN', 1000);

    const outcome = await AttackService.executeAttack(captor.id, loser.id, 10);
    expect(outcome.status).toBe('success');
    const log = await prisma.attack_log.findFirstOrThrow({
      where: { defender_id: loser.id },
    });
    expect(log.winner).toBe(captor.id);
    expect(log.stats).toMatchObject({ fort_breached: true });
    expect(await prisma.captive.count()).toBe(0);
    expect(log.stats).toMatchObject({ captives_taken: 0 });
  });

  test('the defender is protected as a new player', async () => {
    // Both fresh (0 XP) so the level range allows the attack.
    const captor = await createPlayer('Protected-capture attacker');
    const loser = await createPlayer('Protected-capture loser');
    await prisma.users.update({
      where: { id: captor.id },
      data: { fort_level: DUNGEON_FORT },
    });
    await prisma.users.update({
      where: { id: loser.id },
      data: { fort_hitpoints: 1, house_level: 5 },
    });
    await setUnits(captor.id, 'OFFENSE', 5000);
    await setUnits(loser.id, 'DEFENSE', 500);
    await setUnits(loser.id, 'CITIZEN', 1000);

    const outcome = await AttackService.executeAttack(captor.id, loser.id, 10);
    expect(outcome.status).toBe('success');
    const log = await prisma.attack_log.findFirstOrThrow({
      where: { defender_id: loser.id },
    });
    expect(log.winner).toBe(captor.id);
    expect(log.stats).toMatchObject({ fort_breached: true });
    expect(await prisma.captive.count()).toBe(0);
  });

  test('the defender is on vacation (non-ACTIVE account)', async () => {
    const now = Date.now();
    const captor = await createPlayer('Vacation-capture attacker');
    const vacationer = await createPlayer('Vacation-capture loser');
    await prisma.users.update({
      where: { id: captor.id },
      data: { experience: UNPROTECTED_XP, fort_level: DUNGEON_FORT },
    });
    await prisma.users.update({
      where: { id: vacationer.id },
      data: {
        experience: UNPROTECTED_XP,
        fort_hitpoints: 1,
        house_level: 5,
      },
    });
    await setUnits(captor.id, 'OFFENSE', 5000);
    await setUnits(vacationer.id, 'DEFENSE', 500);
    await setUnits(vacationer.id, 'CITIZEN', 1000);
    await prisma.accountStatusHistory.create({
      data: {
        user_id: vacationer.id,
        status: 'VACATION',
        start_date: new Date(now - 4 * DAY_MS),
        reason: 'synthetic vacation',
      },
    });

    const outcome = await AttackService.executeAttack(
      captor.id,
      vacationer.id,
      10,
    );
    expect(outcome.status).toBe('success');
    const log = await prisma.attack_log.findFirstOrThrow({
      where: { defender_id: vacationer.id },
    });
    expect(log.winner).toBe(captor.id);
    expect(log.stats).toMatchObject({ fort_breached: true });
    expect(await prisma.captive.count()).toBe(0);
  });

  test('the attack is repelled (no win, no breach)', async () => {
    const captor = await createPlayer('Repelled captor');
    const stronghold = await createPlayer('Repelling stronghold');
    await prisma.users.update({
      where: { id: captor.id },
      data: { experience: UNPROTECTED_XP, fort_level: DUNGEON_FORT },
    });
    await prisma.users.update({
      where: { id: stronghold.id },
      data: { experience: UNPROTECTED_XP },
    });
    await setUnits(captor.id, 'OFFENSE', 50);
    await setUnits(stronghold.id, 'DEFENSE', 100000);

    const outcome = await AttackService.executeAttack(
      captor.id,
      stronghold.id,
      5,
    );
    expect(outcome.status).toBe('success');
    const log = await prisma.attack_log.findFirstOrThrow({
      where: { defender_id: stronghold.id },
    });
    expect(log.winner).toBe(stronghold.id);
    expect(await prisma.captive.count()).toBe(0);
  });
});

describe('capture rounding, stack-splitting and capacity', () => {
  /** Runs the capture hook exactly as the battle transaction would. */
  const capture = (
    killedUnits: KilledUnitRow[],
    fortLevel: number,
    captorId: number,
    sourceId: number,
  ) =>
    prisma.$transaction((tx) =>
      CaptiveService.captureFromBattle(tx, {
        captorId,
        sourceId,
        eraId,
        captorFortLevel: fortLevel,
        killedUnits,
      }),
    );

  test('rounding happens once per battle, so splitting stacks cannot dodge it', async () => {
    const captor = await createPlayer('Rounding captor');
    const loser = await createPlayer('Rounding loser');
    // 999 killed in one row: 99 captured.
    const one = await capture(
      [{ type: 'DEFENSE', level: 1, quantity: 999 }],
      DUNGEON_FORT,
      captor.id,
      loser.id,
    );
    expect(one).toBe(99);
    await prisma.captive.deleteMany({});

    // The same 999 split into 111 rows of 9: still 99 captured, spread
    // largest-remainder across the rows.
    const many = await capture(
      Array.from({ length: 111 }, () => ({
        type: 'DEFENSE' as const,
        level: 1,
        quantity: 9,
      })),
      DUNGEON_FORT,
      captor.id,
      loser.id,
    );
    expect(many).toBe(99);
    const rows = await prisma.captive.findMany({
      where: { captorId: captor.id },
    });
    expect(rows.reduce((sum, row) => sum + row.quantity, 0)).toBe(99);
  });

  test('citizens, workers and mercenaries are never captured', async () => {
    const captor = await createPlayer('Eligibility captor');
    const loser = await createPlayer('Eligibility loser');
    const taken = await capture(
      [
        { type: 'CITIZEN', level: 1, quantity: 500 },
        { type: 'WORKER', level: 1, quantity: 500 },
        { type: 'DEFENSE', level: 1, quantity: 500, isMercenary: true },
      ],
      DUNGEON_FORT,
      captor.id,
      loser.id,
    );
    expect(taken).toBe(0);
    expect(await prisma.captive.count()).toBe(0);
  });

  test('captures beyond free capacity just die', async () => {
    const captor = await createPlayer('Capacity captor');
    const loser = await createPlayer('Capacity loser');
    // 5000 killed wants 500 captives; a fort 13 dungeon holds 200.
    const capped = await capture(
      [{ type: 'DEFENSE', level: 1, quantity: 5000 }],
      DUNGEON_FORT,
      captor.id,
      loser.id,
    );
    expect(capped).toBe(DUNGEON_BASE_CAPACITY);
    await prisma.captive.deleteMany({});

    // A bigger fort holds more: 200 + 50 per level above 13.
    const bigger = await capture(
      [{ type: 'DEFENSE', level: 1, quantity: 5000 }],
      DUNGEON_FORT + 2,
      captor.id,
      loser.id,
    );
    expect(bigger).toBe(DUNGEON_BASE_CAPACITY + 100);
    await prisma.captive.deleteMany({});

    // A half-full dungeon only takes what fits.
    await seedCaptive({
      captorId: captor.id,
      sourceId: loser.id,
      unitType: 'DEFENSE',
      unitLevel: 1,
      quantity: 150,
      eraId,
    });
    const partial = await capture(
      [{ type: 'DEFENSE', level: 1, quantity: 5000 }],
      DUNGEON_FORT,
      captor.id,
      loser.id,
    );
    expect(partial).toBe(DUNGEON_BASE_CAPACITY - 150);
  });
});

describe('ransom', () => {
  test('the source pays 40% of base cost; the captor keeps half and the rest is burned', async () => {
    const captor = await createPlayer('Ransom captor');
    const source = await createPlayer('Ransom source');
    await prisma.users.update({
      where: { id: captor.id },
      data: { fort_level: DUNGEON_FORT },
    });
    await prisma.users.update({
      where: { id: source.id },
      data: { gold: 1_000_000n },
    });
    // 10 Level 1 DEFENSE: 10 * 1500 * 40% = 6000 ransom.
    const row = await seedCaptive({
      captorId: captor.id,
      sourceId: source.id,
      unitType: 'DEFENSE',
      unitLevel: 1,
      quantity: 10,
      eraId,
    });

    const result = await CaptiveService.ransom({
      userId: source.id,
      captiveId: row.id,
      operationId: randomUUID(),
    });
    expect(result).toMatchObject({
      action: 'RANSOM',
      quantity: 10,
      gold: '6000',
      captorShare: '3000',
      burned: '3000',
    });

    // The source paid the full price; the captor banked only half.
    expect((await userRow(source.id)).gold).toBe(994_000n);
    expect((await userRow(captor.id)).gold).toBe(25_000n + 3_000n);
    // The troops returned at their original tier.
    expect(await unitQuantity(source.id, 'DEFENSE', 1)).toBe(10);
    expect(await prisma.captive.count({ where: { id: row.id } })).toBe(0);
    const events = await prisma.captiveEvent.findMany({
      where: { kind: 'RANSOMED' },
    });
    expect(events).toHaveLength(1);
    expect(events[0].gold).toBe(6_000n);
    expect(events[0].operationKey).not.toBeNull();
    const ledger = await prisma.bank_history.findFirstOrThrow({
      where: { history_type: 'DUNGEON' },
    });
    expect(ledger.gold_amount).toBe(3_000n);
    expect(ledger.from_user_id).toBe(source.id);
    expect(ledger.to_user_id).toBe(captor.id);
  });

  test('a retried operationId replays the same result without charging twice', async () => {
    const captor = await createPlayer('Idempotent captor');
    const source = await createPlayer('Idempotent source');
    await prisma.users.update({
      where: { id: source.id },
      data: { gold: 1_000_000n },
    });
    const row = await seedCaptive({
      captorId: captor.id,
      sourceId: source.id,
      unitType: 'OFFENSE',
      unitLevel: 1,
      quantity: 20,
      eraId,
    });
    const operationId = randomUUID();

    const first = await CaptiveService.ransom({
      userId: source.id,
      captiveId: row.id,
      operationId,
    });
    // The row is gone; the retry must return the stored outcome, not throw.
    const retry = await CaptiveService.ransom({
      userId: source.id,
      captiveId: row.id,
      operationId,
    });
    expect(retry).toEqual(first);
    expect((await userRow(source.id)).gold).toBe(
      1_000_000n - BigInt(first.gold),
    );
    expect(
      await prisma.captiveEvent.count({ where: { kind: 'RANSOMED' } }),
    ).toBe(1);
    // Reusing the id with different terms is refused.
    await expect(
      CaptiveService.ransom({
        userId: source.id,
        captiveId: row.id + 999,
        operationId,
      }),
    ).rejects.toThrow('Operation ID already used for different terms');
  });

  test('insufficient gold leaves the captives held', async () => {
    const captor = await createPlayer('Poor captor');
    const source = await createPlayer('Poor source');
    await prisma.users.update({
      where: { id: source.id },
      data: { gold: 100n },
    });
    const row = await seedCaptive({
      captorId: captor.id,
      sourceId: source.id,
      unitType: 'DEFENSE',
      unitLevel: 1,
      quantity: 10,
      eraId,
    });

    await expect(
      CaptiveService.ransom({
        userId: source.id,
        captiveId: row.id,
        operationId: randomUUID(),
      }),
    ).rejects.toThrow('Insufficient gold');
    expect((await userRow(source.id)).gold).toBe(100n);
    expect(await prisma.captive.count({ where: { id: row.id } })).toBe(1);
  });

  test('cross-era captives are refused', async () => {
    const captor = await createPlayer('Old-era captor');
    const source = await createPlayer('Old-era source');
    await prisma.users.update({
      where: { id: source.id },
      data: { gold: 1_000_000n },
    });
    const row = await seedCaptive({
      captorId: captor.id,
      sourceId: source.id,
      unitType: 'DEFENSE',
      unitLevel: 1,
      quantity: 10,
      eraId,
    });
    // The source moved on to a later era; the captives did not.
    const laterEra = await prisma.era.create({
      data: { name: 'Later era', startDate: new Date() },
    });
    await prisma.users.update({
      where: { id: source.id },
      data: { currentEraId: laterEra.id },
    });

    await expect(
      CaptiveService.ransom({
        userId: source.id,
        captiveId: row.id,
        operationId: randomUUID(),
      }),
    ).rejects.toThrow('These captives are from an earlier era');
    expect(await prisma.captive.count({ where: { id: row.id } })).toBe(1);
  });
});

describe('release', () => {
  test('freed captives return home and the source gains 2 morale (capped at 100)', async () => {
    const captor = await createPlayer('Releasing captor');
    const source = await createPlayer('Released source');
    await prisma.users.update({
      where: { id: captor.id },
      data: { fort_level: DUNGEON_FORT, gold: 500_000n },
    });
    await prisma.users.update({
      where: { id: source.id },
      data: { kingdom_morale: 50 },
    });
    const row = await seedCaptive({
      captorId: captor.id,
      sourceId: source.id,
      unitType: 'DEFENSE',
      unitLevel: 2,
      quantity: 15,
      eraId,
    });

    const result = await CaptiveService.release({
      userId: captor.id,
      captiveId: row.id,
      operationId: randomUUID(),
    });
    expect(result).toMatchObject({
      action: 'RELEASE',
      quantity: 15,
      moraleGained: 2,
    });
    expect((await userRow(source.id)).kingdom_morale).toBe(52);
    expect((await userRow(captor.id)).gold).toBe(500_000n);
    expect(await unitQuantity(source.id, 'DEFENSE', 2)).toBe(15);
    expect(await prisma.captive.count()).toBe(0);
    expect(
      await prisma.captiveEvent.count({ where: { kind: 'RELEASED' } }),
    ).toBe(1);

    // At 99 morale the +2 is capped at the 100 maximum.
    const cappedSource = await createPlayer('Capped released source');
    const row2 = await seedCaptive({
      captorId: captor.id,
      sourceId: cappedSource.id,
      unitType: 'DEFENSE',
      unitLevel: 1,
      quantity: 5,
      eraId,
    });
    await prisma.users.update({
      where: { id: cappedSource.id },
      data: { kingdom_morale: 99 },
    });
    const capped = await CaptiveService.release({
      userId: captor.id,
      captiveId: row2.id,
      operationId: randomUUID(),
    });
    expect(capped.moraleGained).toBe(1);
    expect((await userRow(cappedSource.id)).kingdom_morale).toBe(100);
  });

  test('only the captor may release', async () => {
    const captor = await createPlayer('Release owner');
    const other = await createPlayer('Release stranger');
    const row = await seedCaptive({
      captorId: captor.id,
      sourceId: other.id,
      unitType: 'DEFENSE',
      unitLevel: 1,
      quantity: 5,
      eraId,
    });
    await expect(
      CaptiveService.release({
        userId: other.id,
        captiveId: row.id,
        operationId: randomUUID(),
      }),
    ).rejects.toThrow('You do not hold these captives');
  });
});

describe('convert', () => {
  test('refused before 72 hours, then converts at 25% of base cost per unit', async () => {
    const captor = await createPlayer('Converting captor');
    const source = await createPlayer('Convert source');
    await prisma.users.update({
      where: { id: captor.id },
      data: { fort_level: DUNGEON_FORT, gold: 1_000_000n },
    });
    const row = await seedCaptive({
      captorId: captor.id,
      sourceId: source.id,
      unitType: 'DEFENSE',
      unitLevel: 1,
      quantity: 40,
      capturedAt: new Date(Date.now() - 71 * HOUR_MS),
      eraId,
    });

    await expect(
      CaptiveService.convert({
        userId: captor.id,
        captiveId: row.id,
        operationId: randomUUID(),
      }),
    ).rejects.toThrow('converted after 72 hours');
    expect(await prisma.captive.count({ where: { id: row.id } })).toBe(1);

    // Back-date past the gate: 40 * 1500 * 25% = 15,000 gold.
    await prisma.captive.update({
      where: { id: row.id },
      data: { capturedAt: new Date(Date.now() - 73 * HOUR_MS) },
    });
    const result = await CaptiveService.convert({
      userId: captor.id,
      captiveId: row.id,
      operationId: randomUUID(),
    });
    expect(result).toMatchObject({
      action: 'CONVERT',
      quantity: 40,
      gold: '15000',
    });
    // A fort 13 captor has every DEFENSE tier unlocked, so the captives keep
    // their tier (demotion only bites when the captor lacks the tier).
    expect(result.toLevel).toBe(1);
    expect((await userRow(captor.id)).gold).toBe(1_000_000n - 15_000n);
    expect(await unitQuantity(captor.id, 'DEFENSE', 1)).toBe(40);
    expect(await unitQuantity(source.id, 'DEFENSE', 1)).toBe(0);
    expect(await prisma.captive.count()).toBe(0);
    const event = await prisma.captiveEvent.findFirstOrThrow({
      where: { kind: 'CONVERTED' },
    });
    expect(event.gold).toBe(15_000n);
    expect(convertCostPerUnit('DEFENSE', 1) * 40n).toBe(BigInt(result.gold));
  });

  test('a captor without the dungeon and one without gold are both refused', async () => {
    const captor = await createPlayer('Lockout captor');
    const broke = await createPlayer('Broke captor');
    const source = await createPlayer('Convert-lock source');
    const lockedRow = await seedCaptive({
      captorId: captor.id,
      sourceId: source.id,
      unitType: 'DEFENSE',
      unitLevel: 1,
      quantity: 10,
      capturedAt: new Date(Date.now() - 4 * DAY_MS),
      eraId,
    });
    await expect(
      CaptiveService.convert({
        userId: captor.id,
        captiveId: lockedRow.id,
        operationId: randomUUID(),
      }),
    ).rejects.toThrow('fortification');

    await prisma.users.update({
      where: { id: broke.id },
      data: { fort_level: DUNGEON_FORT, gold: 0n },
    });
    const brokeRow = await seedCaptive({
      captorId: broke.id,
      sourceId: source.id,
      unitType: 'DEFENSE',
      unitLevel: 1,
      quantity: 10,
      capturedAt: new Date(Date.now() - 4 * DAY_MS),
      eraId,
    });
    await expect(
      CaptiveService.convert({
        userId: broke.id,
        captiveId: brokeRow.id,
        operationId: randomUUID(),
      }),
    ).rejects.toThrow('Insufficient gold');
    expect(await prisma.captive.count()).toBe(2);
  });
});

describe('daily escapes', () => {
  test('captives held past 7 days escape home as citizens; fresher ones stay', async () => {
    const captor = await createPlayer('Escape captor');
    const source = await createPlayer('Escape source');
    await prisma.users.update({
      where: { id: captor.id },
      data: { fort_level: DUNGEON_FORT },
    });
    const overdue = await seedCaptive({
      captorId: captor.id,
      sourceId: source.id,
      unitType: 'DEFENSE',
      unitLevel: 1,
      quantity: 30,
      capturedAt: new Date(Date.now() - 8 * DAY_MS),
      eraId,
    });
    const fresh = await seedCaptive({
      captorId: captor.id,
      sourceId: source.id,
      unitType: 'OFFENSE',
      unitLevel: 1,
      quantity: 10,
      capturedAt: new Date(Date.now() - 6 * DAY_MS),
      eraId,
    });

    const { escaped } = await CaptiveService.processDailyCaptives();
    expect(escaped).toBe(30);
    expect(await prisma.captive.count({ where: { id: overdue.id } })).toBe(0);
    expect(await prisma.captive.count({ where: { id: fresh.id } })).toBe(1);
    // Escapees return as untrained citizens (the default start is 50).
    expect(await unitQuantity(source.id, 'CITIZEN', 1)).toBe(50 + 30);
    expect(await unitQuantity(source.id, 'DEFENSE', 1)).toBe(0);
    const events = await prisma.captiveEvent.findMany({
      where: { kind: 'ESCAPED' },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      quantity: 30,
      sourceId: source.id,
      captorId: captor.id,
    });
  });

  test('captives escape on the next pass after the captor loses the dungeon', async () => {
    const captor = await createPlayer('Demoted captor');
    const source = await createPlayer('Dungeon-lost source');
    await prisma.users.update({
      where: { id: captor.id },
      data: { fort_level: DUNGEON_FORT },
    });
    const row = await seedCaptive({
      captorId: captor.id,
      sourceId: source.id,
      unitType: 'SPY',
      unitLevel: 1,
      quantity: 12,
      capturedAt: new Date(), // fresh: age alone would not free them
      eraId,
    });

    // The fort falls below the unlock level (e.g. an era-start reset or a
    // downgrade); the next daily pass empties the dungeon.
    await prisma.users.update({
      where: { id: captor.id },
      data: { fort_level: DUNGEON_FORT - 1 },
    });
    const { escaped } = await CaptiveService.processDailyCaptives();
    expect(escaped).toBe(12);
    expect(await prisma.captive.count()).toBe(0);
    expect(await unitQuantity(source.id, 'CITIZEN', 1)).toBe(50 + 12);
    const event = await prisma.captiveEvent.findFirstOrThrow({
      where: { kind: 'ESCAPED' },
    });
    expect((event.details as { reason?: string })?.reason).toBe('dungeon lost');
  });
});

describe('era rollover', () => {
  test('all captives are cleared without returning to anyone', async () => {
    const captor = await createPlayer('Rollover captor');
    const source = await createPlayer('Rollover source');
    await seedCaptive({
      captorId: captor.id,
      sourceId: source.id,
      unitType: 'DEFENSE',
      unitLevel: 1,
      quantity: 25,
      capturedAt: new Date(Date.now() - 8 * DAY_MS),
      eraId,
    });

    await startNewEra();

    expect(await prisma.captive.count()).toBe(0);
    // Nothing came back: the era reset restored the default population only.
    expect(await unitQuantity(source.id, 'CITIZEN', 1)).toBe(50);
    expect(await unitQuantity(captor.id, 'DEFENSE', 1)).toBe(0);
    // (These rows were seeded straight into the table, so no ledger events
    // exist either; battle captures are the only thing that writes them.)
    expect(await prisma.captiveEvent.count()).toBe(0);
  });
});

describe('ransom and convert racing on the same captive row', () => {
  test('exactly one wins; the loser is refused and nothing doubles', async () => {
    const captor = await createPlayer('Racing captor');
    const source = await createPlayer('Racing source');
    await prisma.users.update({
      where: { id: captor.id },
      data: { fort_level: DUNGEON_FORT, gold: 1_000_000n },
    });
    await prisma.users.update({
      where: { id: source.id },
      data: { gold: 1_000_000n },
    });
    const row = await seedCaptive({
      captorId: captor.id,
      sourceId: source.id,
      unitType: 'DEFENSE',
      unitLevel: 1,
      quantity: 20,
      capturedAt: new Date(Date.now() - 4 * DAY_MS),
      eraId,
    });

    const attempts = await Promise.allSettled([
      CaptiveService.ransom({
        userId: source.id,
        captiveId: row.id,
        operationId: randomUUID(),
      }),
      CaptiveService.convert({
        userId: captor.id,
        captiveId: row.id,
        operationId: randomUUID(),
      }),
    ]);
    const settled = attempts.map((attempt, index) => ({
      action: index === 0 ? 'ransom' : 'convert',
      ok: attempt.status === 'fulfilled',
    }));
    expect(settled.filter((attempt) => attempt.ok)).toHaveLength(1);

    const events = await prisma.captiveEvent.findMany({
      where: { kind: { in: ['RANSOMED', 'CONVERTED'] } },
    });
    expect(events).toHaveLength(1);
    expect(await prisma.captive.count()).toBe(0);

    // Gold and units moved exactly once, for the winner only.
    if (events[0].kind === 'RANSOMED') {
      const price = ransomPricePerUnit('DEFENSE', 1) * 20n;
      expect((await userRow(source.id)).gold).toBe(1_000_000n - price);
      expect(await unitQuantity(source.id, 'DEFENSE', 1)).toBe(20);
      expect(await unitQuantity(captor.id, 'DEFENSE', 1)).toBe(0);
    } else {
      const cost = convertCostPerUnit('DEFENSE', 1) * 20n;
      expect((await userRow(captor.id)).gold).toBe(1_000_000n - cost);
      expect(await unitQuantity(captor.id, 'DEFENSE', 1)).toBe(20);
      expect(await unitQuantity(source.id, 'DEFENSE', 1)).toBe(0);
    }
  });
});
