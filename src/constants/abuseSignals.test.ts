/* eslint-disable no-bitwise -- activity hour masks are bit sets */
import { describe, expect, it } from 'bun:test';

import {
  abuseSeverity,
  assessBotTiming,
  assessFreshAccountFarming,
  assessFunnel,
  assessPingPong,
  assessSharedNetwork,
  buildAbuseConfig,
  countActiveHours,
  DEFAULT_ABUSE_CONFIG,
  isSuppressedByClosedSignal,
} from '@/constants/abuseSignals';
import {
  RUNTIME_SETTING_KEYS,
  RUNTIME_SETTING_REGISTRY,
} from '@/constants/runtimeSettings';

const DAY_MS = 24 * 60 * 60 * 1000;
const config = DEFAULT_ABUSE_CONFIG;
const source = (userId: number, share = 100, gold = 1_000_000, count = 5) => ({
  userId,
  gold,
  count,
  sharePercent: share,
});

describe('abuse detection settings', () => {
  it('registry defaults build exactly the documented conservative config', () => {
    const values = Object.fromEntries(
      RUNTIME_SETTING_KEYS.map((key) => [
        key,
        RUNTIME_SETTING_REGISTRY[key].fallback,
      ]),
    );
    expect(buildAbuseConfig(values)).toEqual(DEFAULT_ABUSE_CONFIG);
  });

  it('keeps every abuse setting in the abuse group and out of public settings', () => {
    const abuseKeys = RUNTIME_SETTING_KEYS.filter((key) =>
      key.startsWith('abuse.'),
    );
    expect(abuseKeys).toHaveLength(17);
    for (const key of abuseKeys) {
      expect(RUNTIME_SETTING_REGISTRY[key].group).toBe('abuse');
      expect(RUNTIME_SETTING_REGISTRY[key].isPublic).toBe(false);
    }
  });

  it('rejects out-of-range thresholds', () => {
    const { schema } = RUNTIME_SETTING_REGISTRY['abuse.network.windowDays'];
    expect(schema.safeParse(30).success).toBe(true);
    expect(schema.safeParse(31).success).toBe(false);
    expect(schema.safeParse(0).success).toBe(false);
    expect(
      RUNTIME_SETTING_REGISTRY['abuse.funnel.minSharePercent'].schema.safeParse(
        49,
      ).success,
    ).toBe(false);
  });
});

describe('severity bands', () => {
  it('maps score to severity', () => {
    expect(abuseSeverity(10)).toBe('LOW');
    expect(abuseSeverity(40)).toBe('MEDIUM');
    expect(abuseSeverity(65)).toBe('HIGH');
    expect(abuseSeverity(90)).toBe('CRITICAL');
  });
});

describe('shared network', () => {
  it('triggers at the threshold and not below it', () => {
    expect(
      assessSharedNetwork({ via: 'ip', accounts: 3, minAccounts: 3 }).triggered,
    ).toBe(true);
    expect(
      assessSharedNetwork({ via: 'ip', accounts: 2, minAccounts: 3 }).triggered,
    ).toBe(false);
  });

  it('follows the configured minimum', () => {
    expect(
      assessSharedNetwork({ via: 'device', accounts: 3, minAccounts: 5 })
        .triggered,
    ).toBe(false);
    expect(
      assessSharedNetwork({ via: 'device', accounts: 5, minAccounts: 5 })
        .triggered,
    ).toBe(true);
  });

  it('never reaches HIGH on network overlap alone', () => {
    const big = assessSharedNetwork({
      via: 'device',
      accounts: 40,
      minAccounts: 3,
    });
    expect(abuseSeverity(big.score)).toBe('MEDIUM');
  });
});

