import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();
// Dynamic imports deliberately install the Prisma test boundary before service evaluation.
const { rollUpExpiringActivity, tallyEraActivity } =
  await import('@/services/EraActivity.service');
const { mergeTopBattles } = await import('@/services/EraActivityTypes');
const { getHistoricalEraStats } =
  await import('@/services/UserEraStats.service');

const A = 1;
const B = 2;
const C = 3;
const FIRST_ERA = {
  id: 1,
  startDate: new Date('2026-01-01T00:00:00Z'),
  endDate: new Date('2026-03-01T00:00:00Z'),
};
const SECOND_ERA = {
  id: 2,
  startDate: new Date('2026-03-01T00:00:00Z'),
  endDate: null,
};
const IN_FIRST = new Date('2026-02-01T00:00:00Z');
const IN_SECOND = new Date('2026-04-01T00:00:00Z');

const battle = (fields: Record<string, unknown> = {}) => ({
  attacker_id: A,
  defender_id: B,
  winner: A,
  type: 'attack',
  timestamp: IN_FIRST,
  attacker_losses_total: 3,
  defender_losses_total: 5,
  stats: {},
  ...fields,
});

const totalsOf = (result: ReturnType<typeof tallyEraActivity>, id: number) =>
  result.totals.find(({ userId }) => userId === id);

describe('tallyEraActivity', () => {
  it('credits a won attack to both sides of the battle', () => {
    const result = tallyEraActivity([FIRST_ERA], [battle()], []);
    expect(totalsOf(result, A)).toMatchObject({
      eraId: 1,
      attacksWon: 1,
      defendsWon: 0,
      attackerCasualties: 3,
      defenderCasualties: 0,
    });
    expect(totalsOf(result, B)).toMatchObject({
      attacksWon: 0,
      defendsWon: 0,
      attackerCasualties: 0,
      defenderCasualties: 5,
    });
  });

  it('counts a held defense as a defend won', () => {
    const result = tallyEraActivity([FIRST_ERA], [battle({ winner: B })], []);
    expect(totalsOf(result, A)?.attacksWon).toBe(0);
    expect(totalsOf(result, B)?.defendsWon).toBe(1);
  });

  it('counts casualties, but no win, for other mission types', () => {
    const result = tallyEraActivity(
      [FIRST_ERA],
      [battle({ type: 'assassinate' })],
      [],
    );
    expect(totalsOf(result, A)).toMatchObject({
      attacksWon: 0,
      attackerCasualties: 3,
    });
  });

  it('reads legacy losses from the stats payload', () => {
    const result = tallyEraActivity(
      [FIRST_ERA],
      [
        battle({
          attacker_losses_total: null,
          stats: { attacker_losses: { total: 9 } },
        }),
      ],
      [],
    );
    expect(totalsOf(result, A)?.attackerCasualties).toBe(9);
  });

  it('files rows under the era they happened in', () => {
    const result = tallyEraActivity(
      [FIRST_ERA, SECOND_ERA],
      [battle(), battle({ timestamp: IN_SECOND })],
      [],
    );
    expect(
      result.totals
        .filter(({ userId }) => userId === A)
        .map(({ eraId }) => eraId)
        .sort(),
    ).toEqual([1, 2]);
  });

  it('skips rows from before any known era', () => {
    const result = tallyEraActivity(
      [SECOND_ERA],
      [battle()],
      [{ from_user: A, to_user: B, timestamp: IN_FIRST }],
    );
    expect(result.totals).toEqual([]);
    expect(result.battles.size).toBe(0);
  });

  it('counts recruits for the same player the leaderboard ranks, not self-recruits', () => {
    const result = tallyEraActivity(
      [FIRST_ERA],
      [],
      [
        { from_user: A, to_user: C, timestamp: IN_FIRST },
        { from_user: B, to_user: C, timestamp: IN_FIRST },
        { from_user: C, to_user: C, timestamp: IN_FIRST },
      ],
    );
    expect(result.totals).toHaveLength(1);
    expect(totalsOf(result, C)?.recruits).toBe(2);
  });

  it('keeps battles that cost casualties for the top battle list', () => {
    const result = tallyEraActivity(
      [FIRST_ERA],
      [
        battle(),
        battle({ attacker_losses_total: 0, defender_losses_total: 0 }),
      ],
      [],
    );
    expect(result.battles.get(1)).toEqual([
      { attackerId: A, defenderId: B, casualties: 8 },
    ]);
  });
});

describe('mergeTopBattles', () => {
  it('keeps the ten biggest across lists', () => {
    const list = (from: number, to: number) =>
      Array.from({ length: to - from + 1 }, (_, index) => ({
        attackerId: A,
        defenderId: B,
        casualties: from + index,
      }));
    const merged = mergeTopBattles(list(1, 8), list(9, 14));
    expect(merged.map(({ casualties }) => casualties)).toEqual([
      14, 13, 12, 11, 10, 9, 8, 7, 6, 5,
    ]);
  });
});

