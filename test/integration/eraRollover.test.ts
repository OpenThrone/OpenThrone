import { beforeAll, describe, expect, test } from 'bun:test';

import prisma from '@/lib/prisma';
import {
  ensureActiveEra,
  StaleEraError,
  startNewEra,
} from '@/services/Era.service';
import { createUser } from '@/services/User.service';

import { resetDatabase } from './db';

// Enough players that the old 5 s default transaction timed out here.
const PLAYERS = 1500;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Era 1 with PLAYERS players who have progressed and fought. */
const seedEra = async (players = PLAYERS) => {
  await resetDatabase();
  const era = await ensureActiveEra();
  const eraStart = new Date(Date.now() - 10 * DAY_MS);
  await prisma.era.update({
    where: { id: era.id },
    data: { startDate: eraStart },
  });

  const ids: number[] = [];
  for (let i = 0; i < players; i += 1) {
    const user = await createUser(
      `player${i}@example.test`,
      'not-a-real-hash',
      `Player ${i}`,
      ['ELF', 'HUMAN', 'UNDEAD', 'GOBLIN'][i % 4],
      'FIGHTER',
    );
    ids.push(user.id);
  }

  // Progress: gold grows with id; everyone banked some and gained levels.
  await prisma.$executeRaw`
    UPDATE users SET gold = id * 1000, gold_in_bank = id * 10,
      experience = 50000, fort_level = 3
    WHERE id > 0`;

  // Player k beats player k+1, and players divisible by 3 also beat k+2.
  // One attack predates the era and must not count.
  const logs = [];
  for (let k = 0; k < ids.length - 2; k += 1) {
    const at = new Date(eraStart.getTime() + DAY_MS);
    logs.push({
      attacker_id: ids[k],
      defender_id: ids[k + 1],
      winner: ids[k],
      timestamp: at,
      stats: {},
    });
    if (k % 3 === 0) {
      logs.push({
        attacker_id: ids[k],
        defender_id: ids[k + 2],
        winner: ids[k + 2],
        timestamp: at,
        stats: {},
      });
    }
  }
  logs.push({
    attacker_id: ids[0],
    defender_id: ids[1],
    winner: ids[0],
    timestamp: new Date(eraStart.getTime() - DAY_MS),
    stats: {},
  });
  await prisma.attack_log.createMany({ data: logs });
  return { eraId: era.id, ids };
};

describe('startNewEra against a real database', () => {
  let seeded: Awaited<ReturnType<typeof seedEra>>;
  let elapsedMs = 0;

  beforeAll(async () => {
    seeded = await seedEra();
    const started = Date.now();
    await startNewEra();
    elapsedMs = Date.now() - started;
  });

  test('ends the old era and starts the next one', async () => {
    const eras = await prisma.era.findMany({ orderBy: { id: 'asc' } });
    expect(eras).toHaveLength(2);
    expect(eras[0].endDate).not.toBeNull();
    expect(eras[1]).toMatchObject({ name: 'Era 2', endDate: null });
    const stray = await prisma.users.count({
      where: { currentEraId: { not: eras[1].id } },
    });
    expect(stray).toBe(0);
    // eslint-disable-next-line no-console -- report rollover time for the PR record
    console.info(`rolled ${PLAYERS} players over in ${elapsedMs} ms`);
  });

  test('snapshots every player with their era results', async () => {
    const snapshots = await prisma.userEra.findMany({
      where: { eraId: seeded.eraId },
      orderBy: { userId: 'asc' },
    });
    expect(snapshots).toHaveLength(PLAYERS);

    const [first, second, third] = seeded.ids;
    const byUser = new Map(snapshots.map((s) => [s.userId, s]));
    // Player 0 beat player 1 (its pre-era win is excluded) and lost attacking 2.
    expect(byUser.get(first)?.achievements).toMatchObject({
      totalAttacksWon: 1,
      totalDefendsWon: 0,
    });
    // Player 1 beat player 2.
    expect(byUser.get(second)?.achievements).toMatchObject({
      totalAttacksWon: 1,
      totalDefendsWon: 0,
    });
    // Player 2 beat player 3 and held off player 0.
    expect(byUser.get(third)?.achievements).toMatchObject({
      totalAttacksWon: 1,
      totalDefendsWon: 1,
    });
    expect(byUser.get(first)?.goldAtEnd).toBe(BigInt(first * 1000));
    expect(byUser.get(first)?.fortLevelAtEnd).toBe(3);
  });

  test('resets every player to the era start and keeps lifetime totals', async () => {
    const players = await prisma.users.findMany({
      where: { id: { gt: 0 } },
      select: {
        gold: true,
        gold_in_bank: true,
        experience: true,
        fort_level: true,
        attack_turns: true,
        achievements: true,
        id: true,
      },
    });
    expect(players).toHaveLength(PLAYERS);
    for (const p of players) {
      expect(p.gold).toBe(25000n);
      expect(p.gold_in_bank).toBe(0n);
      expect(p.experience).toBe(0);
      expect(p.fort_level).toBe(1);
      expect(p.attack_turns).toBe(50);
    }
    const third = players.find((p) => p.id === seeded.ids[2]);
    expect(third?.achievements).toMatchObject({
      totalAttacksWon: 1,
      totalDefendsWon: 1,
    });
  });
});

