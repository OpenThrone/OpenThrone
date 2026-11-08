/**
 * Abuse signals (#6): pure rules for the admin-only detection signals. Every
 * assessor takes measured numbers plus the runtime thresholds and returns
 * whether the pattern qualifies, a 0-100 score and the reasons. The database
 * side lives in AbuseDetection.service; nothing here blocks or penalises a
 * player, and every threshold is an admin setting (group "abuse").
 */
import type { SignalSeverity } from '@/lib/prisma-exports';

export const DAY_MS = 24 * 60 * 60 * 1000;
/** Gaps longer than this end a play session and are not timing samples. */
export const ACTIVITY_SESSION_GAP_SECONDS = 900;
/** ActivityDay rows are pruned after this many days. */
export const ACTIVITY_DAY_RETENTION_DAYS = 14;
/** Days of ActivityDay rows the bot-timing detector looks at. */
export const BOT_TIMING_LOOKBACK_DAYS = 7;
/** Postgres per-statement ceiling for the daily sweep's aggregate queries. */
export const ABUSE_SWEEP_STATEMENT_MS = 20_000;
/** Ceiling for write-time checks and signal writes (they run off the request path). */
export const ABUSE_WRITE_STATEMENT_MS = 3_000;
/** How long any abuse write may wait on a lock before it is dropped. */
export const ABUSE_LOCK_MS = 2_000;
/** Wall-clock budget of one detector in the daily sweep; it stops early past it. */
export const ABUSE_DETECTOR_BUDGET_MS = 5 * 60_000;
/** Background abuse checks in flight per kind; more are dropped (the sweep catches up). */
export const ABUSE_BACKGROUND_LIMIT = 8;
/** A dismissed signal is not re-raised for this long unless it escalates. */
export const DISMISSED_SUPPRESSION_DAYS = 30;
/** A re-raised dismissed signal must beat the dismissed score by this much. */
export const DISMISSED_ESCALATION_SCORE = 20;

export interface AbuseDetectionConfig {
  enabled: boolean;
  network: { minAccounts: number; windowDays: number };
  funnel: {
    windowDays: number;
    minSources: number;
    minSharePercent: number;
    minGold: number;
    minActionsPerSource: number;
  };
  pingPong: { minTransfersEachWay: number; minGoldEachWay: number };
  bot: {
    minHoursPerDay: number;
    minDays: number;
    minGapSamples: number;
    maxVariationPercent: number;
  };
  fresh: { accountAgeDays: number; windowDays: number; minAttacks: number };
}

/** Conservative defaults, identical to the settings registry fallbacks. */
export const DEFAULT_ABUSE_CONFIG: AbuseDetectionConfig = {
  enabled: true,
  network: { minAccounts: 3, windowDays: 14 },
  funnel: {
    windowDays: 7,
    minSources: 3,
    minSharePercent: 80,
    minGold: 2_000_000,
    minActionsPerSource: 5,
  },
  pingPong: { minTransfersEachWay: 3, minGoldEachWay: 500_000 },
  bot: {
    minHoursPerDay: 20,
    minDays: 3,
    minGapSamples: 500,
    maxVariationPercent: 10,
  },
  fresh: { accountAgeDays: 7, windowDays: 7, minAttacks: 5 },
};

/** Builds the typed config from resolved runtime setting values. */
export const buildAbuseConfig = (
  values: Record<string, unknown>,
): AbuseDetectionConfig => {
  const n = (key: string) => values[key] as number;
  return {
    enabled: values['abuse.enabled'] as boolean,
    network: {
      minAccounts: n('abuse.network.minAccounts'),
      windowDays: n('abuse.network.windowDays'),
    },
    funnel: {
      windowDays: n('abuse.funnel.windowDays'),
      minSources: n('abuse.funnel.minSources'),
      minSharePercent: n('abuse.funnel.minSharePercent'),
      minGold: n('abuse.funnel.minGold'),
      minActionsPerSource: n('abuse.funnel.minActionsPerSource'),
    },
    pingPong: {
      minTransfersEachWay: n('abuse.pingPong.minTransfersEachWay'),
      minGoldEachWay: n('abuse.pingPong.minGoldEachWay'),
    },
    bot: {
      minHoursPerDay: n('abuse.bot.minHoursPerDay'),
      minDays: n('abuse.bot.minDays'),
      minGapSamples: n('abuse.bot.minGapSamples'),
      maxVariationPercent: n('abuse.bot.maxVariationPercent'),
    },
    fresh: {
      accountAgeDays: n('abuse.fresh.accountAgeDays'),
      windowDays: n('abuse.fresh.windowDays'),
      minAttacks: n('abuse.fresh.minAttacks'),
    },
  };
};