describe('resource funnelling', () => {
  const sources = [source(2), source(3), source(4)];

  it('triggers when enough sources send most of their output to one sink', () => {
    const result = assessFunnel({
      via: 'transfer',
      sources,
      config: config.funnel,
    });
    expect(result.triggered).toBe(true);
    expect(result.qualifying).toHaveLength(3);
  });

  it('does not trigger when sources split their gold across many accounts', () => {
    const result = assessFunnel({
      via: 'transfer',
      sources: sources.map((s) => ({ ...s, sharePercent: 40 })),
      config: config.funnel,
    });
    expect(result.triggered).toBe(false);
  });

  it('does not trigger below the source count or gold volume', () => {
    expect(
      assessFunnel({
        via: 'transfer',
        sources: sources.slice(0, 2),
        config: config.funnel,
      }).triggered,
    ).toBe(false);
    expect(
      assessFunnel({
        via: 'transfer',
        sources: sources.map((s) => ({ ...s, gold: 10_000 })),
        config: config.funnel,
      }).triggered,
    ).toBe(false);
  });

  it('uses the configured thresholds', () => {
    const lax = {
      ...config.funnel,
      minSources: 2,
      minGold: 0,
      minSharePercent: 50,
    };
    expect(
      assessFunnel({
        via: 'transfer',
        sources: [source(2, 60, 10), source(3, 55, 10)],
        config: lax,
      }).triggered,
    ).toBe(true);
    expect(
      assessFunnel({
        via: 'transfer',
        sources: [source(2, 60, 10), source(3, 55, 10)],
        config: config.funnel,
      }).triggered,
    ).toBe(false);
  });

  it('weights shared login patterns and ignores sources that are not funnel members', () => {
    const plain = assessFunnel({
      via: 'transfer',
      sources,
      config: config.funnel,
    });
    const shared = assessFunnel({
      via: 'transfer',
      sources,
      config: config.funnel,
      sharedLoginSources: [2, 99],
    });
    expect(shared.score).toBeGreaterThan(plain.score);
    expect(shared.reasons).toContain('shared-login-pattern');
    const unrelated = assessFunnel({
      via: 'transfer',
      sources,
      config: config.funnel,
      sharedLoginSources: [99],
    });
    expect(unrelated.score).toBe(plain.score);
  });

  it('recruit funnels need no gold volume but still need the source count', () => {
    const clicks = [
      source(2, 90, 0, 6),
      source(3, 90, 0, 6),
      source(4, 90, 0, 6),
    ];
    expect(
      assessFunnel({ via: 'recruit', sources: clicks, config: config.funnel })
        .triggered,
    ).toBe(true);
    expect(
      assessFunnel({
        via: 'recruit',
        sources: clicks.slice(0, 2),
        config: config.funnel,
      }).triggered,
    ).toBe(false);
  });

  it('alliance payouts qualify with one officer but score lower than transfers', () => {
    const payout = assessFunnel({
      via: 'alliance',
      sources: [source(2, 95, 5_000_000, 6)],
      config: config.funnel,
    });
    expect(payout.triggered).toBe(true);
    expect(abuseSeverity(payout.score)).toBe('LOW');
  });
});

describe('gold ping-pong', () => {
  const side = (count: number, gold: number) => ({ count, gold });

  it('triggers on balanced two-way transfers over the thresholds', () => {
    const result = assessPingPong({
      aToB: side(4, 1_000_000),
      bToA: side(4, 900_000),
      config: config.pingPong,
    });
    expect(result.triggered).toBe(true);
    expect(result.balance).toBeCloseTo(0.9);
  });

  it('does not trigger for one-way gifts or lopsided exchanges', () => {
    expect(
      assessPingPong({
        aToB: side(10, 5_000_000),
        bToA: side(0, 0),
        config: config.pingPong,
      }).triggered,
    ).toBe(false);
    expect(
      assessPingPong({
        aToB: side(5, 5_000_000),
        bToA: side(3, 600_000),
        config: config.pingPong,
      }).triggered,
    ).toBe(false);
  });

  it('does not trigger below the configured transfer or gold floors', () => {
    expect(
      assessPingPong({
        aToB: side(2, 1_000_000),
        bToA: side(2, 1_000_000),
        config: config.pingPong,
      }).triggered,
    ).toBe(false);
    expect(
      assessPingPong({
        aToB: side(4, 100),
        bToA: side(4, 100),
        config: config.pingPong,
      }).triggered,
    ).toBe(false);
    expect(
      assessPingPong({
        aToB: side(2, 100),
        bToA: side(2, 100),
        config: { minTransfersEachWay: 2, minGoldEachWay: 0 },
      }).triggered,
    ).toBe(true);
  });
});

