import { beforeEach, describe, expect, test } from 'bun:test';

import prisma from '@/lib/prisma';
import { AttackService } from '@/services/AttackService';
import { createUser } from '@/services/User.service';

import { resetDatabase } from './db';

const DEFENDER_GOLD = 10_000_000n;

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

const goldOf = async (id: number) =>
  (
    await prisma.users.findUniqueOrThrow({
      where: { id },
      select: { gold: true },
    })
  ).gold;

let attackerA: number;
let attackerB: number;
let defender: number;

beforeEach(async () => {
  await resetDatabase();
  attackerA = (await createPlayer('Attacker A')).id;
  attackerB = (await createPlayer('Attacker B')).id;
  defender = (await createPlayer('Defender')).id;
  for (const id of [attackerA, attackerB]) await setUnits(id, 'OFFENSE', 1000);
  await setUnits(defender, 'DEFENSE', 20);
  await prisma.users.update({
    where: { id: defender },
    data: { gold: DEFENDER_GOLD },
  });
});

describe('concurrent attacks against a real database', () => {
  test('one attacker cannot spend the same turns twice', async () => {
    await prisma.users.update({
      where: { id: attackerA },
      data: { attack_turns: 12 },
    });

    const results = await Promise.all([
      AttackService.executeAttack(attackerA, defender, 10),
      AttackService.executeAttack(attackerA, defender, 10),
    ]);

    const succeeded = results.filter((r) => r.status === 'success');
    const refused = results.filter((r) => r.status === 'failed');
    expect(succeeded).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect(refused[0]).toMatchObject({ code: 'INSUFFICIENT_ATTACK_TURNS' });

    const attacker = await prisma.users.findUniqueOrThrow({
      where: { id: attackerA },
      select: { attack_turns: true },
    });
    expect(attacker.attack_turns).toBe(2);
    expect(await prisma.attack_log.count()).toBe(1);
  });

  test('two attackers on one defender pillage exactly what the defender loses', async () => {
    const before = {
      a: await goldOf(attackerA),
      b: await goldOf(attackerB),
      d: await goldOf(defender),
    };

    const results = await Promise.all([
      AttackService.executeAttack(attackerA, defender, 5),
      AttackService.executeAttack(attackerB, defender, 5),
    ]);
    for (const r of results) expect(r.status).toBe('success');

    const logs = await prisma.attack_log.findMany({
      select: { attacker_id: true, pillaged_gold: true },
    });
    expect(logs).toHaveLength(2);
    const pillagedBy = new Map(
      logs.map((l) => [l.attacker_id, l.pillaged_gold ?? 0n]),
    );
    const totalPillaged = [...pillagedBy.values()].reduce((s, g) => s + g, 0n);

    expect((await goldOf(attackerA)) - before.a).toBe(
      pillagedBy.get(attackerA)!,
    );
    expect((await goldOf(attackerB)) - before.b).toBe(
      pillagedBy.get(attackerB)!,
    );
    expect(before.d - (await goldOf(defender))).toBe(totalPillaged);
  });
});