export interface AbuseAssessment {
  triggered: boolean;
  score: number;
  reasons: string[];
}

const NOT_TRIGGERED: AbuseAssessment = {
  triggered: false,
  score: 0,
  reasons: [],
};

const clampScore = (score: number) =>
  Math.max(0, Math.min(100, Math.round(score)));

/** Score bands: LOW < 40, MEDIUM < 65, HIGH < 85, CRITICAL above. */
export const abuseSeverity = (score: number): SignalSeverity => {
  if (score >= 85) return 'CRITICAL';
  if (score >= 65) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  return 'LOW';
};

/**
 * Several accounts on one hashed IP or one IP+browser pattern. Shared homes,
 * schools and mobile carriers also do this, so the score stays in the LOW and
 * MEDIUM bands; it only reaches HIGH when another signal confirms it.
 */
export const assessSharedNetwork = (input: {
  via: 'ip' | 'device';
  accounts: number;
  minAccounts: number;
}): AbuseAssessment => {
  if (input.accounts < input.minAccounts) return NOT_TRIGGERED;
  const extra = input.accounts - input.minAccounts;
  const base = input.via === 'device' ? 30 : 15;
  return {
    triggered: true,
    score: clampScore(Math.min(60, base + extra * 8)),
    reasons: [
      input.via === 'device' ? 'shared-network-browser' : 'shared-network',
    ],
  };
};

export interface FunnelSource {
  userId: number;
  gold: number;
  count: number;
  /** Percent of this source's outflow (or attacks received) going to the sink. */
  sharePercent: number;
}

export type FunnelVia = 'transfer' | 'attack' | 'recruit' | 'alliance';

/**
 * N sources whose output mostly flows into one sink. Sources qualify by
 * share (ratio) and per-source action count; the group qualifies by source
 * count and total volume. Recruit links carry no gold, so the volume rule is
 * the source count times the per-source action floor instead.
 */
export const assessFunnel = (input: {
  via: FunnelVia;
  sources: FunnelSource[];
  config: AbuseDetectionConfig['funnel'];
  /** Source ids that share a login network or browser pattern with the sink. */
  sharedLoginSources?: number[];
}): AbuseAssessment & { qualifying: FunnelSource[]; totalGold: number } => {
  const { config } = input;
  const qualifying = input.sources.filter(
    (source) =>
      source.sharePercent >= config.minSharePercent &&
      source.count >= config.minActionsPerSource,
  );
  const totalGold = qualifying.reduce((sum, source) => sum + source.gold, 0);
  const goldRule = input.via === 'recruit' ? true : totalGold >= config.minGold;
  const sourceFloor = input.via === 'alliance' ? 1 : config.minSources;
  if (qualifying.length < sourceFloor || !goldRule)
    return { ...NOT_TRIGGERED, qualifying, totalGold };
  const reasons: string[] = ['funnel-ratio'];
  let score = 35 + (qualifying.length - sourceFloor) * 6;
  if (config.minGold > 0 && input.via !== 'recruit')
    score += Math.min(20, Math.floor(totalGold / config.minGold) * 4);
  if (input.via === 'alliance') score -= 10; // leaders may fund a champion
  const shared = (input.sharedLoginSources ?? []).filter((id) =>
    qualifying.some((source) => source.userId === id),
  );
  if (shared.length > 0) {
    reasons.push('shared-login-pattern');
    score += 25 + Math.min(10, shared.length * 3);
  }
  return {
    triggered: true,
    score: clampScore(score),
    reasons,
    qualifying,
    totalGold,
  };
};

/** Gold passed back and forth between exactly two accounts. */
export const assessPingPong = (input: {
  aToB: { count: number; gold: number };
  bToA: { count: number; gold: number };
  config: AbuseDetectionConfig['pingPong'];
  sharedLoginPattern?: boolean;
}): AbuseAssessment & { balance: number } => {
  const { aToB, bToA, config } = input;
  const larger = Math.max(aToB.gold, bToA.gold);
  const balance = larger > 0 ? Math.min(aToB.gold, bToA.gold) / larger : 0;
  const qualifies =
    aToB.count >= config.minTransfersEachWay &&
    bToA.count >= config.minTransfersEachWay &&
    aToB.gold >= config.minGoldEachWay &&
    bToA.gold >= config.minGoldEachWay &&
    balance >= 0.5;
  if (!qualifies) return { ...NOT_TRIGGERED, balance };
  const reasons = ['gold-ping-pong'];
  let score =
    40 +
    Math.min(
      15,
      (Math.min(aToB.count, bToA.count) - config.minTransfersEachWay) * 3,
    ) +
    (balance >= 0.9 ? 10 : 0);
  if (input.sharedLoginPattern) {
    reasons.push('shared-login-pattern');
    score += 25;
  }
  return { triggered: true, score: clampScore(score), reasons, balance };
};

