import { afterAll, beforeEach, describe, expect, test, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

import { levelXPArray, UnitTypes } from '@/constants';
import type { UserUnit } from '@/lib/prisma-exports';
import BattleResult from '@/models/BattleResult';
import { BattleUser } from '@/models/BattleUser';
import type { BattleGameEvents } from '@/utils/battleGameEvents';
import type { CombatReplayEnvelope } from '@/utils/combatReplay';

installMockPrisma(vi);
// Dynamic imports deliberately install the Prisma test boundary before service loading.
const { invalidateGameEventModifiers } =
  await import('../GameEventRuntime.service');
const { AttackService } = await import('../AttackService');
const { SpyService, redactLiveSpyResult } = await import('../SpyService');
const { BattleService } = await import('../Battle.service');
const { updateUserUnits } = await import('../AttackDataService');
const { invalidateRuntimeConfigCache } =
  await import('../RuntimeConfig.service');
const { parseCombatReplay } = await import('@/utils/combatReplay');

// The only test double is the persistence boundary. Services and engines are real.
interface GameRow {
  gold: bigint;
  UserUnit: UserUnit[];
  [key: string]: unknown;
}
type UnitLoss = Pick<UserUnit, 'type' | 'level' | 'quantity' | 'isMercenary'>;
interface LogStats {
  gameEvents?: BattleGameEvents;
  replay?: CombatReplayEnvelope;
  spyResults?: { spiesLost: number; unitsKilled?: number };
  attacker_losses?: string;
  defender_losses?: string;
  wounded?: string;
  canonical_outcome?: unknown;
  forthpAtEnd?: number;
  endTurns?: number;
  turns?: number;
}
interface TestLog {
  id: number;
  stats: LogStats;
  winner?: number;
  attacker_losses_total?: number;
  defender_losses_total?: number;
  pillaged_gold: bigint;
}
interface LogCreateInput extends Omit<TestLog, 'id' | 'pillaged_gold'> {
  pillaged_gold?: bigint;
  attackerPlayer: { connect: { id: number } };
  defenderPlayer: { connect: { id: number } };
}
let players: Record<number, GameRow>;
let logs: TestLog[];
let transfers: Array<{ gold_amount: bigint }>;
let nextUnitId: number;
// alliance_id -> { name, member user ids }
let alliances: Record<number, { name: string; members: number[] }>;
const priorSecret = process.env.NEXTAUTH_SECRET;
const priorEnabled = process.env.NEXT_PUBLIC_ENABLE_ATTACKING;

function player(
  id: number,
  units: Array<Partial<UserUnit> & Pick<UserUnit, 'type'>>,
  gold = 1000000n,
): GameRow {
  return {
    id,
    display_name: `Combat-${id}`,
    race: 'HUMAN',
    class: 'FIGHTER',
    experience: levelXPArray.find((entry) => entry.level === 80)!.xp,
    fort_level: 16,
    fort_hitpoints: 0,
    house_level: 10,
    gold,
    attack_turns: 250,
    stamina: 100,
    defense_pressure_today: 0,
    defense_pressure_date: new Date(),
    spy_pressure_today: 0,
    spy_pressure_date: new Date(),
    wounded_units: [],
    stats: [],
    permissions: [],
    password_hash: 'private-account-hash',
    totp_secret: 'private-totp-secret',
    UserUnit: units.map((unit) => ({
      id: nextUnitId++,
      userId: id,
      level: 1,
      quantity: 0,
      isMercenary: false,
      ...unit,
    })),
    UserItem: [],
    UserBattleUpgrade: [],
    UserBonusPoints: [],
    UserStructureUpgrade: [
      { id: id * 10, userId: id, type: 'SPY', level: 16 },
      { id: id * 10 + 1, userId: id, type: 'SENTRY', level: 16 },
    ],
  };
}

beforeEach(() => {
  invalidateGameEventModifiers();
  mockPrisma.gameEvent = { findMany: vi.fn().mockResolvedValue([]) };
  process.env.NEXTAUTH_SECRET = 'isolated-combat-replay-test-secret';
  process.env.NEXT_PUBLIC_ENABLE_ATTACKING = 'true';
  mockPrisma.serverSetting = {
    findMany: vi
      .fn()
      .mockResolvedValue(
        [
          'ENABLE_ATTACKING',
          'ENABLE_INFILTRATIONS',
          'ENABLE_ASSASSINATIONS',
          'ENABLE_INTEL',
          'ENABLE_SOCIAL',
          'ENABLE_ENEMIES',
        ].map((key) => ({ key, value: true })),
      ),
  };
  invalidateRuntimeConfigCache();
  // A just-started era keeps level-protected fixtures inside the time window.
  mockPrisma.era.findFirst = vi.fn().mockResolvedValue({
    id: 1,
    name: 'Era 1',
    startDate: new Date(),
    endDate: null,
    startSettings: null,
  });
  logs = [];
  transfers = [];
  nextUnitId = 1;
  players = {
    1: player(
      1,
      [
        { type: 'OFFENSE', quantity: 5000 },
        { type: 'OFFENSE', quantity: 1000, isMercenary: true },
        { type: 'SPY', level: 1, quantity: 100 },
        { type: 'SPY', level: 2, quantity: 100 },
        { type: 'SPY', level: 3, quantity: 100 },
        { type: 'SPY', level: 3, quantity: 20, isMercenary: true },
      ],
      50000n,
    ),
    2: player(2, [
      { type: 'DEFENSE', quantity: 10 },
      { type: 'DEFENSE', quantity: 10, isMercenary: true },
      { type: 'WORKER', quantity: 1000 },
    ]),
  };
  mockPrisma.users.findUnique = vi.fn(
    async ({ where }: { where: { id: number } }) =>
      players[where.id] ? structuredClone(players[where.id]) : null,
  );
  mockPrisma.users.update = vi.fn(
    async ({
      where,
      data,
    }: {
      where: { id: number };
      data: Record<string, unknown>;
    }) => {
      // Honour Prisma atomic operators so relative writes are checked as deltas.
      const row = players[where.id] as Record<string, any>;
      for (const [key, value] of Object.entries(data)) {
        if (value && typeof value === 'object' && !(value instanceof Date)) {
          const op = value as {
            increment?: bigint | number;
            decrement?: bigint | number;
            set?: unknown;
          };
          if ('increment' in op)
            row[key] = (row[key] as any) + (op.increment as any);
          else if ('decrement' in op)
            row[key] = (row[key] as any) - (op.decrement as any);
          else if ('set' in op) row[key] = op.set;
          else row[key] = value;
        } else {
          row[key] = value;
        }
      }
      return structuredClone(players[where.id]);
    },
  );
  mockPrisma.attack_log.count = vi.fn(async () => 0);
  mockPrisma.attack_log.aggregate = vi.fn(async () => ({
    _sum: { defender_losses_total: 0, pillaged_gold: 0n },
  }));
  mockPrisma.attack_log.create = vi.fn(
    async ({ data }: { data: LogCreateInput }) => {
      const row = {
        ...structuredClone(data),
        id: logs.length + 1,
        attacker_id: data.attackerPlayer.connect.id,
        defender_id: data.defenderPlayer.connect.id,
        pillaged_gold: data.pillaged_gold ?? 0n,
      };
      logs.push(row);
      return row;
    },
  );
  mockPrisma.attack_log.findUnique = vi.fn(
    async ({ where }: { where: { id: number } }) =>
      structuredClone(logs.find((row) => row.id === where.id) ?? null),
  );
  mockPrisma.bank_history.create = vi.fn(
    async ({ data }: { data: { gold_amount: bigint } }) => {
      transfers.push(structuredClone(data));
      return { ...data, id: transfers.length };
    },
  );
  mockPrisma.userUnit = {
    upsert: vi.fn(
      async ({
        where,
        update,
        create,
      }: {
        where: {
          userId_type_level_isMercenary: Pick<
            UserUnit,
            'userId' | 'type' | 'level' | 'isMercenary'
          >;
        };
        update: { quantity: number };
        create: Omit<UserUnit, 'id'>;
      }) => {
        const key = where.userId_type_level_isMercenary;
        const roster = players[key.userId].UserUnit;
        const row = roster.find(
          (unit: UserUnit) =>
            unit.type === key.type &&
            unit.level === key.level &&
            unit.isMercenary === key.isMercenary,
        );
        if (row) Object.assign(row, update);
        else roster.push({ id: nextUnitId++, ...create });
        return row ?? roster[roster.length - 1];
      },
    ),
    findMany: vi.fn(async ({ where }: { where: { userId: number } }) =>
      structuredClone(players[where.userId].UserUnit),
    ),
    deleteMany: vi.fn(
      async ({ where }: { where: { id: { in: number[] } } }) => {
        for (const row of Object.values(players)) {
          row.UserUnit = row.UserUnit.filter(
            (unit: UserUnit) => !where.id.in.includes(unit.id),
          );
        }
      },
    ),
  };
  alliances = {};
  mockPrisma.alliance_memberships = {
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(
      async ({
        where,
      }: {
        where: {
          user_id: number;
          alliance: { members: { some: { user_id: number } } };
        };
      }) => {
        const otherId = where.alliance.members.some.user_id;
        const match = Object.entries(alliances)
          .map(([id, row]) => ({ id: Number(id), ...row }))
          .sort((a, b) => a.id - b.id)
          .find(
            (row) =>
              row.members.includes(where.user_id) &&
              row.members.includes(otherId),
          );
        return match ? { alliance: { id: match.id, name: match.name } } : null;
      },
    ),
  };
  // Row lock acquired by the attack/spy path; the mock boundary records it as a no-op.
  mockPrisma.$queryRaw = vi.fn(async () => []);
  mockPrisma.$transaction = vi.fn(
    async (callback: (tx: typeof mockPrisma) => Promise<unknown>) =>
      callback(mockPrisma),
  );
});

afterAll(() => {
  if (priorSecret === undefined) delete process.env.NEXTAUTH_SECRET;
  else process.env.NEXTAUTH_SECRET = priorSecret;
  if (priorEnabled === undefined)
    delete process.env.NEXT_PUBLIC_ENABLE_ATTACKING;
  else process.env.NEXT_PUBLIC_ENABLE_ATTACKING = priorEnabled;
});

function quantity(units: UserUnit[], target: UserUnit) {
  return units
    .filter(
      (unit) =>
        unit.type === target.type &&
        unit.level === target.level &&
        !!unit.isMercenary === !!target.isMercenary,
    )
    .reduce((sum, unit) => sum + unit.quantity, 0);
}

function expectCasualtyConservation(
  before: UserUnit[],
  after: UserUnit[],
  losses: UnitLoss[],
) {
  for (const unit of before) {
    expect(quantity(after, unit)).toBe(
      unit.quantity -
        losses
          .filter(
            (loss) =>
              loss.type === unit.type &&
              loss.level === unit.level &&
              !!loss.isMercenary === !!unit.isMercenary,
          )
          .reduce((sum, loss) => sum + loss.quantity, 0),
    );
  }
}

describe('live combat persistence and replay', () => {
  test('persists the active event names and exact XP multiplier with the battle', async () => {
    mockPrisma.gameEvent.findMany.mockResolvedValue([
      {
        id: 25,
        name: 'Double XP',
        description: null,
        startsAt: new Date('2026-01-01T00:00:00Z'),
        endsAt: null,
        eraId: null,
        config: { xpMultiplier: 2 },
      },
    ]);
    expect((await AttackService.executeAttack(1, 2, 10)).status).toBe(
      'success',
    );
    expect(logs[0].stats.gameEvents?.appliedXpMultiplier).toBe(2);
    expect(logs[0].stats.gameEvents?.events[0].name).toBe('Double XP');
    mockPrisma.gameEvent.findMany.mockResolvedValue([]);
    invalidateGameEventModifiers();
    expect(logs[0].stats.gameEvents?.events[0].effects.xpMultiplier).toBe(2);
    const shared = (
      await import('../AttackLogAccess.service')
    ).redactAttackLogForViewer(
      {
        id: logs[0].id,
        winner: 1,
        attacker_id: 1,
        defender_id: 2,
        stats: logs[0].stats,
      },
      'shared',
    );
    expect(shared.stats.gameEvents).toEqual(logs[0].stats.gameEvents);
  });

  test('queues an opted-in defender alert with the committed battle ID and outcome', async () => {
    const root = process.env.NEXT_PUBLIC_URL_ROOT;
    process.env.NEXT_PUBLIC_URL_ROOT = 'https://example.test';
    mockPrisma.emailPreference.findUnique.mockResolvedValue({
      attackNotificationEmails: true,
    });
    mockPrisma.emailOutbox.createMany = vi.fn().mockResolvedValue({ count: 1 });
    players[2].email = 'defender@example.test';
    players[2].locale = 'de-DE';
    try {
      const result = await AttackService.executeAttack(1, 2, 10);
      expect(result.status).toBe('success');
      const queued = mockPrisma.emailOutbox.createMany.mock.calls[0][0].data[0];
      expect(queued.eventKey).toBe(`battle-alert:${logs[0].id}:2`);
      expect(queued.textBody).toContain(`/battle/results/${logs[0].id}`);
      expect(queued.textBody).toContain(
        logs[0].winner === 1 ? 'Niederlage' : 'Sieg',
      );
      expect(queued.userId).toBe(2);
    } finally {
      mockPrisma.emailPreference.findUnique.mockResolvedValue(null);
      if (root === undefined) delete process.env.NEXT_PUBLIC_URL_ROOT;
      else process.env.NEXT_PUBLIC_URL_ROOT = root;
    }
  });

  test('transfers loot once, conserves casualties, and replays without current profiles', async () => {
    players[2].gold = 9007199254740993n;
    const before = structuredClone(players);
    const response = await AttackService.executeAttack(1, 2, 10);
    expect(response.status).toBe('success');
    const log = logs[0];
    const replay = parseCombatReplay(log.stats.replay);
    const loot = log.pillaged_gold;
    expect(loot).toBeGreaterThan(0n);
    expect(players[1].gold).toBe(before[1].gold + loot);
    expect(players[2].gold).toBe(before[2].gold - loot);
    expect(players[1].gold + players[2].gold).toBe(
      before[1].gold + before[2].gold,
    );
    expect(transfers.map((row) => row.gold_amount)).toEqual([loot]);
    expect(players[1].attack_turns).toBe(240);
    expect(players[1].stamina).toBe(90);
    expect(log.stats.endTurns).toBe(240);
    const attackerDeaths: { total: number; units: UnitLoss[] } = JSON.parse(
      log.stats.attacker_losses!,
    );
    const defenderDeaths: { total: number; units: UnitLoss[] } = JSON.parse(
      log.stats.defender_losses!,
    );
    const wounded: { attacker: UnitLoss[]; defender: UnitLoss[] } = JSON.parse(
      log.stats.wounded!,
    );
    expectCasualtyConservation(before[1].UserUnit, players[1].UserUnit, [
      ...attackerDeaths.units,
      ...wounded.attacker,
    ]);
    expectCasualtyConservation(before[2].UserUnit, players[2].UserUnit, [
      ...defenderDeaths.units,
      ...wounded.defender,
    ]);
    expect(log.defender_losses_total).toBe(
      defenderDeaths.total +
        wounded.defender.reduce((sum, loss) => sum + loss.quantity, 0),
    );
    expect(replay.encryptedSeed).toBeString();
    expect(replay).not.toHaveProperty('seed');
    expect(log.stats.replay).not.toHaveProperty('attacker');
    expect(log.stats.replay).not.toHaveProperty('defender');
    expect(JSON.stringify(log.stats.replay)).not.toContain(
      before[2].gold.toString(),
    );
    expect(JSON.stringify(log.stats)).not.toContain('private-account-hash');
    expect(JSON.stringify(log.stats)).not.toContain('private-totp-secret');
    expect(replay.attacker.gold).toBe(before[1].gold.toString());
    expect(replay.defender.gold).toBe(before[2].gold.toString());

    // Delete/mutate every current input. Retest must need only the immutable log.
    players = {};
    mockPrisma.users.findUnique.mockClear();
    const retest = await BattleService.retestBattle(log.id);
    expect(retest.exactReplay).toBe(true);
    expect(retest.newGold).toBe(loot.toString());
    expect(retest.attackerWon).toBe(log.winner === 1);
    expect(retest.fortHPAtEnd).toBe(log.stats.forthpAtEnd);
    expect(retest.newSimulationAttackerLossesBreakdown).toEqual(attackerDeaths);
    expect(retest.newSimulationDefenderLossesBreakdown).toEqual(defenderDeaths);
    expect(retest.wounded).toEqual(wounded);
    expect(retest.canonicalOutcome).toEqual(log.stats.canonical_outcome);
    expect(mockPrisma.users.findUnique).not.toHaveBeenCalled();
    expect(await BattleService.retestBattle(log.id)).toEqual(retest);
  });

  test('a protected attacker earns XP against an unprotected defender without forfeiting protection', async () => {
    players[1].UserUnit = player(1, [
      { type: 'OFFENSE', quantity: 200 },
    ]).UserUnit;
    players[1].experience = 0;
    // Remain in level range but exceed the defender's population protection limit.
    players[2].experience = 0;
    players[2].UserUnit.find((unit) => unit.type === 'WORKER')!.quantity =
      1000000;
    const era = { id: 1, startDate: new Date() };
    const settings = { durationDays: 14, recruitDailyCap: 25 };
    const protection = (id: number) => {
      const user = new BattleUser(players[id]);
      user.setProtectionContext(era, settings);
      return user.isProtected();
    };
    expect(protection(1)).toBe(true);
    expect(protection(2)).toBe(false);
    mockPrisma.users.update.mockClear();

    const result = await AttackService.executeAttack(1, 2, 1);
    expect(result.status).toBe('success');
    expect(logs).toHaveLength(1);
    expect(players[1].experience).toBeGreaterThan(0);
    expect(protection(1)).toBe(true);
    expect(
      mockPrisma.users.update.mock.calls.some(
        ([args]: [{ data: Record<string, unknown> }]) =>
          'protection_forfeited_era_id' in args.data,
      ),
    ).toBe(false);
  });

  test('attacking a fellow alliance member requires confirmation, then proceeds', async () => {
    alliances = {
      7: { name: 'Iron Pact', members: [1, 2] },
      8: { name: 'Lone Wolves', members: [1] },
    };

    const blocked = await AttackService.executeAttack(1, 2, 1);
    expect(blocked.status).toBe('failed');
    expect(blocked.code).toBe('ALLIANCE_MEMBER_CONFIRMATION_REQUIRED');
    expect(blocked.message).toContain('Iron Pact');
    expect(blocked.extra_variables).toEqual({
      allianceId: 7,
      allianceName: 'Iron Pact',
    });
    expect(logs).toHaveLength(0);
    expect(transfers).toHaveLength(0);

    const confirmed = await AttackService.executeAttack(1, 2, 1, {
      confirmAllianceAttack: true,
    });
    expect(confirmed.status).toBe('success');
    expect(logs).toHaveLength(1);
  });

  test('players in different alliances attack without an alliance prompt', async () => {
    alliances = {
      7: { name: 'Iron Pact', members: [1] },
      8: { name: 'Lone Wolves', members: [2] },
    };
    const result = await AttackService.executeAttack(1, 2, 1);
    expect(result.status).toBe('success');
    expect(result.code).toBeUndefined();
  });

  test('the alliance prompt never precedes another refusal', async () => {
    alliances = { 7: { name: 'Iron Pact', members: [1, 2] } };
    mockPrisma.attack_log.count = vi.fn(async () => 99);
    const result = await AttackService.executeAttack(1, 2, 1);
    expect(result.code).toBe('TOO_MANY_ATTACKS');
  });

  test('a protected attacker hitting a protected defender keeps protection', async () => {
    players[1].experience = 0;
    players[1].UserUnit = player(1, [
      { type: 'OFFENSE', quantity: 200 },
    ]).UserUnit;
    players[2].experience = 0;
    mockPrisma.users.update.mockClear();
    const result = await AttackService.executeAttack(1, 2, 1);
    expect(result.status).toBe('success');
    expect(
      mockPrisma.users.update.mock.calls.some(
        ([args]: [{ data: Record<string, unknown> }]) =>
          'protection_forfeited_era_id' in args.data,
      ),
    ).toBe(false);
  });

  test('daily gold and casualty exhaustion deny extraction from a protected defender without altering balances', async () => {
    players[1].experience = 0;
    players[2].experience = 0;
    mockPrisma.attack_log.aggregate.mockResolvedValue({
      _sum: { defender_losses_total: 100000, pillaged_gold: 1000000n },
    });
    const before = structuredClone(players);
    expect((await AttackService.executeAttack(1, 2, 10)).status).toBe(
      'success',
    );
    expect(logs[0].pillaged_gold).toBe(0n);
    expect(logs[0].defender_losses_total).toBe(0);
    expect(players[1].gold).toBe(before[1].gold);
    expect(players[2].gold).toBe(before[2].gold);
    expect(transfers).toEqual([]);
  });

  test('an unprotected defender has no daily gold ceiling, only the casualty budget', async () => {
    mockPrisma.attack_log.aggregate.mockResolvedValue({
      _sum: { defender_losses_total: 100000, pillaged_gold: 1000000n },
    });
    const before = structuredClone(players);
    expect((await AttackService.executeAttack(1, 2, 10)).status).toBe(
      'success',
    );
    expect(logs[0].pillaged_gold).toBeGreaterThan(0n);
    expect(logs[0].defender_losses_total).toBe(0);
    expect(players[2].gold).toBe(before[2].gold - logs[0].pillaged_gold);
  });

  for (const mission of ['INTEL', 'ASSASSINATE', 'INFILTRATE'] as const) {
    // Each iteration captures its own `mission` const; shared fixtures are reset per test.
    // eslint-disable-next-line no-loop-func
    test(`${mission} persists actual regular/mercenary losses and replays the original mission`, async () => {
      players[2].fort_hitpoints = 3000;
      const before = structuredClone(players);
      const response = await SpyService.executeSpyMission(
        1,
        2,
        mission === 'INFILTRATE' ? 5 : 10,
        mission,
        mission === 'ASSASSINATE' ? 'DEFENSE' : undefined,
        10,
      );
      expect(response.status).toBe('success');
      const log = logs[0];
      const result = log.stats.spyResults!;
      const tier = mission === 'INTEL' ? 1 : mission === 'INFILTRATE' ? 2 : 3;
      const beforeSpies = before[1].UserUnit.filter(
        (unit: UserUnit) => unit.type === 'SPY' && unit.level === tier,
      ).reduce((sum: number, unit: UserUnit) => sum + unit.quantity, 0);
      const afterSpies = players[1].UserUnit.filter(
        (unit: UserUnit) => unit.type === 'SPY' && unit.level === tier,
      ).reduce((sum: number, unit: UserUnit) => sum + unit.quantity, 0);
      expect(beforeSpies - afterSpies).toBe(result.spiesLost);
      expect(log.attacker_losses_total).toBe(result.spiesLost);
      const killed = before[2].UserUnit.reduce(
        (sum: number, unit: UserUnit) =>
          sum + unit.quantity - quantity(players[2].UserUnit, unit),
        0,
      );
      expect(killed).toBe(result.unitsKilled ?? 0);
      expect(log.defender_losses_total).toBe(killed);
      expect(players[1].attack_turns).toBe(
        250 - parseCombatReplay(log.stats.replay).turns,
      );
      expect(log.stats.replay).not.toHaveProperty('defender');
      expect(JSON.stringify(log.stats.replay)).not.toContain('"units"');
      expect(JSON.stringify(log.stats.replay)).not.toContain('"gold"');
      expect(JSON.stringify(log.stats.replay)).not.toContain('"goldInBank"');
      players = {};
      mockPrisma.users.findUnique.mockClear();
      const retest = await BattleService.retestBattle(log.id);
      expect(retest.exactReplay).toBe(true);
      expect(retest.result).toEqual(result);
      expect(mockPrisma.users.findUnique).not.toHaveBeenCalled();
    });
  }

  test('legacy logs are explicitly unavailable, not falsely exact', async () => {
    logs.push({ id: 90, stats: { turns: 10 }, pillaged_gold: 12n });
    const result = await BattleService.retestBattle(90);
    expect(result.exactReplay).toBe(false);
    expect(result.replayMode).toBe('UNAVAILABLE');
    expect(result).not.toHaveProperty('newGold');
  });

  test('unsupported replay versions fail rather than silently resample', async () => {
    expect((await AttackService.executeAttack(1, 2, 1)).status).toBe('success');
    logs[0].stats.replay!.formulaVersion = 'unsupported-formula';
    await expect(BattleService.retestBattle(logs[0].id)).rejects.toThrow();
  });

  test('locked stacks remain in persisted/replay rosters without joining the battle', async () => {
    const locked = UnitTypes.find(
      (unit) => unit.type === 'OFFENSE' && unit.fortLevel > 1,
    )!;
    players[1].fort_level = locked.fortLevel - 1;
    const reserve: UserUnit = {
      id: nextUnitId++,
      userId: 1,
      type: 'OFFENSE',
      level: locked.level,
      quantity: 50,
      isMercenary: false,
    };
    players[1].UserUnit.push(reserve);
    expect((await AttackService.executeAttack(1, 2, 10)).status).toBe(
      'success',
    );
    expect(quantity(players[1].UserUnit, reserve)).toBe(50);
    expect(
      quantity(parseCombatReplay(logs[0].stats.replay).attacker.units, reserve),
    ).toBe(50);
  });

  test('outcome actors exclude account secrets and retain independent unit snapshots', () => {
    const input = {
      id: 1,
      displayName: 'Visible name',
      gold: 12n,
      email: 'private-account@example.test',
      password_hash: 'private-account-hash',
      passwordHash: 'private-account-hash',
      totp_secret: 'private-totp-secret',
      units: structuredClone(players[1].UserUnit),
    };
    const result = new BattleResult(input, input);
    input.units[0].quantity = 0;
    expect(result.attacker.units[0].quantity).toBe(5000);
    expect(result.attacker.displayName).toBe('Visible name');
    expect(result.attacker.gold).toBe('12');
    const serialized = JSON.stringify(result, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value,
    );
    expect(serialized).not.toContain('private-account');
    expect(serialized).not.toContain('private-totp');
  });

  test('complete roster writes preserve regular/mercenary distinction and remove zero stacks', async () => {
    const original = structuredClone(players[2].UserUnit);
    const regular = original.find(
      (unit: UserUnit) => unit.type === 'DEFENSE' && !unit.isMercenary,
    );
    const mercenary = original.find(
      (unit: UserUnit) => unit.type === 'DEFENSE' && unit.isMercenary,
    );
    await updateUserUnits(
      2,
      [
        { ...regular, quantity: 0 },
        { ...mercenary, quantity: 3 },
      ],
      mockPrisma,
    );
    expect(
      players[2].UserUnit.map((unit: UserUnit) => ({
        type: unit.type,
        quantity: unit.quantity,
        isMercenary: unit.isMercenary,
      })),
    ).toEqual([{ type: 'DEFENSE', quantity: 3, isMercenary: true }]);
  });
});

describe('spy mission attacker view', () => {
  test('INTEL is capped per target per rolling 24h like the other missions', async () => {
    mockPrisma.attack_log.count = vi.fn(async () => 5);
    const result = await SpyService.executeSpyMission(1, 2, 10, 'INTEL');
    expect(result).toMatchObject({
      status: 'failed',
      code: 'SPY_TARGET_DAILY_LIMIT',
    });
    expect(logs).toHaveLength(0);
    expect(players[1].attack_turns).toBe(250);
  });

  test('failed missions hide odds; intel snapshots drop DB row ids', () => {
    const intel = {
      success: true,
      successProbability: 0.7,
      intelligenceGathered: {
        units: [{ id: 9, userId: 2, type: 'DEFENSE', level: 1, quantity: 3 }],
        mercenaries: [
          { id: 10, userId: 2, type: 'DEFENSE', level: 1, quantity: 1 },
        ],
        gold: '5',
      },
    };
    const won = redactLiveSpyResult(intel) as any;
    expect(won.successProbability).toBe(0.7);
    expect(won.intelligenceGathered.units).toEqual([
      { type: 'DEFENSE', level: 1, quantity: 3 },
    ]);
    expect(won.intelligenceGathered.mercenaries).toEqual([
      { type: 'DEFENSE', level: 1, quantity: 1 },
    ]);
    expect(won.intelligenceGathered.gold).toBe('5');
    const lost = redactLiveSpyResult({
      success: false,
      successProbability: 0.2,
      spiesLost: 3,
    }) as any;
    expect(lost).not.toHaveProperty('successProbability');
    expect(lost.spiesLost).toBe(3);
  });

  test('a failed live INTEL response never carries the odds', async () => {
    players[2].UserUnit.push({
      ...players[2].UserUnit[0],
      id: 9999,
      type: 'SENTRY',
      level: 1,
      quantity: 1000000,
      isMercenary: false,
    });
    const response = (await SpyService.executeSpyMission(
      1,
      2,
      10,
      'INTEL',
    )) as any;
    expect(response.status).toBe('success');
    if (response.result.success === false) {
      expect(response.result).not.toHaveProperty('successProbability');
      expect(response.extra_variables.spyResults).not.toHaveProperty(
        'successProbability',
      );
    }
    expect((logs[0].stats.spyResults as any).successProbability).toBeDefined();
  });
});

describe('self-target guards', () => {
  test('spy missions against yourself are rejected before any write', async () => {
    const result = await SpyService.executeSpyMission(1, 1, 10, 'INTEL');
    expect(result.status).toBe('failed');
    expect(result).toMatchObject({ code: 'SELF_TARGET_FORBIDDEN' });
    expect(logs).toHaveLength(0);
    expect(players[1].attack_turns).toBe(250);
    expect(players[1].gold).toBe(50000n);
  });

  test('attacks against yourself are rejected before any write', async () => {
    const result = await AttackService.executeAttack(1, 1, 10);
    expect(result).toMatchObject({
      status: 'failed',
      code: 'SELF_TARGET_FORBIDDEN',
    });
    expect(logs).toHaveLength(0);
    expect(players[1].attack_turns).toBe(250);
    expect(players[1].gold).toBe(50000n);
  });
});