describe('startNewEra with a battle in flight', () => {
  test('waits for the battle, snapshots its result, then resets the players', async () => {
    const { ids } = await seedEra(50);
    const [attacker, defender] = ids;

    // A battle holds both players' rows (as AttackService does) while it works.
    let releaseBattle!: () => void;
    const battleHolding = new Promise<void>((resolve) => {
      releaseBattle = resolve;
    });
    let battleLocked!: () => void;
    const locked = new Promise<void>((resolve) => {
      battleLocked = resolve;
    });
    const battle = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id IN (${attacker}, ${defender}) ORDER BY id FOR UPDATE`;
        battleLocked();
        await battleHolding;
        await tx.users.update({
          where: { id: attacker },
          data: { gold: { increment: 777 } },
        });
        await tx.users.update({
          where: { id: defender },
          data: { gold: { decrement: 777 } },
        });
      },
      { timeout: 30_000 },
    );

    await locked;
    const rollover = startNewEra();
    // The rollover must still be blocked on the battle's rows, or this test
    // would pass without exercising the lock.
    const state = await Promise.race([
      rollover.then(() => 'finished'),
      new Promise((resolve) => setTimeout(() => resolve('waiting'), 500)),
    ]);
    expect(state).toBe('waiting');
    const waiting = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE wait_event_type = 'Lock' AND query LIKE '%FOR UPDATE%'`;
    expect(waiting[0].n).toBeGreaterThan(0);
    releaseBattle();
    await battle;
    await rollover;

    const snapshots = await prisma.userEra.findMany({
      where: { userId: { in: [attacker, defender] } },
    });
    const goldAtEnd = new Map(snapshots.map((s) => [s.userId, s.goldAtEnd]));
    // The snapshot is taken after the battle committed.
    expect(goldAtEnd.get(attacker)).toBe(BigInt(attacker * 1000 + 777));
    expect(goldAtEnd.get(defender)).toBe(BigInt(defender * 1000 - 777));

    // And the battle's gold did not leak into the new era.
    const after = await prisma.users.findMany({
      where: { id: { in: [attacker, defender] } },
      select: { gold: true },
    });
    for (const p of after) expect(p.gold).toBe(25000n);
  });
});

describe('startNewEra repeated while a rollover runs', () => {
  test('a retried request for the same era is refused, not run twice', async () => {
    const { eraId } = await seedEra(50);

    const results = await Promise.allSettled([
      startNewEra(undefined, { expectedEraId: eraId }),
      startNewEra(undefined, { expectedEraId: eraId }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(StaleEraError);
    expect(await prisma.era.count()).toBe(2);
    expect(await prisma.userEra.count({ where: { eraId } })).toBe(50);
  });
});
