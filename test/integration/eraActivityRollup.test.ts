import { beforeEach, describe, expect, test } from 'bun:test';

import prisma from '@/lib/prisma';
import { rollUpExpiringActivity } from '@/services/EraActivity.service';
import { createUser } from '@/services/User.service';
import { getHistoricalEraStats } from '@/services/UserEraStats.service';

import { resetDatabase } from './db';

const ERA_START = new Date('2026-01-01T00:00:00Z');
const ERA_END = new Date('2026-03-01T00:00:00Z');
const OLD = new Date('2026-01-10T00:00:00Z');
const RECENT = new Date('2026-02-20T00:00:00Z');
const CUTOFF = new Date('2026-02-01T00:00:00Z');

const createPlayer = (name: string) =>
  createUser(
    `${name}@example.test`,
    'not-a-real-hash',
    name,
    'HUMAN',
    'FIGHTER',
  );

const expireLogs = () =>
  prisma.$transaction(async (tx) => {
    await rollUpExpiringActivity(tx, CUTOFF);
    await tx.attack_log.deleteMany({ where: { timestamp: { lt: CUTOFF } } });
    await tx.recruit_history.deleteMany({
      where: { timestamp: { lt: CUTOFF } },
    });
  });

describe('era totals outlive the logs they came from', () => {
  let attackerId: number;
  let defenderId: number;
  let eraId: number;

  const battle = (timestamp: Date, fields: Record<string, unknown> = {}) =>
    prisma.attack_log.create({
      data: {
        attacker_id: attackerId,
        defender_id: defenderId,
        winner: attackerId,
        timestamp,
        stats: {},
        attacker_losses_total: 3,
        defender_losses_total: 5,
        ...fields,
      },
    });

  beforeEach(async () => {
    await resetDatabase();
    ({ id: attackerId } = await createPlayer('Aldric'));
    ({ id: defenderId } = await createPlayer('Bryn'));
    ({ id: eraId } = await prisma.era.create({
      data: { name: 'Past era', startDate: ERA_START, endDate: ERA_END },
    }));
  });

  test('the leaderboard matches before and after the logs expire', async () => {
    await battle(OLD);
    await battle(RECENT);
    await prisma.recruit_history.create({
      data: {
        from_user: defenderId,
        to_user: attackerId,
        ip_addr: '',
        timestamp: OLD,
      },
    });
    const before = await getHistoricalEraStats(eraId);

    await expireLogs();

    expect(await prisma.attack_log.count()).toBe(1);
    const after = await getHistoricalEraStats(eraId);
    expect(after?.attacks).toEqual(before!.attacks);
    expect(after?.recruits).toEqual(before!.recruits);
    expect(after?.attackerCas).toEqual(before!.attackerCas);
    expect(after?.defenderCas).toEqual(before!.defenderCas);
    expect(after?.attackByCas).toEqual(before!.attackByCas);
    expect(after?.attacks[0]?.stat).toBe(2);
  });

  test('running again counts nothing twice', async () => {
    await battle(OLD);
    await expireLogs();
    await expireLogs();
    expect(
      await prisma.userEraActivity.findFirstOrThrow({
        where: { userId: attackerId },
      }),
    ).toMatchObject({ attacksWon: 1, attackerCasualties: 3n });
  });

  test('later logs add to the totals already stored', async () => {
    await battle(OLD);
    await expireLogs();
    await battle(new Date('2026-01-11T00:00:00Z'));
    await expireLogs();
    expect(
      await prisma.userEraActivity.findFirstOrThrow({
        where: { userId: attackerId },
      }),
    ).toMatchObject({ attacksWon: 2, attackerCasualties: 6n });
  });

  test('a failed run rolls back, so the logs are kept for the next one', async () => {
    await battle(OLD);
    await expect(
      prisma.$transaction(async (tx) => {
        await rollUpExpiringActivity(tx, CUTOFF);
        throw new Error('delete failed');
      }),
    ).rejects.toThrow('delete failed');
    expect(await prisma.userEraActivity.count()).toBe(0);
    expect(await prisma.attack_log.count()).toBe(1);
  });

  test('voided battles leave no trace in the totals', async () => {
    await battle(OLD, { voidedAt: new Date('2026-01-12T00:00:00Z') });
    await expireLogs();
    expect(await prisma.userEraActivity.count()).toBe(0);
  });
});