describe('bot timing', () => {
  const day = (hours: number, gaps: number[] = []) => ({
    hourMask: (1 << hours) - 1,
    actions: gaps.length + 1,
    gapCount: gaps.length,
    gapSum: gaps.reduce((a, b) => a + b, 0),
    gapSumSq: gaps.reduce((a, b) => a + b * b, 0),
  });
  const human = (n: number) =>
    Array.from({ length: n }, (_, i) => 2 + ((i * 37) % 90)); // 2..91 seconds
  const metronome = (n: number) => Array.from({ length: n }, () => 5);

  it('counts distinct active hours', () => {
    expect(countActiveHours(0)).toBe(0);
    expect(countActiveHours(0b1011)).toBe(3);
    expect(countActiveHours((1 << 24) - 1)).toBe(24);
  });

  it('flags activity in 20+ hours on enough days', () => {
    const result = assessBotTiming([day(22), day(21), day(24)], config.bot);
    expect(result.triggered).toBe(true);
    expect(result.reasons).toEqual(['always-on']);
  });

  it('does not flag a long human day or too few always-on days', () => {
    expect(
      assessBotTiming([day(14), day(16), day(15)], config.bot).triggered,
    ).toBe(false);
    expect(assessBotTiming([day(22), day(23)], config.bot).triggered).toBe(
      false,
    );
  });

  it('flags metronome-regular intervals over enough samples', () => {
    const result = assessBotTiming([day(8, metronome(600))], config.bot);
    expect(result.triggered).toBe(true);
    expect(result.reasons).toContain('regular-intervals');
    expect(result.variationPercent).toBeLessThan(1);
  });

  it('does not flag human-variance intervals or too few samples', () => {
    expect(assessBotTiming([day(8, human(600))], config.bot).triggered).toBe(
      false,
    );
    expect(
      assessBotTiming([day(8, metronome(100))], config.bot).triggered,
    ).toBe(false);
  });

  it('scores both tells higher than either alone and follows the thresholds', () => {
    const both = assessBotTiming(
      [day(22, metronome(300)), day(22, metronome(300)), day(22)],
      config.bot,
    );
    const one = assessBotTiming([day(22), day(22), day(22)], config.bot);
    expect(both.score).toBeGreaterThan(one.score);
    expect(
      assessBotTiming([day(8, human(600))], {
        ...config.bot,
        maxVariationPercent: 50,
        minGapSamples: 50,
      }).triggered,
    ).toBe(false);
    expect(
      assessBotTiming([day(16), day(16), day(16)], {
        ...config.bot,
        minHoursPerDay: 16,
      }).triggered,
    ).toBe(true);
  });
});

describe('fresh-account farming', () => {
  it('triggers on repeated one-sided attacks and not below the minimum', () => {
    expect(
      assessFreshAccountFarming({
        attacks: 5,
        attackerWins: 5,
        config: config.fresh,
      }).triggered,
    ).toBe(true);
    expect(
      assessFreshAccountFarming({
        attacks: 4,
        attackerWins: 4,
        config: config.fresh,
      }).triggered,
    ).toBe(false);
  });

  it('does not trigger when the new account fights back', () => {
    expect(
      assessFreshAccountFarming({
        attacks: 10,
        attackerWins: 5,
        config: config.fresh,
      }).triggered,
    ).toBe(false);
  });

  it('weights a shared login pattern and follows the configured minimum', () => {
    const base = assessFreshAccountFarming({
      attacks: 6,
      attackerWins: 6,
      config: config.fresh,
    });
    const shared = assessFreshAccountFarming({
      attacks: 6,
      attackerWins: 6,
      config: config.fresh,
      sharedLoginPattern: true,
    });
    expect(shared.score).toBeGreaterThan(base.score);
    expect(
      assessFreshAccountFarming({
        attacks: 3,
        attackerWins: 3,
        config: { ...config.fresh, minAttacks: 3 },
      }).triggered,
    ).toBe(true);
  });
});

describe('dismissed signal suppression', () => {
  const now = new Date('2026-10-30T00:00:00Z');
  const closed = (daysAgo: number, score = 50) => ({
    score,
    resolvedAt: new Date(now.getTime() - daysAgo * DAY_MS),
  });

  it('holds back a re-detection of the same level inside 30 days', () => {
    expect(isSuppressedByClosedSignal(closed(5), 50, now)).toBe(true);
  });

  it('lets a clearly escalated pattern or an old dismissal through', () => {
    expect(isSuppressedByClosedSignal(closed(5), 75, now)).toBe(false);
    expect(isSuppressedByClosedSignal(closed(31), 50, now)).toBe(false);
    expect(isSuppressedByClosedSignal(null, 50, now)).toBe(false);
  });
});
