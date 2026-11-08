import { beforeEach, describe, expect, test } from 'bun:test';

import prisma from '@/lib/prisma';
import { AttackService } from '@/services/AttackService';
import { invalidateRuntimeConfigCache } from '@/services/RuntimeConfig.service';
import { createUser } from '@/services/User.service';

import { resetDatabase } from './db';

const ROUNDS = 6;
const TURNS_PER_ATTACK = 5;
const STARTING_TURNS = 60;
const STARTING_GOLD = 5_000_000n;

const createPlayer = async (name: string) =>
  createUser(
    `${name.toLowerCase().replace(/\s+/g, '-')}@example.test`,
    'not-a-real-hash',
    name,
    'HUMAN',
    'FIGHTER',
  );

const setUnits = async (
  userId: number,
  type: 'OFFENSE' | 'DEFENSE',
  quantity: number,
) => {
  await prisma.userUnit.upsert({
    where: {
      userId_type_level_isMercenary: {
        userId,
        type,
        level: 1,
        isMercenary: false,
      },
    },
    create: { userId, type, level: 1, quantity },
    update: { quantity },
  });
};

let playerA: number;
let playerB: number;

beforeEach(async () => {
  await resetDatabase();
  playerA = (await createPlayer('Opposing Alpha')).id;
  playerB = (await createPlayer('Opposing Beta')).id;
  for (const id of [playerA, playerB]) {
    await setUnits(id, 'OFFENSE', 1000);
    await setUnits(id, 'DEFENSE', 1000);
    await prisma.users.update({
      where: { id },
      data: { attack_turns: STARTING_TURNS, gold: STARTING_GOLD },
    });
  }
  // Both directions attack ROUNDS times; the default pair cap is 5.
  await prisma.serverSetting.upsert({
    where: { key: 'combat.pairDailyLimit' },
    create: {
      key: 'combat.pairDailyLimit',
      label: 'Pair attack daily limit',
      type: 'NUMBER',
      value: 100,
      isPublic: true,
    },
    update: { value: 100 },
  });
  invalidateRuntimeConfigCache();
});

interface AttackOutcome {
  ok: boolean;
  status?: string;
  code?: string;
  message?: string;
}

const attack = async (
  attackerId: number,
  defenderId: number,
): Promise<AttackOutcome> => {
  try {
    const result = await AttackService.executeAttack(
      attackerId,
      defenderId,
      TURNS_PER_ATTACK,
    );
    return {
      ok: true,
      status: result.status,
      code: (result as { code?: string }).code,
      message: (result as { message?: string }).message,
    };
  } catch (error) {
    // A rejected promise is what a player sees as a 500 (deadlocks,
    // serialization failures, driver timeouts). None of those may surface.
    return { ok: false, message: (error as Error).message };
  }
};