export interface ActivityDayRow {
  hourMask: number;
  actions: number;
  gapCount: number;
  gapSum: number;
  gapSumSq: number;
}

export const countActiveHours = (hourMask: number): number => {
  let count = 0;
  for (let hour = 0; hour < 24; hour += 1)
    // eslint-disable-next-line no-bitwise -- hourMask is a 24-bit hour set
    if (hourMask & (1 << hour)) count += 1;
  return count;
};

/**
 * Bot-like timing over the lookback window. Two independent tells: activity
 * in at least `minHoursPerDay` distinct hours on `minDays` days, and an
 * action-interval spread (standard deviation over mean) at or below
 * `maxVariationPercent` across at least `minGapSamples` in-session
 * intervals. Either alone raises a signal; both together raise it higher.
 */
export const assessBotTiming = (
  rows: ActivityDayRow[],
  config: AbuseDetectionConfig['bot'],
): AbuseAssessment & {
  alwaysOnDays: number;
  gapSamples: number;
  meanGapSeconds: number;
  variationPercent: number | null;
} => {
  const alwaysOnDays = rows.filter(
    (row) => countActiveHours(row.hourMask) >= config.minHoursPerDay,
  ).length;
  const gapSamples = rows.reduce((sum, row) => sum + row.gapCount, 0);
  const gapSum = rows.reduce((sum, row) => sum + row.gapSum, 0);
  const gapSumSq = rows.reduce((sum, row) => sum + row.gapSumSq, 0);
  const meanGapSeconds = gapSamples > 0 ? gapSum / gapSamples : 0;
  let variationPercent: number | null = null;
  if (gapSamples > 0 && meanGapSeconds > 0) {
    const variance = Math.max(0, gapSumSq / gapSamples - meanGapSeconds ** 2);
    variationPercent = (Math.sqrt(variance) / meanGapSeconds) * 100;
  }
  const alwaysOn = alwaysOnDays >= config.minDays;
  const metronome =
    variationPercent !== null &&
    gapSamples >= config.minGapSamples &&
    variationPercent <= config.maxVariationPercent;
  const stats = { alwaysOnDays, gapSamples, meanGapSeconds, variationPercent };
  if (!alwaysOn && !metronome) return { ...NOT_TRIGGERED, ...stats };
  const reasons: string[] = [];
  let score = 0;
  if (alwaysOn) {
    reasons.push('always-on');
    score += 45 + Math.min(15, (alwaysOnDays - config.minDays) * 5);
  }
  if (metronome && variationPercent !== null) {
    reasons.push('regular-intervals');
    score +=
      45 +
      Math.round(
        (1 - variationPercent / Math.max(1, config.maxVariationPercent)) * 15,
      );
  }
  if (alwaysOn && metronome) score += 10;
  return { triggered: true, score: clampScore(score), reasons, ...stats };
};

/** One account repeatedly attacked and beaten by the same player while new. */
export const assessFreshAccountFarming = (input: {
  attacks: number;
  attackerWins: number;
  config: AbuseDetectionConfig['fresh'];
  sharedLoginPattern?: boolean;
}): AbuseAssessment => {
  const { attacks, attackerWins, config } = input;
  if (
    attacks < config.minAttacks ||
    attackerWins * 100 < attacks * 80 // one-sided: at least 80% attacker wins
  )
    return NOT_TRIGGERED;
  const reasons = ['fresh-account-attacks'];
  let score = 40 + Math.min(25, (attacks - config.minAttacks) * 4);
  if (input.sharedLoginPattern) {
    reasons.push('shared-login-pattern');
    score += 25;
  }
  return { triggered: true, score: clampScore(score), reasons };
};

/** Whether a dismissed or actioned signal should hold back a re-detection. */
export const isSuppressedByClosedSignal = (
  closed: { score: number; resolvedAt: Date | null } | null,
  newScore: number,
  now: Date,
): boolean => {
  if (!closed?.resolvedAt) return false;
  const ageMs = now.getTime() - closed.resolvedAt.getTime();
  if (ageMs > DISMISSED_SUPPRESSION_DAYS * DAY_MS) return false;
  return newScore < closed.score + DISMISSED_ESCALATION_SCORE;
};
