/**
 * Adversarial edge coverage for captives and the Dungeon (#210).
 *
 * Every test here asserts the CORRECT behaviour of a rule from the ticket:
 *   10% capture on a breached win with fort >= 13, never from protected or
 *   exempt defenders; capacity 200 + 50/level; ransom at 40% with a 50% captor
 *   share and the rest burned; release returns units and +2 morale; convert
 *   after 72h at 25% with tier demotion; escape after 7 days as citizens;
 *   era rollover clears everything; a captor who loses the dungeon loses the
 *   captives; every action is idempotent by operationId and locks both
 *   players in id order.
 *
 * The point is to attack the boundaries: double spends, foreign rows, stale
 * eras, boundary timestamps, full dungeons, non-positive quantities, races and
 * API input validation.
 */
import { beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { randomUUID } from 'crypto';

import {
  CAPTIVE_MAX_DAYS,
  CONVERT_MIN_HOURS,
  DUNGEON_BASE_CAPACITY,
  ransomPricePerUnit,
} from '@/constants/Captives';
import prisma from '@/lib/prisma';
import type { KilledUnitRow } from '@/services/Captives.service';
import { CaptiveService } from '@/services/Captives.service';
import { resetCurrentEra } from '@/services/CurrentEraReset.service';
import { startNewEra } from '@/services/Era.service';
import { createUser } from '@/services/User.service';

import { resetDatabase } from './db';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DUNGEON_FORT = 13;

type CaptiveType = 'OFFENSE' | 'DEFENSE' | 'SPY' | 'SENTRY';

const createPlayer = (name: string) =>
  createUser(
    `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}@example.test`,
    'not-a-real-hash',
    name,
    'HUMAN',
    'FIGHTER',
  );

const setUnits = async (
  userId: number,
  type: CaptiveType | 'CITIZEN',
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

const goldOf = async (userId: number) => (await userRow(userId)).gold;

/** An era old enough that every player counts as a participant. */
const seedEra = () =>
  prisma.era.create({
    data: {
      name: 'Captives edges era',
      startDate: new Date(Date.now() - 20 * DAY_MS),
    },
  });

const seedCaptive = async (data: {
  captorId: number;
  sourceId: number;
  unitType: CaptiveType;
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

/** 'accepted' when the promise resolves, 'refused' when it rejects. */
const outcomeOf = async (run: () => Promise<unknown>) => {
  try {
    await run();
    return 'accepted' as const;
  } catch {
    return 'refused' as const;
  }
};

let eraId: number;

/** Runs the capture hook exactly as the battle transaction would. */
const capture = (
  killedUnits: KilledUnitRow[],
  captorFortLevel: number,
  captorId: number,
  sourceId: number,
) =>
  prisma.$transaction((tx) =>
    CaptiveService.captureFromBattle(tx, {
      captorId,
      sourceId,
      eraId,
      captorFortLevel,
      killedUnits,
    }),
  );

const heldTotal = async (captorId: number) => {
  const rows = await prisma.captive.findMany({ where: { captorId } });
  return rows.reduce((sum, row) => sum + row.quantity, 0);
};

beforeEach(async () => {
  await resetDatabase();
  eraId = (await seedEra()).id;
});

// ---------------------------------------------------------------------------
// Ransom: the gold must never be double-spent, and never created.
// ---------------------------------------------------------------------------

describe('ransom gold integrity', () => {
  test('a source with exactly enough gold ends at zero, never negative', async () => {
    const captor = await createPlayer('Exact-pay captor');
    const source = await createPlayer('Exact-pay source');
    const price = ransomPricePerUnit('DEFENSE', 1) * 10n; // 6,000
    await prisma.users.update({
      where: { id: source.id },
      data: { gold: price },
    });
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
    expect(result.gold).toBe(price.toString());
    expect(await goldOf(source.id)).toBe(0n);
    expect(await goldOf(captor.id)).toBe(
      25_000n + BigInt(result.captorShare ?? '0'),
    );
    expect(await unitQuantity(source.id, 'DEFENSE', 1)).toBe(10);
  });

  test('two concurrent ransoms with different operationIds charge the row once', async () => {
    const captor = await createPlayer('Concurrent captor');
    const source = await createPlayer('Concurrent source');
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
    const price = ransomPricePerUnit('DEFENSE', 1) * 10n;

    const attempts = await Promise.allSettled([
      CaptiveService.ransom({
        userId: source.id,
        captiveId: row.id,
        operationId: randomUUID(),
      }),
      CaptiveService.ransom({
        userId: source.id,
        captiveId: row.id,
        operationId: randomUUID(),
      }),
    ]);
    expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(1);
    expect(await goldOf(source.id)).toBe(1_000_000n - price);
    expect(await unitQuantity(source.id, 'DEFENSE', 1)).toBe(10);
    expect(
      await prisma.captiveEvent.count({ where: { kind: 'RANSOMED' } }),
    ).toBe(1);
    expect(await prisma.captive.count()).toBe(0);
  });

  test("a source's last gold cannot fund two ransoms held by different captors", async () => {
    const firstCaptor = await createPlayer('First holder');
    const secondCaptor = await createPlayer('Second holder');
    const source = await createPlayer('Last-gold source');
    const price = ransomPricePerUnit('DEFENSE', 1) * 10n; // one ransom only
    await prisma.users.update({
      where: { id: source.id },
      data: { gold: price },
    });
    const first = await seedCaptive({
      captorId: firstCaptor.id,
      sourceId: source.id,
      unitType: 'DEFENSE',
      unitLevel: 1,
      quantity: 10,
      eraId,
    });
    const second = await seedCaptive({
      captorId: secondCaptor.id,
      sourceId: source.id,
      unitType: 'DEFENSE',
      unitLevel: 1,
      quantity: 10,
      eraId,
    });

    const attempts = await Promise.allSettled([
      CaptiveService.ransom({
        userId: source.id,
        captiveId: first.id,
        operationId: randomUUID(),
      }),
      CaptiveService.ransom({
        userId: source.id,
        captiveId: second.id,
        operationId: randomUUID(),
      }),
    ]);
    expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(1);
    // Gold is spent exactly once: zero, never negative.
    expect(await goldOf(source.id)).toBe(0n);
    // Exactly one stack came home; the other is still held.
    expect(await prisma.captive.count()).toBe(1);
    expect(await unitQuantity(source.id, 'DEFENSE', 1)).toBe(10);
  });

  test("a ransom never increases the pair's combined gold (the burn is real)", async () => {
    const captor = await createPlayer('Burn captor');
    const source = await createPlayer('Burn source');
    await prisma.users.update({
      where: { id: source.id },
      data: { gold: 100_000n },
    });
    const row = await seedCaptive({
      captorId: captor.id,
      sourceId: source.id,
      unitType: 'OFFENSE',
      unitLevel: 2,
      quantity: 7,
      eraId,
    });
    const captorBefore = await goldOf(captor.id);
    const sourceBefore = await goldOf(source.id);

    const result = await CaptiveService.ransom({
      userId: source.id,
      captiveId: row.id,
      operationId: randomUUID(),
    });
    const captorAfter = await goldOf(captor.id);
    const sourceAfter = await goldOf(source.id);
    const combinedDelta =
      captorAfter - captorBefore + (sourceAfter - sourceBefore);

    // Every gold piece the source paid either reached the captor or burned.
    expect(sourceBefore - sourceAfter).toBe(BigInt(result.gold));
    expect(combinedDelta).toBe(-BigInt(result.burned ?? '0'));
    expect(BigInt(result.burned ?? '0')).toBeGreaterThan(0n);
    expect(
      BigInt(result.captorShare ?? '0') + BigInt(result.burned ?? '0'),
    ).toBe(BigInt(result.gold));
  });

  test('a failed ransom leaves no idempotency record, so the same operationId works once funded', async () => {
    const captor = await createPlayer('Retry captor');
    const source = await createPlayer('Retry source');
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
    const operationId = randomUUID();

    expect(
      await outcomeOf(() =>
        CaptiveService.ransom({
          userId: source.id,
          captiveId: row.id,
          operationId,
        }),
      ),
    ).toBe('refused');
    expect(await goldOf(source.id)).toBe(100n);
    expect(await prisma.captiveEvent.count()).toBe(0);

    await prisma.users.update({
      where: { id: source.id },
      data: { gold: 10_000n },
    });
    const retried = await CaptiveService.ransom({
      userId: source.id,
      captiveId: row.id,
      operationId,
    });
    expect(retried.gold).toBe('6000');
    expect(await goldOf(source.id)).toBe(4_000n);
  });

  test('a non-positive captive quantity can never mint gold', async () => {
    const captor = await createPlayer('Negative-hold captor');
    const source = await createPlayer('Negative-hold source');
    await prisma.users.update({
      where: { id: source.id },
      data: { gold: 10_000n },
    });
    // The migration's CHECK constraint refuses to store a non-positive
    // stack at all.
    expect(
      await outcomeOf(() =>
        seedCaptive({
          captorId: captor.id,
          sourceId: source.id,
          unitType: 'DEFENSE',
          unitLevel: 1,
          quantity: -10,
          eraId,
        }),
      ),
    ).toBe('refused');
    expect(
      await outcomeOf(() =>
        seedCaptive({
          captorId: captor.id,
          sourceId: source.id,
          unitType: 'DEFENSE',
          unitLevel: 1,
          quantity: 0,
          eraId,
        }),
      ),
    ).toBe('refused');
    expect(await prisma.captive.count()).toBe(0);

    // A row that predates the constraint (corrupt or legacy data) must
    // still never mint gold, so drop the constraint for this check.
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "Captive" DROP CONSTRAINT "Captive_quantity_check"',
    );
    try {
      const negative = await seedCaptive({
        captorId: captor.id,
        sourceId: source.id,
        unitType: 'DEFENSE',
        unitLevel: 1,
        quantity: -10,
        eraId,
      });
      const zero = await seedCaptive({
        captorId: captor.id,
        sourceId: source.id,
        unitType: 'DEFENSE',
        unitLevel: 1,
        quantity: 0,
        eraId,
      });
      const sourceGold = await goldOf(source.id);
      const captorGold = await goldOf(captor.id);

      // A negative price turns `decrement` into a credit: the source would pay
      // -6,000 (i.e. gain 6,000) while the captor is charged for it — gold
      // created out of nothing. A zero row must not move anything either.
      const negativeOutcome = await outcomeOf(() =>
        CaptiveService.ransom({
          userId: source.id,
          captiveId: negative.id,
          operationId: randomUUID(),
        }),
      );
      const zeroOutcome = await outcomeOf(() =>
        CaptiveService.ransom({
          userId: source.id,
          captiveId: zero.id,
          operationId: randomUUID(),
        }),
      );

      expect({
        negative: negativeOutcome,
        zero: zeroOutcome,
        sourceDelta: (await goldOf(source.id)) - sourceGold,
        captorDelta: (await goldOf(captor.id)) - captorGold,
        held: await prisma.captive.count(),
      }).toEqual({
        negative: 'refused',
        zero: 'refused',
        sourceDelta: 0n,
        captorDelta: 0n,
        held: 2,
      });
    } finally {
      // Restore the constraint the migration installed (after removing the
      // violating rows, or the validation would fail).
      await prisma.captive.deleteMany({ where: { captorId: captor.id } });
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "Captive" ADD CONSTRAINT "Captive_quantity_check" CHECK ("quantity" > 0)',
      );
    }
  });

  test('a huge stack is priced exactly and refused when unaffordable', async () => {
    const captor = await createPlayer('Huge captor');
    const source = await createPlayer('Huge source');
    const quantity = 2_000_000;
    const row = await seedCaptive({
      captorId: captor.id,
      sourceId: source.id,
      unitType: 'OFFENSE',
      unitLevel: 3,
      quantity,
      eraId,
    });
    // 25,000 base cost * 40% * 2,000,000 = 20,000,000,000 gold, computed in
    // BigInt exactly (a float would already be exact here, but the price must
    // stay exact for any stack the Int column allows).
    const bigPrice = ransomPricePerUnit('OFFENSE', 3) * BigInt(quantity);
    expect(bigPrice).toBe(20_000_000_000n);
    const sourceGold = await goldOf(source.id);

    expect(
      await outcomeOf(() =>
        CaptiveService.ransom({
          userId: source.id,
          captiveId: row.id,
          operationId: randomUUID(),
        }),
      ),
    ).toBe('refused');
    expect(await goldOf(source.id)).toBe(sourceGold);
    expect(await prisma.captive.count({ where: { id: row.id } })).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Ownership: rows belong to a pair, and only the right side may act.
// ---------------------------------------------------------------------------

describe('ownership and pair isolation', () => {
  test("a third kingdom cannot ransom, release or convert a pair's captives", async () => {
    const captor = await createPlayer('Own captor');
    const source = await createPlayer('Own source');
    const stranger = await createPlayer('Own stranger');
    await prisma.users.update({
      where: { id: stranger.id },
      data: { gold: 1_000_000n },
    });
    await prisma.users.update({
      where: { id: captor.id },
      data: { fort_level: DUNGEON_FORT, gold: 1_000_000n },
    });
    const row = await seedCaptive({
      captorId: captor.id,
      sourceId: source.id,
      unitType: 'DEFENSE',
      unitLevel: 1,
      quantity: 10,
      capturedAt: new Date(Date.now() - 8 * DAY_MS),
      eraId,
    });
    const strangerGold = await goldOf(stranger.id);

    expect(
      await outcomeOf(() =>
        CaptiveService.ransom({
          userId: stranger.id,
          captiveId: row.id,
          operationId: randomUUID(),
        }),
      ),
    ).toBe('refused');
    expect(
      await outcomeOf(() =>
        CaptiveService.release({
          userId: stranger.id,
          captiveId: row.id,
          operationId: randomUUID(),
        }),
      ),
    ).toBe('refused');
    expect(
      await outcomeOf(() =>
        CaptiveService.convert({
          userId: stranger.id,
          captiveId: row.id,
          operationId: randomUUID(),
        }),
      ),
    ).toBe('refused');

    expect(await prisma.captive.count({ where: { id: row.id } })).toBe(1);
    expect(await goldOf(stranger.id)).toBe(strangerGold);
    expect(await unitQuantity(stranger.id, 'DEFENSE', 1)).toBe(0);
  });

  test('the source cannot release or convert its own captives for free', async () => {
    const captor = await createPlayer('Self-release captor');
    const source = await createPlayer('Self-release source');
    await prisma.users.update({
      where: { id: source.id },
      data: { kingdom_morale: 50, fort_level: DUNGEON_FORT },
    });
    const row = await seedCaptive({
      captorId: captor.id,
      sourceId: source.id,
      unitType: 'DEFENSE',
      unitLevel: 1,
      quantity: 10,
      capturedAt: new Date(Date.now() - 8 * DAY_MS),
      eraId,
    });

    // Release is the captor's gift: the source must never self-serve the
    // units and the +2 morale.
    expect(
      await outcomeOf(() =>
        CaptiveService.release({
          userId: source.id,
          captiveId: row.id,
          operationId: randomUUID(),
        }),
      ),
    ).toBe('refused');
    expect(
      await outcomeOf(() =>
        CaptiveService.convert({
          userId: source.id,
          captiveId: row.id,
          operationId: randomUUID(),
        }),
      ),
    ).toBe('refused');

    expect((await userRow(source.id)).kingdom_morale).toBe(50);
    expect(await unitQuantity(source.id, 'DEFENSE', 1)).toBe(0);
    expect(await prisma.captive.count({ where: { id: row.id } })).toBe(1);
  });

  test('a captive id from another pair is never acted on by its own ids', async () => {
    const captorA = await createPlayer('Pair A captor');
    const sourceA = await createPlayer('Pair A source');
    const captorB = await createPlayer('Pair B captor');
    const sourceB = await createPlayer('Pair B source');
    await prisma.users.update({
      where: { id: sourceA.id },
      data: { gold: 1_000_000n },
    });
    const rowA = await seedCaptive({
      captorId: captorA.id,
      sourceId: sourceA.id,
      unitType: 'DEFENSE',
      unitLevel: 1,
      quantity: 10,
      eraId,
    });

    // sourceB is a legitimate source, but of a different pair.
    expect(
      await outcomeOf(() =>
        CaptiveService.ransom({
          userId: sourceB.id,
          captiveId: rowA.id,
          operationId: randomUUID(),
        }),
      ),
    ).toBe('refused');
    // captorB is a legitimate captor, but of a different pair.
    expect(
      await outcomeOf(() =>
        CaptiveService.release({
          userId: captorB.id,
          captiveId: rowA.id,
          operationId: randomUUID(),
        }),
      ),
    ).toBe('refused');
    expect(await prisma.captive.count({ where: { id: rowA.id } })).toBe(1);
    expect(await unitQuantity(sourceA.id, 'DEFENSE', 1)).toBe(0);
  });

  test('two stacks between the same pair are ransomed independently', async () => {
    const captor = await createPlayer('Partial captor');
    const source = await createPlayer('Partial source');
    await prisma.users.update({
      where: { id: source.id },
      data: { gold: 1_000_000n },
    });
    const first = await seedCaptive({
      captorId: captor.id,
      sourceId: source.id,
      unitType: 'DEFENSE',
      unitLevel: 1,
      quantity: 10,
      eraId,
    });
    const second = await seedCaptive({
      captorId: captor.id,
      sourceId: source.id,
      unitType: 'OFFENSE',
      unitLevel: 1,
      quantity: 20,
      eraId,
    });

    await CaptiveService.ransom({
      userId: source.id,
      captiveId: first.id,
      operationId: randomUUID(),
    });
    // Only the first stack's price was charged and only its units returned.
    expect(await goldOf(source.id)).toBe(1_000_000n - 6_000n);
    expect(await unitQuantity(source.id, 'DEFENSE', 1)).toBe(10);
    expect(await unitQuantity(source.id, 'OFFENSE', 1)).toBe(0);
    expect(await prisma.captive.count({ where: { id: second.id } })).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Idempotency by operationId.
// ---------------------------------------------------------------------------

describe('operationId idempotency', () => {
  test('one operationId cannot be reused for a different action or row', async () => {
    const captor = await createPlayer('Reuse captor');
    const source = await createPlayer('Reuse source');
    await prisma.users.update({
      where: { id: source.id },
      data: { gold: 1_000_000n },
    });
    await prisma.users.update({
      where: { id: captor.id },
      data: { fort_level: DUNGEON_FORT, gold: 1_000_000n },
    });
    const ransomed = await seedCaptive({
      captorId: captor.id,
      sourceId: source.id,
      unitType: 'DEFENSE',
      unitLevel: 1,
      quantity: 10,
      eraId,
    });
    const others = await seedCaptive({
      captorId: captor.id,
      sourceId: source.id,
      unitType: 'DEFENSE',
      unitLevel: 1,
      quantity: 5,
      capturedAt: new Date(Date.now() - 8 * DAY_MS),
      eraId,
    });
    const operationId = randomUUID();

    await CaptiveService.ransom({
      userId: source.id,
      captiveId: ransomed.id,
      operationId,
    });
    // Same id, different action (release) on a different row: refused.
    expect(
      await outcomeOf(() =>
        CaptiveService.release({
          userId: captor.id,
          captiveId: others.id,
          operationId,
        }),
      ),
    ).toBe('refused');
    // Same id, convert on another row: refused.
    expect(
      await outcomeOf(() =>
        CaptiveService.convert({
          userId: captor.id,
          captiveId: others.id,
          operationId,
        }),
      ),
    ).toBe('refused');

    expect(await prisma.captive.count({ where: { id: others.id } })).toBe(1);
    expect(
      await prisma.captiveEvent.count({
        where: { kind: { in: ['RELEASED', 'CONVERTED'] } },
      }),
    ).toBe(0);
  });

  test('replaying release and convert repeats neither morale, units nor cost', async () => {
    const captor = await createPlayer('Replay captor');
    const source = await createPlayer('Replay source');
    await prisma.users.update({
      where: { id: captor.id },
      data: { fort_level: DUNGEON_FORT, gold: 1_000_000n },
    });
    await prisma.users.update({
      where: { id: source.id },
      data: { kingdom_morale: 60 },
    });
    const releaseRow = await seedCaptive({
      captorId: captor.id,
      sourceId: source.id,
      unitType: 'DEFENSE',
      unitLevel: 1,
      quantity: 10,
      eraId,
    });
    const convertRow = await seedCaptive({
      captorId: captor.id,
      sourceId: source.id,
      unitType: 'DEFENSE',
      unitLevel: 1,
      quantity: 20,
      capturedAt: new Date(Date.now() - 4 * DAY_MS),
      eraId,
    });

    const releaseId = randomUUID();
    const released = await CaptiveService.release({
      userId: captor.id,
      captiveId: releaseRow.id,
      operationId: releaseId,
    });
    const replayRelease = await CaptiveService.release({
      userId: captor.id,
      captiveId: releaseRow.id,
      operationId: releaseId,
    });
    expect(replayRelease).toEqual(released);
    expect((await userRow(source.id)).kingdom_morale).toBe(62);
    expect(await unitQuantity(source.id, 'DEFENSE', 1)).toBe(10);

    const convertId = randomUUID();
    const converted = await CaptiveService.convert({
      userId: captor.id,
      captiveId: convertRow.id,
      operationId: convertId,
    });
    const replayConvert = await CaptiveService.convert({
      userId: captor.id,
      captiveId: convertRow.id,
      operationId: convertId,
    });
    expect(replayConvert).toEqual(converted);
    expect(await goldOf(captor.id)).toBe(1_000_000n - BigInt(converted.gold));
    expect(await unitQuantity(captor.id, 'DEFENSE', 1)).toBe(20);
    expect(await prisma.captiveEvent.count()).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Era boundaries.
// ---------------------------------------------------------------------------

describe('era boundaries', () => {
  test('release and convert refuse captives from an earlier era', async () => {
    const captor = await createPlayer('Stale captor');
    const source = await createPlayer('Stale source');
    await prisma.users.update({
      where: { id: captor.id },
      data: { fort_level: DUNGEON_FORT, gold: 1_000_000n },
    });
    await prisma.users.update({
      where: { id: source.id },
      data: { kingdom_morale: 50 },
    });
    const row = await seedCaptive({
      captorId: captor.id,
      sourceId: source.id,
      unitType: 'DEFENSE',
      unitLevel: 1,
      quantity: 10,
      capturedAt: new Date(Date.now() - 8 * DAY_MS),
      eraId,
    });
    const laterEra = await prisma.era.create({
      data: { name: 'Later era', startDate: new Date() },
    });
    await prisma.users.update({
      where: { id: source.id },
      data: { currentEraId: laterEra.id },
    });

    expect(
      await outcomeOf(() =>
        CaptiveService.release({
          userId: captor.id,
          captiveId: row.id,
          operationId: randomUUID(),
        }),
      ),
    ).toBe('refused');
    // The captor is also refused convert: the source has moved on.
    expect(
      await outcomeOf(() =>
        CaptiveService.convert({
          userId: captor.id,
          captiveId: row.id,
          operationId: randomUUID(),
        }),
      ),
    ).toBe('refused');

    expect(await prisma.captive.count({ where: { id: row.id } })).toBe(1);
    expect((await userRow(source.id)).kingdom_morale).toBe(50);
    expect(await unitQuantity(source.id, 'DEFENSE', 1)).toBe(0);
  });

  test('a captive with no era is refused by every action', async () => {
    const captor = await createPlayer('Null-era captor');
    const source = await createPlayer('Null-era source');
    await prisma.users.update({
      where: { id: captor.id },
      data: { fort_level: DUNGEON_FORT, gold: 1_000_000n },
    });
    await prisma.users.update({
      where: { id: source.id },
      data: { gold: 1_000_000n, kingdom_morale: 50 },
    });
    const row = await seedCaptive({
      captorId: captor.id,
      sourceId: source.id,
      unitType: 'DEFENSE',
      unitLevel: 1,
      quantity: 10,
      capturedAt: new Date(Date.now() - 8 * DAY_MS),
      eraId: null,
    });

    for (const run of [
      () =>
        CaptiveService.ransom({
          userId: source.id,
          captiveId: row.id,
          operationId: randomUUID(),
        }),
      () =>
        CaptiveService.release({
          userId: captor.id,
          captiveId: row.id,
          operationId: randomUUID(),
        }),
      () =>
        CaptiveService.convert({
          userId: captor.id,
          captiveId: row.id,
          operationId: randomUUID(),
        }),
    ])
      expect(await outcomeOf(run)).toBe('refused');

    expect(await prisma.captive.count({ where: { id: row.id } })).toBe(1);
    expect((await userRow(source.id)).kingdom_morale).toBe(50);
    expect(await goldOf(source.id)).toBe(1_000_000n);
  });

  test('after an era rollover old captives are gone and no action resurrects them', async () => {
    const captor = await createPlayer('Rollover captor');
    const source = await createPlayer('Rollover source');
    const row = await seedCaptive({
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

    for (const run of [
      () =>
        CaptiveService.ransom({
          userId: source.id,
          captiveId: row.id,
          operationId: randomUUID(),
        }),
      () =>
        CaptiveService.release({
          userId: captor.id,
          captiveId: row.id,
          operationId: randomUUID(),
        }),
      () =>
        CaptiveService.convert({
          userId: captor.id,
          captiveId: row.id,
          operationId: randomUUID(),
        }),
    ])
      expect(await outcomeOf(run)).toBe('refused');

    // Nothing was handed back by the rollover either: the era start default
    // population is all the source has.
    expect(await unitQuantity(source.id, 'CITIZEN', 1)).toBe(50);
    expect(await unitQuantity(source.id, 'DEFENSE', 1)).toBe(0);
  });

  test('an admin current-era reset clears the dungeon and later actions fail', async () => {
    const admin = await createPlayer('Reset admin');
    const captor = await createPlayer('Reset captor');
    const source = await createPlayer('Reset source');
    await prisma.users.update({
      where: { id: captor.id },
      data: { fort_level: DUNGEON_FORT },
    });
    await prisma.serverSetting.create({
      data: {
        key: 'DISABLE_LOGIN',
        label: 'Disable login',
        type: 'BOOLEAN',
        value: true,
        isPublic: true,
      },
    });
    const row = await seedCaptive({
      captorId: captor.id,
      sourceId: source.id,
      unitType: 'DEFENSE',
      unitLevel: 1,
      quantity: 25,
      capturedAt: new Date(Date.now() - 8 * DAY_MS),
      eraId,
    });
    const era = await prisma.era.findFirstOrThrow({
      where: { endDate: null },
    });

    await resetCurrentEra({
      eraId: era.id,
      expectedEraStartDate: era.startDate,
      confirmation: `RESET ERA ${era.id}`,
      adminUserId: admin.id,
      ip: '127.0.0.1',
    });

    expect(await prisma.captive.count()).toBe(0);
    expect(
      await outcomeOf(() =>
        CaptiveService.ransom({
          userId: source.id,
          captiveId: row.id,
          operationId: randomUUID(),
        }),
      ),
    ).toBe('refused');
    expect(await unitQuantity(source.id, 'CITIZEN', 1)).toBe(50);
    expect(await unitQuantity(source.id, 'DEFENSE', 1)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Conversion timing.
// ---------------------------------------------------------------------------

describe('conversion timing', () => {
  test('refused 1 ms before 72h, allowed at exactly 72h', async () => {
    const captor = await createPlayer('Boundary captor');
    const source = await createPlayer('Boundary source');
    await prisma.users.update({
      where: { id: captor.id },
      data: { fort_level: DUNGEON_FORT, gold: 1_000_000n },
    });
    const capturedAt = new Date('2026-10-01T00:00:00.000Z');
    const readyAt = new Date(
      capturedAt.getTime() + CONVERT_MIN_HOURS * HOUR_MS,
    );
    const row = await seedCaptive({
      captorId: captor.id,
      sourceId: source.id,
      unitType: 'DEFENSE',
      unitLevel: 1,
      quantity: 10,
      capturedAt,
      eraId,
    });

    expect(
      await outcomeOf(() =>
        CaptiveService.convert(
          {
            userId: captor.id,
            captiveId: row.id,
            operationId: randomUUID(),
          },
          new Date(readyAt.getTime() - 1),
        ),
      ),
    ).toBe('refused');
    expect(await prisma.captive.count({ where: { id: row.id } })).toBe(1);

    const exact = await CaptiveService.convert(
      {
        userId: captor.id,
        captiveId: row.id,
        operationId: randomUUID(),
      },
      readyAt,
    );
    expect(exact.action).toBe('CONVERT');
    expect(exact.quantity).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Capture edges: rounding, eligibility, capacity.
// ---------------------------------------------------------------------------

describe('capture edges', () => {
  test('1-9 kills take nobody, 10 kills take exactly one', async () => {
    const captor = await createPlayer('Small-fight captor');
    const loser = await createPlayer('Small-fight loser');

    expect(
      await capture(
        [{ type: 'DEFENSE', level: 1, quantity: 9 }],
        DUNGEON_FORT,
        captor.id,
        loser.id,
      ),
    ).toBe(0);
    expect(await prisma.captive.count()).toBe(0);

    expect(
      await capture(
        [{ type: 'DEFENSE', level: 1, quantity: 10 }],
        DUNGEON_FORT,
        captor.id,
        loser.id,
      ),
    ).toBe(1);
    expect(await heldTotal(captor.id)).toBe(1);
  });

  test('zero losses and zero-quantity rows produce no captives and no events', async () => {
    const captor = await createPlayer('No-loss captor');
    const loser = await createPlayer('No-loss loser');

    expect(await capture([], DUNGEON_FORT, captor.id, loser.id)).toBe(0);
    expect(
      await capture(
        [
          { type: 'DEFENSE', level: 1, quantity: 0 },
          { type: 'OFFENSE', level: 1, quantity: 0 },
        ],
        DUNGEON_FORT,
        captor.id,
        loser.id,
      ),
    ).toBe(0);
    expect(await prisma.captive.count()).toBe(0);
    expect(await prisma.captiveEvent.count()).toBe(0);
  });

  test('mercenary and citizen losses are excluded even beside real losses', async () => {
    const captor = await createPlayer('Merc-filter captor');
    const loser = await createPlayer('Merc-filter loser');

    const taken = await capture(
      [
        { type: 'DEFENSE', level: 1, quantity: 100 },
        { type: 'DEFENSE', level: 1, quantity: 5_000, isMercenary: true },
        { type: 'CITIZEN', level: 1, quantity: 5_000 },
        { type: 'WORKER', level: 1, quantity: 5_000 },
      ],
      DUNGEON_FORT,
      captor.id,
      loser.id,
    );
    expect(taken).toBe(10);
    const rows = await prisma.captive.findMany({
      where: { captorId: captor.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ unitType: 'DEFENSE', quantity: 10 });
  });

  test('a dungeon that is exactly full takes nobody', async () => {
    const captor = await createPlayer('Full captor');
    const loser = await createPlayer('Full loser');
    await seedCaptive({
      captorId: captor.id,
      sourceId: loser.id,
      unitType: 'DEFENSE',
      unitLevel: 1,
      quantity: DUNGEON_BASE_CAPACITY,
      eraId,
    });

    expect(
      await capture(
        [{ type: 'DEFENSE', level: 1, quantity: 5_000 }],
        DUNGEON_FORT,
        captor.id,
        loser.id,
      ),
    ).toBe(0);
    expect(await heldTotal(captor.id)).toBe(DUNGEON_BASE_CAPACITY);
    expect(
      await prisma.captiveEvent.count({ where: { kind: 'CAPTURED' } }),
    ).toBe(0);
  });

  test('a dungeon with a single free slot takes exactly one', async () => {
    const captor = await createPlayer('One-slot captor');
    const loser = await createPlayer('One-slot loser');
    await seedCaptive({
      captorId: captor.id,
      sourceId: loser.id,
      unitType: 'DEFENSE',
      unitLevel: 1,
      quantity: DUNGEON_BASE_CAPACITY - 1,
      eraId,
    });

    expect(
      await capture(
        [{ type: 'DEFENSE', level: 1, quantity: 5_000 }],
        DUNGEON_FORT,
        captor.id,
        loser.id,
      ),
    ).toBe(1);
    expect(await heldTotal(captor.id)).toBe(DUNGEON_BASE_CAPACITY);
  });

  test('repeated captures can never push the dungeon past capacity', async () => {
    const captor = await createPlayer('Repeat captor');
    const loser = await createPlayer('Repeat loser');

    const first = await capture(
      [{ type: 'DEFENSE', level: 1, quantity: 5_000 }],
      DUNGEON_FORT,
      captor.id,
      loser.id,
    );
    const second = await capture(
      [{ type: 'DEFENSE', level: 1, quantity: 5_000 }],
      DUNGEON_FORT,
      captor.id,
      loser.id,
    );
    const third = await capture(
      [{ type: 'DEFENSE', level: 1, quantity: 5_000 }],
      DUNGEON_FORT,
      captor.id,
      loser.id,
    );

    expect([first, second, third]).toEqual([200, 0, 0]);
    expect(await heldTotal(captor.id)).toBe(DUNGEON_BASE_CAPACITY);
  });

  test('the capture hook itself refuses a captor without a dungeon', async () => {
    const captor = await createPlayer('No-dungeon captor');
    const loser = await createPlayer('No-dungeon loser');

    // Fort 12 (one below the Citadel): the battle hook would never call this,
    // but the service takes the fort level and must not hold prisoners for a
    // kingdom that has no dungeon.
    const taken = await capture(
      [{ type: 'DEFENSE', level: 1, quantity: 5_000 }],
      DUNGEON_FORT - 1,
      captor.id,
      loser.id,
    );
    expect(taken).toBe(0);
    expect(await prisma.captive.count()).toBe(0);
  });

  test('capacity scales from 200 at 13 by 50 per level above', async () => {
    const captor = await createPlayer('Scale captor');
    const loser = await createPlayer('Scale loser');

    const atFourteen = await capture(
      [{ type: 'DEFENSE', level: 1, quantity: 5_000 }],
      DUNGEON_FORT + 1,
      captor.id,
      loser.id,
    );
    expect(atFourteen).toBe(DUNGEON_BASE_CAPACITY + 50);
    expect(await heldTotal(captor.id)).toBe(250);
  });
});

// ---------------------------------------------------------------------------
// Escape pass.
// ---------------------------------------------------------------------------

describe('escape pass edges', () => {
  test('a second pass on the same day escapes nothing twice', async () => {
    const captor = await createPlayer('Twice captor');
    const source = await createPlayer('Twice source');
    await prisma.users.update({
      where: { id: captor.id },
      data: { fort_level: DUNGEON_FORT },
    });
    await seedCaptive({
      captorId: captor.id,
      sourceId: source.id,
      unitType: 'DEFENSE',
      unitLevel: 1,
      quantity: 30,
      capturedAt: new Date(Date.now() - 8 * DAY_MS),
      eraId,
    });

    expect((await CaptiveService.processDailyCaptives()).escaped).toBe(30);
    expect((await CaptiveService.processDailyCaptives()).escaped).toBe(0);
    expect(await unitQuantity(source.id, 'CITIZEN', 1)).toBe(80);
    expect(
      await prisma.captiveEvent.count({ where: { kind: 'ESCAPED' } }),
    ).toBe(1);
  });

  test('escape fires at exactly 7 days, not 1 ms before', async () => {
    const captor = await createPlayer('Deadline captor');
    const source = await createPlayer('Deadline source');
    await prisma.users.update({
      where: { id: captor.id },
      data: { fort_level: DUNGEON_FORT },
    });
    const now = new Date('2026-10-20T12:00:00.000Z');
    const deadline = new Date(now.getTime() - CAPTIVE_MAX_DAYS * DAY_MS);
    const exact = await seedCaptive({
      captorId: captor.id,
      sourceId: source.id,
      unitType: 'DEFENSE',
      unitLevel: 1,
      quantity: 7,
      capturedAt: deadline,
      eraId,
    });
    const tooEarly = await seedCaptive({
      captorId: captor.id,
      sourceId: source.id,
      unitType: 'OFFENSE',
      unitLevel: 1,
      quantity: 11,
      capturedAt: new Date(deadline.getTime() + 1),
      eraId,
    });

    const { escaped } = await CaptiveService.processDailyCaptives(now);
    expect(escaped).toBe(7);
    expect(await prisma.captive.count({ where: { id: exact.id } })).toBe(0);
    expect(await prisma.captive.count({ where: { id: tooEarly.id } })).toBe(1);
  });

  test('an escape racing a ransom on the same row moves the troops once', async () => {
    const captor = await createPlayer('Race captor');
    const source = await createPlayer('Race source');
    await prisma.users.update({
      where: { id: captor.id },
      data: { fort_level: DUNGEON_FORT },
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
      quantity: 30,
      capturedAt: new Date(Date.now() - 8 * DAY_MS),
      eraId,
    });

    const [ransomAttempt] = await Promise.allSettled([
      CaptiveService.ransom({
        userId: source.id,
        captiveId: row.id,
        operationId: randomUUID(),
      }),
      CaptiveService.processDailyCaptives(),
    ]);

    expect(await prisma.captive.count()).toBe(0);
    const events = await prisma.captiveEvent.findMany({
      where: { kind: { in: ['RANSOMED', 'ESCAPED'] } },
    });
    expect(events).toHaveLength(1);

    // The 30 men come home exactly once: either as trained DEFENSE (ransom)
    // or as CITIZENs (escape), never both and never doubled.
    const soldiers = await unitQuantity(source.id, 'DEFENSE', 1);
    const citizens = (await unitQuantity(source.id, 'CITIZEN', 1)) - 50;
    expect(soldiers + citizens).toBe(30);
    const ransomPrice = ransomPricePerUnit('DEFENSE', 1) * 30n;
    if (ransomAttempt.status === 'fulfilled') {
      expect(events[0].kind).toBe('RANSOMED');
      expect(soldiers).toBe(30);
      expect(await goldOf(source.id)).toBe(1_000_000n - ransomPrice);
    } else {
      expect(events[0].kind).toBe('ESCAPED');
      expect(citizens).toBe(30);
      expect(await goldOf(source.id)).toBe(1_000_000n);
    }
  });

  test('a captor downgraded below fort 13 cannot convert, but the source may still ransom', async () => {
    const captor = await createPlayer('Downgrade captor');
    const source = await createPlayer('Downgrade source');
    await prisma.users.update({
      where: { id: captor.id },
      data: { fort_level: DUNGEON_FORT },
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
      quantity: 10,
      capturedAt: new Date(Date.now() - 4 * DAY_MS),
      eraId,
    });
    await prisma.users.update({
      where: { id: captor.id },
      data: { fort_level: DUNGEON_FORT - 1 },
    });

    expect(
      await outcomeOf(() =>
        CaptiveService.convert({
          userId: captor.id,
          captiveId: row.id,
          operationId: randomUUID(),
        }),
      ),
    ).toBe('refused');
    // Rescuing your own troops before the daily pass frees them is legitimate.
    const rescued = await CaptiveService.ransom({
      userId: source.id,
      captiveId: row.id,
      operationId: randomUUID(),
    });
    expect(rescued.gold).toBe('6000');
    expect(await unitQuantity(source.id, 'DEFENSE', 1)).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// API surface: validation and the dungeon panel.
// ---------------------------------------------------------------------------

interface FakeResponse {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  status(code: number): FakeResponse;
  json(payload: unknown): FakeResponse;
  setHeader(name: string, value: string): FakeResponse;
  end(): FakeResponse;
}

const makeRes = (): FakeResponse => {
  const res: FakeResponse = {
    statusCode: 200,
    body: undefined,
    headers: {},
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(payload) {
      res.body = payload;
      return res;
    },
    setHeader(name, value) {
      res.headers[name] = value;
      return res;
    },
    end() {
      return res;
    },
  };
  return res;
};

const callRoute = async (
  handler: (req: unknown, res: unknown) => Promise<unknown>,
  options: {
    method?: string;
    body?: unknown;
    userId?: number;
  } = {},
): Promise<FakeResponse> => {
  const res = makeRes();
  const req: Record<string, unknown> = {
    method: options.method ?? 'POST',
    body: options.body,
    query: {},
    headers: {},
    cookies: {},
  };
  if (options.userId !== undefined)
    req.session = { user: { id: options.userId } };
  await handler(req, res);
  return res;
};

let actionsHandler: (req: unknown, res: unknown) => Promise<unknown>;
let dungeonHandler: (req: unknown, res: unknown) => Promise<unknown>;

beforeAll(async () => {
  // Synthetic auth replaces only the session boundary; the real handler,
  // validation schema and service run against the throwaway database.
  mock.module('@/middleware/auth', () => ({
    withAuth: (handler: unknown) => handler,
  }));
  mock.module('@/middleware/apiGuard', () => ({
    withApiGuard: () => (handler: unknown) => handler,
  }));
  actionsHandler = (
    (await import('@/pages/api/kingdom/dungeon/actions')) as {
      default: typeof actionsHandler;
    }
  ).default;
  dungeonHandler = (
    (await import('@/pages/api/kingdom/dungeon')) as {
      default: typeof dungeonHandler;
    }
  ).default;
  // The wrapped handlers above captured the stubs; drop the module mocks so a
  // run of the whole integration directory is not affected by this file.
  mock.restore();
});

describe('dungeon actions API', () => {
  test('malformed orders are rejected with 400 and never touch state', async () => {
    const captor = await createPlayer('Api captor');
    const source = await createPlayer('Api source');
    const stranger = await createPlayer('Api stranger');
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
    const valid = { action: 'ransom', captiveId: row.id };

    const cases: Array<{
      label: string;
      options: Parameters<typeof callRoute>[1];
      expected: number;
    }> = [
      {
        label: 'no session',
        options: { body: { ...valid, operationId: randomUUID() } },
        expected: 401,
      },
      {
        label: 'GET',
        options: { method: 'GET', userId: source.id },
        expected: 405,
      },
      {
        label: 'missing operationId',
        options: { body: valid, userId: source.id },
        expected: 400,
      },
      {
        label: 'non-uuid operationId',
        options: {
          body: { ...valid, operationId: 'not-a-uuid' },
          userId: source.id,
        },
        expected: 400,
      },
      {
        label: 'captiveId 0',
        options: {
          body: { ...valid, captiveId: 0, operationId: randomUUID() },
          userId: source.id,
        },
        expected: 400,
      },
      {
        label: 'captiveId negative',
        options: {
          body: { ...valid, captiveId: -3, operationId: randomUUID() },
          userId: source.id,
        },
        expected: 400,
      },
      {
        label: 'captiveId non-integer',
        options: {
          body: { ...valid, captiveId: 1.5, operationId: randomUUID() },
          userId: source.id,
        },
        expected: 400,
      },
      {
        label: 'captiveId as a string',
        options: {
          body: { ...valid, captiveId: '7', operationId: randomUUID() },
          userId: source.id,
        },
        expected: 400,
      },
      {
        label: 'unknown action',
        options: {
          body: {
            action: 'steal',
            captiveId: row.id,
            operationId: randomUUID(),
          },
          userId: source.id,
        },
        expected: 400,
      },
      {
        label: 'extra field (strict schema)',
        options: {
          body: { ...valid, quantity: 1, operationId: randomUUID() },
          userId: source.id,
        },
        expected: 400,
      },
      {
        label: 'null body',
        options: { body: null, userId: source.id },
        expected: 400,
      },
      {
        label: 'a stranger’s row',
        options: {
          body: { ...valid, operationId: randomUUID() },
          userId: stranger.id,
        },
        expected: 400,
      },
      {
        label: 'unknown captive id',
        options: {
          body: {
            ...valid,
            captiveId: row.id + 999_999,
            operationId: randomUUID(),
          },
          userId: source.id,
        },
        expected: 400,
      },
    ];

    for (const scenario of cases) {
      const res = await callRoute(actionsHandler, scenario.options);
      expect({ label: scenario.label, status: res.statusCode }).toEqual({
        label: scenario.label,
        status: scenario.expected,
      });
    }

    expect(await prisma.captive.count({ where: { id: row.id } })).toBe(1);
    expect(await goldOf(source.id)).toBe(1_000_000n);
    expect(await unitQuantity(source.id, 'DEFENSE', 1)).toBe(0);
  });

  test('a valid order is applied exactly once through the route', async () => {
    const captor = await createPlayer('Api ok captor');
    const source = await createPlayer('Api ok source');
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
    const operationId = randomUUID();
    const body = { action: 'ransom', captiveId: row.id, operationId };

    const first = await callRoute(actionsHandler, {
      body,
      userId: source.id,
    });
    expect(first.statusCode).toBe(200);
    expect((first.body as { result: { action: string } }).result.action).toBe(
      'RANSOM',
    );
    // A retried request through the route replays and charges once.
    const retry = await callRoute(actionsHandler, {
      body,
      userId: source.id,
    });
    expect(retry.statusCode).toBe(200);
    expect(retry.body).toEqual(first.body);
    expect(await goldOf(source.id)).toBe(1_000_000n - 6_000n);
    expect(await unitQuantity(source.id, 'DEFENSE', 1)).toBe(10);
  });
});

describe('dungeon panel API', () => {
  test('lists only current-era captives with per-row prices and capacity', async () => {
    const captor = await createPlayer('Panel captor');
    const source = await createPlayer('Panel source');
    const other = await createPlayer('Panel other');
    await prisma.users.update({
      where: { id: captor.id },
      data: { fort_level: DUNGEON_FORT },
    });
    const held = await seedCaptive({
      captorId: captor.id,
      sourceId: source.id,
      unitType: 'DEFENSE',
      unitLevel: 1,
      quantity: 10,
      capturedAt: new Date(Date.now() - 1 * HOUR_MS),
      eraId,
    });
    const heldHighTier = await seedCaptive({
      captorId: captor.id,
      sourceId: other.id,
      unitType: 'OFFENSE',
      unitLevel: 2,
      quantity: 5,
      capturedAt: new Date(Date.now() - 2 * HOUR_MS),
      eraId,
    });
    const stale = await seedCaptive({
      captorId: captor.id,
      sourceId: other.id,
      unitType: 'DEFENSE',
      unitLevel: 1,
      quantity: 99,
      capturedAt: new Date(Date.now() - 3 * HOUR_MS),
      eraId: eraId + 999,
    });
    const mine = await seedCaptive({
      captorId: other.id,
      sourceId: captor.id,
      unitType: 'SPY',
      unitLevel: 1,
      quantity: 4,
      capturedAt: new Date(Date.now() - 4 * HOUR_MS),
      eraId,
    });

    const res = await callRoute(dungeonHandler, {
      method: 'GET',
      userId: captor.id,
    });
    expect(res.statusCode).toBe(200);
    const body = res.body as {
      unlocked: boolean;
      capacity: number;
      requiredFortLevel: number;
      heldTotal: number;
      held: Array<{
        id: number;
        ransomPrice: string;
        ransomShare: string;
        convertCost: string | null;
      }>;
      mine: Array<{ id: number; convertCost: string | null }>;
    };

    expect(body.unlocked).toBe(true);
    expect(body.requiredFortLevel).toBe(DUNGEON_FORT);
    expect(body.capacity).toBe(DUNGEON_BASE_CAPACITY);
    expect(body.heldTotal).toBe(15);
    expect(body.held.map((row) => row.id).sort()).toEqual(
      [held.id, heldHighTier.id].sort(),
    );
    expect(body.held.map((row) => row.id)).not.toContain(stale.id);

    const guardRow = body.held.find((row) => row.id === held.id)!;
    expect(guardRow.ransomPrice).toBe(
      (ransomPricePerUnit('DEFENSE', 1) * 10n).toString(),
    );
    expect(guardRow.ransomShare).toBe('3000');
    expect(guardRow.convertCost).toBe('3750');

    const knightRow = body.held.find((row) => row.id === heldHighTier.id)!;
    expect(knightRow.ransomPrice).toBe('20000');
    expect(knightRow.convertCost).toBe('12500');

    // The source's own list carries no convert offer.
    expect(body.mine.map((row) => row.id)).toEqual([mine.id]);
    expect(body.mine[0].convertCost).toBeNull();
  });
});
