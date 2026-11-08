/* eslint-disable no-bitwise -- activity hour masks are bit sets */
import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();
const { resetRuntimeConfigCache } = require('../RuntimeConfig.service');
const {
  detectBotTiming,
  detectResourceFunnelling,
  runAbuseDetection,
} = require('../AbuseDetection.service');
const { DEFAULT_ABUSE_CONFIG } = require('@/constants/abuseSignals');

/** Every statement each transaction ran, in order, as plain SQL text. */
let transactions: string[][] = [];
let failOn: RegExp | null = null;
/** Canned rows for queries whose SQL matches; the first matching entry wins. */
let answers: Array<[RegExp, unknown[], (() => void)?]> = [];
let activityRows: unknown[] = [];
let onActivityRows: (() => void) | null = null;
let signalWrites = 0;

const sqlOf = (strings: TemplateStringsArray) => strings.join('?');

beforeEach(() => {
  resetRuntimeConfigCache();
  transactions = [];
  failOn = null;
  answers = [];
  activityRows = [];
  onActivityRows = null;
  signalWrites = 0;
  mockPrisma.serverSetting.findMany = vi.fn(async () => []);
  mockPrisma.$transaction = vi.fn(async (callback: (tx: any) => unknown) => {
    const log: string[] = [];
    transactions.push(log);
    const record = (strings: TemplateStringsArray, args: any[] = []) => {
      const sql = sqlOf(strings);
      log.push(
        `${sql} ${args.map((a) => String(a?.strings ?? a?.values ?? a)).join(' ')}`,
      );
      if (failOn?.test(sql))
        throw new Error('canceling statement due to statement timeout');
    };
    return callback({
      $executeRaw: vi.fn(
        async (strings: TemplateStringsArray, ...args: any[]) => {
          record(strings, args);
          return 0;
        },
      ),
      $queryRaw: vi.fn(
        async (strings: TemplateStringsArray, ...args: any[]) => {
          record(strings, args);
          const hit = answers.find(([pattern]) => pattern.test(sqlOf(strings)));
          hit?.[2]?.();
          return hit ? hit[1] : [];
        },
      ),
      cheatSignal: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => {
          signalWrites += 1;
          return {};
        }),
        update: vi.fn(async () => ({})),
      },
      activityDay: {
        findMany: vi.fn(async () => {
          log.push('activityDay.findMany');
          onActivityRows?.();
          return activityRows;
        }),
        deleteMany: vi.fn(async () => {
          log.push('activityDay.deleteMany');
          return { count: 0 };
        }),
      },
    });
  });
});

describe('abuse sweep deadlines', () => {
  it('runs every sweep query under a statement and lock deadline', async () => {
    const summary = await runAbuseDetection(new Date('2026-10-30T00:00:00Z'));
    expect(summary.skipped).toBe(false);
    expect(transactions.length).toBeGreaterThan(5);
    for (const log of transactions) {
      expect(log[0]).toContain('SET LOCAL statement_timeout');
      expect(log[1]).toContain('SET LOCAL lock_timeout');
    }
  });

  it('a detector whose query is cancelled fails open and the later detectors still run', async () => {
    failOn = /FROM "LoginEvent"/; // the shared-network sweep is cancelled
    const summary = await runAbuseDetection(new Date('2026-10-30T00:00:00Z'));
    expect(summary.network).toBe(0);
    const sqlRan = transactions.flat().join('\n');
    expect(sqlRan).toContain('FROM bank_history'); // funnelling and ping-pong
    expect(sqlRan).toContain('FROM attack_log'); // fresh-account farming
    expect(sqlRan).toContain('FROM "ActivityDay"'); // bot timing
  });

  it('even a cancelled bot-timing query leaves the other detectors and the run intact', async () => {
    failOn = /FROM "ActivityDay"/;
    await expect(
      runAbuseDetection(new Date('2026-10-30T00:00:00Z')),
    ).resolves.toMatchObject({ skipped: false, bot: 0 });
    expect(transactions.flat().join('\n')).toContain('FROM attack_log');
  });
});

describe('detector time budget covers every query and write', () => {
  const alwaysOn = (userId: number) =>
    [1, 2, 3].map((day) => ({
      userId,
      day: new Date(Date.UTC(2026, 9, 20 + day)),
      hourMask: (1 << 22) - 1,
      actions: 60,
      gapCount: 0,
      gapSum: 0,
      gapSumSq: 0,
    }));
  const switchable = (ms = 60_000) => {
    let spent = false;
    return {
      spend: () => {
        spent = true;
      },
      budget: {
        expired: () => spent,
        remainingMs: () => (spent ? 0 : ms),
      },
    };
  };

  it('bot timing writes no signal once the budget is spent mid-batch', async () => {
    const { spend, budget } = switchable();
    answers = [
      [/FROM "ActivityDay" a/, [{ userId: 1 }, { userId: 2 }, { userId: 3 }]],
    ];
    activityRows = [1, 2, 3].flatMap(alwaysOn);
    onActivityRows = spend; // the budget runs out right after the rows load
    await detectBotTiming(
      DEFAULT_ABUSE_CONFIG,
      new Date('2026-10-30T00:00:00Z'),
      budget,
    );
    expect(signalWrites).toBe(0);
  });

  it('bot timing with budget left still writes every qualifying player', async () => {
    const { budget } = switchable();
    answers = [
      [/FROM "ActivityDay" a/, [{ userId: 1 }, { userId: 2 }, { userId: 3 }]],
    ];
    activityRows = [1, 2, 3].flatMap(alwaysOn);
    await detectBotTiming(
      DEFAULT_ABUSE_CONFIG,
      new Date('2026-10-30T00:00:00Z'),
      budget,
    );
    expect(signalWrites).toBe(3);
  });

  it('funnel detection starts no later kind once the budget is spent', async () => {
    const { spend, budget } = switchable();
    answers = [[/FROM bank_history/, [], spend]]; // spent as the transfer query runs
    await detectResourceFunnelling(
      DEFAULT_ABUSE_CONFIG,
      new Date('2026-10-30T00:00:00Z'),
      budget,
    );
    const ran = transactions.flat().join('\n');
    expect(ran).toContain('FROM bank_history');
    expect(ran).not.toContain('FROM attack_log');
    expect(ran).not.toContain('FROM recruit_history');
    expect(ran).not.toContain('FROM alliance_bank_history');
  });

  it("caps each query's statement timeout to the time left", async () => {
    const budget = { expired: () => false, remainingMs: () => 250 };
    await detectBotTiming(
      DEFAULT_ABUSE_CONFIG,
      new Date('2026-10-30T00:00:00Z'),
      budget,
    );
    for (const log of transactions) {
      expect(log[0]).toContain('SET LOCAL statement_timeout = ? 250');
      expect(log[1]).toContain('SET LOCAL lock_timeout = ? 250');
    }
    expect(transactions.length).toBeGreaterThan(0);
  });
});