describe('rollUpExpiringActivity', () => {
  const makeTx = (attacks: unknown[], knownUsers = [A, B]) =>
    ({
      era: {
        findMany: vi.fn(async () => [{ ...FIRST_ERA, topBattles: [] }]),
        update: vi.fn(async () => ({})),
      },
      attack_log: { findMany: vi.fn(async () => attacks) },
      recruit_history: { findMany: vi.fn(async () => []) },
      users: {
        findMany: vi.fn(async () => knownUsers.map((id) => ({ id }))),
      },
      userEraActivity: { upsert: vi.fn(async () => ({})) },
    }) as any;

  const cutoff = new Date('2026-03-15T00:00:00Z');

  it('only reads logs past the cutoff, and leaves voided battles out', async () => {
    const tx = makeTx([]);
    await rollUpExpiringActivity(tx, cutoff);
    expect(tx.attack_log.findMany.mock.calls[0][0].where).toEqual({
      timestamp: { lt: cutoff },
      voidedAt: null,
    });
    expect(
      tx.recruit_history.findMany.mock.calls[0][0].where.timestamp,
    ).toEqual({ lt: cutoff });
  });

  it('adds to existing totals rather than replacing them', async () => {
    const tx = makeTx([battle()]);
    await rollUpExpiringActivity(tx, cutoff);
    const call = tx.userEraActivity.upsert.mock.calls.find(
      ([{ where }]: any) => where.userId_eraId.userId === A,
    )[0];
    expect(call.where.userId_eraId).toEqual({ userId: A, eraId: 1 });
    expect(call.create).toMatchObject({ attacksWon: 1 });
    expect(call.update).toMatchObject({
      attacksWon: { increment: 1 },
      attackerCasualties: { increment: 3n },
    });
  });

  it('skips a player whose account no longer exists', async () => {
    const tx = makeTx([battle()], [A]);
    await rollUpExpiringActivity(tx, cutoff);
    expect(tx.userEraActivity.upsert).toHaveBeenCalledTimes(1);
  });

  it('merges new battles into the stored top battles', async () => {
    const tx = makeTx([battle()]);
    tx.era.findMany = vi.fn(async () => [
      {
        ...FIRST_ERA,
        topBattles: [{ attackerId: B, defenderId: A, casualties: 100 }],
      },
    ]);
    await rollUpExpiringActivity(tx, cutoff);
    expect(tx.era.update.mock.calls[0][0]).toEqual({
      where: { id: 1 },
      data: {
        topBattles: [
          { attackerId: B, defenderId: A, casualties: 100 },
          { attackerId: A, defenderId: B, casualties: 8 },
        ],
      },
    });
  });
});

describe('getHistoricalEraStats', () => {
  beforeEach(() => {
    mockPrisma.era = {
      findUnique: vi.fn(async () => ({
        ...FIRST_ERA,
        name: 'Era 1',
        topBattles: [{ attackerId: B, defenderId: A, casualties: 100 }],
      })),
    } as any;
    mockPrisma.userEra = { findMany: vi.fn(async () => []) } as any;
    mockPrisma.userEraActivity = {
      findMany: vi.fn(async () => [
        {
          userId: A,
          attacksWon: 4,
          attackerCasualties: 10n,
          defenderCasualties: 0n,
          recruits: 2,
        },
        {
          userId: B,
          attacksWon: 0,
          attackerCasualties: 0n,
          defenderCasualties: 20n,
          recruits: 0,
        },
      ]),
    } as any;
    mockPrisma.attack_log = { findMany: vi.fn(async () => [battle()]) } as any;
    mockPrisma.recruit_history = {
      findMany: vi.fn(async () => [{ from_user: B, to_user: A }]),
    } as any;
    mockPrisma.users.findMany = vi.fn(async () => [
      { id: A, display_name: 'Alpha' },
      { id: B, display_name: 'Bravo' },
    ]);
  });

  it('adds the logs still on hand to the rolled-up totals', async () => {
    const stats = await getHistoricalEraStats(1);
    expect(stats?.attacks).toEqual([{ id: A, display_name: 'Alpha', stat: 5 }]);
    expect(stats?.recruits).toEqual([
      { id: A, display_name: 'Alpha', stat: 3 },
    ]);
    expect(stats?.attackerCas).toEqual([
      { id: A, display_name: 'Alpha', stat: 13 },
    ]);
    expect(stats?.defenderCas).toEqual([
      { id: B, display_name: 'Bravo', stat: 25 },
    ]);
  });

  it('ranks rolled-up battles with the ones still in the logs', async () => {
    const stats = await getHistoricalEraStats(1);
    expect(stats?.attackByCas).toEqual([
      { display_name: 'Bravo vs Alpha', stat: 100 },
      { display_name: 'Alpha vs Bravo', stat: 8 },
    ]);
  });

  it('still shows totals after every log has expired', async () => {
    mockPrisma.attack_log.findMany = vi.fn(async () => []);
    mockPrisma.recruit_history.findMany = vi.fn(async () => []);
    const stats = await getHistoricalEraStats(1);
    expect(stats?.attacks[0]?.stat).toBe(4);
    expect(stats?.attackByCas[0]?.stat).toBe(100);
  });
});