describe('opposing-order attacks: A attacks B while B attacks A (F-04)', () => {
  test('concurrent opposing attacks never deadlock or double-spend', async () => {
    const goldBefore = {
      a: STARTING_GOLD,
      b: STARTING_GOLD,
    };

    const outcomes: AttackOutcome[] = [];
    for (let round = 0; round < ROUNDS; round += 1) {
      // Fire both directions in the same tick so their row-lock orders oppose.
      const [ab, ba] = await Promise.all([
        attack(playerA, playerB),
        attack(playerB, playerA),
      ]);
      outcomes.push(ab, ba);
    }

    // 1) No rejection: every battle resolved as a normal result, never a 500.
    const rejected = outcomes.filter((o) => !o.ok);
    expect(rejected).toEqual([]);

    // 2) No transaction failure: a deadlock (40P01) or serialization/timeout
    //    error would surface as TRANSACTION_FAILED ("Transaction failed."),
    //    which is the 500-shaped outcome F-04 exists to prevent. Ordered row
    //    locking must eliminate it entirely; any other refusal must be a
    //    clean, retryable game rule with a code.
    for (const o of outcomes) {
      expect(o.code).not.toBe('TRANSACTION_FAILED');
      expect(o.code).not.toBe('ATTACK_EXECUTION_FAILED');
      if (o.status === 'failed') {
        expect(typeof o.code).toBe('string');
        expect(o.code).not.toBe('');
      }
    }

    const successes = outcomes.filter((o) => o.ok && o.status === 'success');

    // 3) Turn accounting: 5 turns per successful attack, no double-spend.
    const a = await prisma.users.findUniqueOrThrow({
      where: { id: playerA },
      select: { attack_turns: true, gold: true },
    });
    const b = await prisma.users.findUniqueOrThrow({
      where: { id: playerB },
      select: { attack_turns: true, gold: true },
    });
    const aWins = outcomes.filter(
      (o, i) => o.ok && o.status === 'success' && i % 2 === 0,
    ).length;
    const bWins = outcomes.filter(
      (o, i) => o.ok && o.status === 'success' && i % 2 === 1,
    ).length;
    // Battles must actually run in both directions, or every check below
    // would pass vacuously on all-refused missions.
    expect(aWins).toBeGreaterThan(0);
    expect(bWins).toBeGreaterThan(0);
    expect(a.attack_turns).toBe(STARTING_TURNS - aWins * TURNS_PER_ATTACK);
    expect(b.attack_turns).toBe(STARTING_TURNS - bWins * TURNS_PER_ATTACK);

    // 4) Gold conservation: pillage only moves gold between the two players.
    expect(a.gold + b.gold).toBe(goldBefore.a + goldBefore.b);

    // 5) Stored stats agree with the outcomes: one log per success, and the
    //    logged pillage per direction reconciles each player's gold delta.
    const logs = await prisma.attack_log.findMany({
      select: { attacker_id: true, pillaged_gold: true, winner: true },
      orderBy: { id: 'asc' },
    });
    expect(logs).toHaveLength(successes.length);
    const pillagedBy = (attacker: number) =>
      logs
        .filter((l) => l.attacker_id === attacker)
        .reduce((sum, l) => sum + (l.pillaged_gold ?? 0n), 0n);
    expect(a.gold - goldBefore.a).toBe(
      pillagedBy(playerA) - pillagedBy(playerB),
    );
    expect(b.gold - goldBefore.b).toBe(
      pillagedBy(playerB) - pillagedBy(playerA),
    );
    for (const log of logs) {
      expect([playerA, playerB]).toContain(log.winner);
    }
  });

  test('a burst of overlapping opposing attacks stays consistent', async () => {
    // Four missions in flight at once: 2x A->B against 2x B->A. Turns allow
    // only STARTING_TURNS/5 attacks per side, so extra missions must refuse
    // cleanly (INSUFFICIENT_ATTACK_TURNS) rather than deadlock or overspend.
    const outcomes = await Promise.all([
      attack(playerA, playerB),
      attack(playerA, playerB),
      attack(playerB, playerA),
      attack(playerB, playerA),
    ]);

    expect(outcomes.filter((o) => !o.ok)).toEqual([]);
    // Same rule as above: deadlocks/serialization failures are not acceptable.
    for (const o of outcomes) {
      expect(o.code).not.toBe('TRANSACTION_FAILED');
      expect(o.code).not.toBe('ATTACK_EXECUTION_FAILED');
      if (o.status === 'failed') expect(typeof o.code).toBe('string');
    }

    const a = await prisma.users.findUniqueOrThrow({
      where: { id: playerA },
      select: { attack_turns: true, gold: true },
    });
    const b = await prisma.users.findUniqueOrThrow({
      where: { id: playerB },
      select: { attack_turns: true, gold: true },
    });

    const logs = await prisma.attack_log.findMany({
      select: { attacker_id: true, pillaged_gold: true },
    });
    const aSuccesses = outcomes.filter(
      (o, i) => o.ok && o.status === 'success' && (i === 0 || i === 1),
    ).length;
    const bSuccesses = outcomes.filter(
      (o, i) => o.ok && o.status === 'success' && (i === 2 || i === 3),
    ).length;

    expect(aSuccesses).toBeGreaterThan(0);
    expect(bSuccesses).toBeGreaterThan(0);
    expect(a.attack_turns).toBe(STARTING_TURNS - aSuccesses * TURNS_PER_ATTACK);
    expect(b.attack_turns).toBe(STARTING_TURNS - bSuccesses * TURNS_PER_ATTACK);
    expect(logs).toHaveLength(aSuccesses + bSuccesses);
    expect(a.gold + b.gold).toBe(2n * STARTING_GOLD);
  });
});
