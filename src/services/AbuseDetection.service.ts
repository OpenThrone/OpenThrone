/**
 * Abuse signals (#6): admin-only detection of shared networks, resource
 * funnelling, bot-like timing and fresh-account farming. Each detector reads
 * bounded, indexed windows and files a CheatSignal through the shared store;
 * thresholds come from the "abuse" runtime settings. Nothing here bans,
 * blocks or tells a player: signals are for staff review only.
 */
import {
  ABUSE_BACKGROUND_LIMIT,
  ABUSE_DETECTOR_BUDGET_MS,
  ABUSE_LOCK_MS,
  ABUSE_SWEEP_STATEMENT_MS,
  ABUSE_WRITE_STATEMENT_MS,
  type AbuseDetectionConfig,
  ACTIVITY_DAY_RETENTION_DAYS,
  assessBotTiming,
  assessFreshAccountFarming,
  assessFunnel,
  assessPingPong,
  BOT_TIMING_LOOKBACK_DAYS,
  DAY_MS,
  type FunnelSource,
  type FunnelVia,
} from '@/constants/abuseSignals';
import { Prisma } from '@/lib/prisma-exports';
import { getAbuseConfigBounded } from '@/services/AbuseConfig.service';
import { raiseAbuseSignal } from '@/services/AbuseSignalStore.service';
import { CheatDetectionService } from '@/services/CheatDetection.service';
import {
  findLoginClusters,
  proxyLoginIpHashes,
  raiseLoginClusterSignal,
} from '@/services/LoginTelemetry.service';
import {
  type Budget,
  createBestEffortRunner,
  createBudget,
  runWithBudget,
  withDbDeadline,
} from '@/utils/boundedWork';
import { logError } from '@/utils/logger';

/** Rows read per edge query; a larger window is truncated, never unbounded. */
const EDGE_ROW_LIMIT = 5000;
/** Sinks evaluated per funnel kind in one run. */
const MAX_SINKS_PER_RUN = 200;
/** Sources recorded in a signal's evidence. */
const MAX_EVIDENCE_SOURCES = 20;
const MAX_PINGPONG_PAIRS_PER_RUN = 200;
/** Players loaded per bot-timing batch (complete player groups). */
const BOT_BATCH_PLAYERS = 500;
const MAX_FRESH_PAIRS_PER_RUN = 500;

export interface AbuseRunSummary {
  skipped: boolean;
  network: number;
  funnel: number;
  pingPong: number;
  bot: number;
  fresh: number;
  prunedActivityDays: number;
}

interface TransferEdge {
  source: number;
  sink: number;
  gold: number;
  count: number;
  share: number;
}

type Db = Prisma.TransactionClient;

/** One sweep query under the Postgres statement and lock deadline (fail-open upstream). */
const read = <T>(
  fn: (db: Db) => Promise<T>,
  statementMs = ABUSE_SWEEP_STATEMENT_MS,
): Promise<T> => withDbDeadline(fn, { statementMs, lockMs: ABUSE_LOCK_MS });

/** Whether two accounts share a login pattern, under the write deadline. */
const pairSharesLogin = (a: number, b: number, now: Date) =>
  read(
    (db) => CheatDetectionService.pairSharesLoginPattern(a, b, now, db),
    ABUSE_WRITE_STATEMENT_MS,
  );

const newBudget = (ms = ABUSE_DETECTOR_BUDGET_MS): Budget => createBudget(ms);

/** Write-time checks: bounded concurrency, dropped (not queued) when overloaded. */
const writeChecks = createBestEffortRunner(
  'Abuse write-time check',
  ABUSE_BACKGROUND_LIMIT,
);
/** Resolves once every write-time check started so far has settled (tests). */
export const settleAbuseChecks = () => writeChecks.idle();

const startOfWindow = (now: Date, days: number) =>
  new Date(now.getTime() - days * DAY_MS);

const humans = Prisma.sql`humans AS (SELECT id FROM users WHERE id > 0 AND "isBot" = false)`;

/** Friend-transfer gold flowing source -> sink, with each source's outflow share. */
async function loadTransferEdges(
  since: Date,
  now: Date,
  pair?: [number, number],
): Promise<TransferEdge[]> {
  const pairFilter = pair
    ? Prisma.sql`AND ((b.from_user_id = ${pair[0]} AND b.to_user_id = ${pair[1]}) OR (b.from_user_id = ${pair[1]} AND b.to_user_id = ${pair[0]}))`
    : Prisma.empty;
  const rows = await read(
    (db) => db.$queryRaw<
      Array<{
        source: number;
        sink: number;
        gold: string;
        n: number;
        share: number | null;
      }>
    >`WITH ${humans}, t AS (
      SELECT b.from_user_id AS source, b.to_user_id AS sink,
        SUM(b.gold_amount) AS gold, COUNT(*)::int AS n
      FROM bank_history b
      JOIN humans s ON s.id = b.from_user_id
      JOIN humans k ON k.id = b.to_user_id
      WHERE b.history_type = 'FRIEND_TRANSFER'
        AND b.date_time >= ${since} AND b.date_time <= ${now}
        AND COALESCE(b.stats->>'transferType', '') <> 'FRIEND_TRANSFER_TAX'
        AND b.gold_amount > 0 AND b.from_user_id <> b.to_user_id
        ${pairFilter}
      GROUP BY 1, 2
    )
    SELECT source, sink, gold::text AS gold, n,
      ROUND(100 * gold / NULLIF(SUM(gold) OVER (PARTITION BY source), 0))::int AS share
    FROM t ORDER BY gold DESC LIMIT ${EDGE_ROW_LIMIT}`,
    pair ? ABUSE_WRITE_STATEMENT_MS : undefined,
  );
  return rows.map((row) => ({
    source: Number(row.source),
    sink: Number(row.sink),
    gold: Number(row.gold),
    count: Number(row.n),
    share: Number(row.share ?? 0),
  }));
}

/** Victims that one attacker repeatedly beats without ever being hit back. */
async function loadAttackEdges(
  since: Date,
  now: Date,
  minAttacks: number,
): Promise<TransferEdge[]> {
  const rows = await read(
    (db) => db.$queryRaw<
      Array<{
        attacker: number;
        defender: number;
        n: number;
        gold: string;
        share: number | null;
      }>
    >`WITH ${humans}, p AS (
      SELECT a.attacker_id AS attacker, a.defender_id AS defender,
        COUNT(*)::int AS n,
        COUNT(*) FILTER (WHERE a.winner = a.attacker_id)::int AS wins,
        COALESCE(SUM(a.pillaged_gold), 0) AS gold
      FROM attack_log a
      JOIN humans h ON h.id = a.attacker_id
      JOIN humans d ON d.id = a.defender_id
      WHERE a.type = 'attack' AND a.timestamp >= ${since} AND a.timestamp <= ${now}
        AND a.attacker_id <> a.defender_id
      GROUP BY 1, 2
    ), r AS (
      SELECT p.*, ROUND(100.0 * p.n / SUM(p.n) OVER (PARTITION BY p.defender))::int AS share
      FROM p
    )
    SELECT attacker, defender, n, gold::text AS gold, share FROM r
    WHERE n >= ${minAttacks} AND wins * 10 >= n * 9
      AND NOT EXISTS (SELECT 1 FROM p x WHERE x.attacker = r.defender AND x.defender = r.attacker)
    ORDER BY n DESC LIMIT ${EDGE_ROW_LIMIT}`,
  );
  return rows.map((row) => ({
    source: Number(row.defender),
    sink: Number(row.attacker),
    gold: Number(row.gold),
    count: Number(row.n),
    share: Number(row.share ?? 0),
  }));
}

/**
 * Internal recruit-link clicks. `recruit_history` stores the link owner (the
 * recruited target) in `from_user` and the signed-in recruiter in `to_user`,
 * and the reward goes to the recruiter (handleRecruitment, Recruitment
 * service). So the receiving account (sink) is the recruiter and each source
 * is a link owner whose clicks come mostly from that one recruiter; the share
 * is the recruiter's part of the clicks that owner received. External link
 * visits are deliberately left out: they have no source account (`from_user`
 * is null) and are already capped per owner and per IP per day.
 */
async function loadRecruitEdges(
  since: Date,
  now: Date,
  minClicks: number,
): Promise<TransferEdge[]> {
  const rows = await read(
    (db) => db.$queryRaw<
      Array<{
        recruiter: number;
        owner: number;
        n: number;
        share: number | null;
      }>
    >`WITH ${humans}, c AS (
      SELECT r.to_user AS recruiter, r.from_user AS owner, COUNT(*)::int AS n
      FROM recruit_history r
      JOIN humans a ON a.id = r.to_user
      JOIN humans o ON o.id = r.from_user
      WHERE r.source = 'INTERNAL' AND r.timestamp >= ${since} AND r.timestamp <= ${now}
        AND r.from_user IS NOT NULL AND r.from_user <> r.to_user
      GROUP BY 1, 2
    ), s AS (
      SELECT c.*, ROUND(100.0 * c.n / SUM(c.n) OVER (PARTITION BY c.owner))::int AS share
      FROM c
    )
    SELECT recruiter, owner, n, share FROM s WHERE n >= ${minClicks}
    ORDER BY n DESC LIMIT ${EDGE_ROW_LIMIT}`,
  );
  return rows.map((row) => ({
    source: Number(row.owner),
    sink: Number(row.recruiter),
    gold: 0,
    count: Number(row.n),
    share: Number(row.share ?? 0),
  }));
}

/** Alliance treasury payouts: the officer who paid out (source) funds the beneficiary. */
async function loadAlliancePayoutEdges(
  since: Date,
  now: Date,
): Promise<TransferEdge[]> {
  const rows = await read(
    (db) => db.$queryRaw<
      Array<{
        performer: number;
        beneficiary: number;
        n: number;
        gold: string;
        share: number | null;
      }>
    >`WITH ${humans}, w AS (
      SELECT b.performed_by_user_id AS performer,
        COALESCE(b.related_user_id, b.performed_by_user_id) AS beneficiary,
        COUNT(*)::int AS n, SUM(b.amount) AS gold
      FROM alliance_bank_history b
      JOIN humans p ON p.id = b.performed_by_user_id
      JOIN humans r ON r.id = COALESCE(b.related_user_id, b.performed_by_user_id)
      WHERE b.created_at >= ${since} AND b.created_at <= ${now}
        AND b.transaction_type::text IN ('WITHDRAWAL', 'LOAN') AND b.amount > 0
      GROUP BY 1, 2
    )
    SELECT performer, beneficiary, n, gold::text AS gold,
      ROUND(100 * gold / NULLIF(SUM(gold) OVER (PARTITION BY performer), 0))::int AS share
    FROM w WHERE performer <> beneficiary
    ORDER BY gold DESC LIMIT ${EDGE_ROW_LIMIT}`,
  );
  return rows.map((row) => ({
    source: Number(row.performer),
    sink: Number(row.beneficiary),
    gold: Number(row.gold),
    count: Number(row.n),
    share: Number(row.share ?? 0),
  }));
}

/** Which of `sourceIds` logged in from the same network or browser as `sinkId`. */
async function loginPeersOfSink(
  sinkId: number,
  sourceIds: number[],
  since: Date,
): Promise<number[]> {
  if (sourceIds.length === 0) return [];
  const proxies = [...proxyLoginIpHashes()];
  const rows = await read(
    (db) => db.$queryRaw<Array<{ user_id: number }>>`
    SELECT DISTINCT b."userId" AS user_id
    FROM "LoginEvent" a
    JOIN "LoginEvent" b
      ON (a."ipHash" = b."ipHash"
          OR (a."deviceHash" IS NOT NULL AND a."deviceHash" = b."deviceHash"))
    WHERE a."userId" = ${sinkId} AND b."userId" = ANY(${sourceIds}::int[])
      AND a."occurredAt" >= ${since} AND b."occurredAt" >= ${since}
      AND NOT (a."ipHash" = ANY(${proxies}::text[]))`,
  );
  return rows.map((row) => Number(row.user_id));
}

const groupBySink = (edges: TransferEdge[]) => {
  const bySink = new Map<number, TransferEdge[]>();
  for (const edge of edges) {
    const list = bySink.get(edge.sink) ?? [];
    list.push(edge);
    bySink.set(edge.sink, list);
  }
  return bySink;
};

/** Plain-English summary stem per funnel kind, with the source-side share spelled out. */
const funnelSummary = (
  via: FunnelVia,
  sources: number,
  percent: number,
  windowDays: number,
  totalGold: number,
): string => {
  const gold = `${totalGold.toLocaleString('en-US')} gold`;
  switch (via) {
    case 'attack':
      return `${sources} accounts were each attacked repeatedly, with at least ${percent}% of the attacks on each coming from this account, in the last ${windowDays} days (${gold} pillaged).`;
    case 'recruit':
      return `${sources} accounts' recruit links were used repeatedly, with at least ${percent}% of the clicks on each coming from this account, in the last ${windowDays} days.`;
    case 'alliance':
      return `${sources} officers paid out at least ${percent}% of their alliance treasury withdrawals and loans to this account in the last ${windowDays} days (${gold}).`;
    default:
      return `${sources} accounts sent at least ${percent}% of their gold transfers to this account in the last ${windowDays} days (${gold}).`;
  }
};

async function raiseFunnelSignals(
  via: FunnelVia,
  edges: TransferEdge[],
  config: AbuseDetectionConfig,
  now: Date,
  budget: Budget,
): Promise<number> {
  let raised = 0;
  const loginSince = startOfWindow(now, config.network.windowDays);
  let sinks = 0;
  for (const [sinkId, sinkEdges] of groupBySink(edges)) {
    if (budget.expired()) {
      logError('Abuse funnel detector hit its time budget', { via });
      break;
    }
    const sources: FunnelSource[] = sinkEdges.map((edge) => ({
      userId: edge.source,
      gold: edge.gold,
      count: edge.count,
      sharePercent: edge.share,
    }));
    const preliminary = assessFunnel({ via, sources, config: config.funnel });
    if (!preliminary.triggered) continue;
    sinks += 1;
    if (sinks > MAX_SINKS_PER_RUN) break;
    const sharedLoginSources = await loginPeersOfSink(
      sinkId,
      preliminary.qualifying.map((source) => source.userId),
      loginSince,
    );
    const assessment = assessFunnel({
      via,
      sources,
      config: config.funnel,
      sharedLoginSources,
    });
    const qualifying = assessment.qualifying.slice(0, MAX_EVIDENCE_SOURCES);
    const result = await raiseAbuseSignal({
      type: 'RESOURCE_FUNNELLING',
      userId: sinkId,
      linkedUserIds: qualifying.map((source) => source.userId),
      dedupeKey: `funnel:${via}:${sinkId}`,
      score: assessment.score,
      summary:
        funnelSummary(
          via,
          assessment.qualifying.length,
          config.funnel.minSharePercent,
          config.funnel.windowDays,
          assessment.totalGold,
        ) +
        (sharedLoginSources.length > 0
          ? ' Some of them share a login network or browser pattern.'
          : ''),
      evidence: {
        kind: 'resource-funnel',
        via,
        sinkUserId: sinkId,
        windowDays: config.funnel.windowDays,
        sourceCount: assessment.qualifying.length,
        totalGold: assessment.totalGold,
        sources: qualifying.map((source) => ({
          userId: source.userId,
          gold: source.gold,
          count: source.count,
          sharePercent: source.sharePercent,
        })),
        sharedLoginSources,
        reasons: assessment.reasons,
        thresholds: config.funnel,
      },
      now,
    });
    if (result !== 'suppressed') raised += 1;
  }
  return raised;
}

async function raisePingPongSignal(
  first: number,
  second: number,
  firstToSecond: TransferEdge,
  secondToFirst: TransferEdge,
  config: AbuseDetectionConfig,
  now: Date,
): Promise<boolean> {
  // Normalise to lower id first so the daily sweep and the write-time check
  // describe (and dedupe) the pair identically.
  const swap = first > second;
  const [a, b] = swap ? [second, first] : [first, second];
  const aToB = swap ? secondToFirst : firstToSecond;
  const bToA = swap ? firstToSecond : secondToFirst;
  const preliminary = assessPingPong({
    aToB,
    bToA,
    config: config.pingPong,
  });
  if (!preliminary.triggered) return false;
  const sharedLoginPattern = await pairSharesLogin(a, b, now);
  const assessment = assessPingPong({
    aToB,
    bToA,
    config: config.pingPong,
    sharedLoginPattern,
  });
  const result = await raiseAbuseSignal({
    type: 'RESOURCE_FUNNELLING',
    userId: Math.min(a, b),
    relatedUserId: Math.max(a, b),
    linkedUserIds: [Math.max(a, b)],
    dedupeKey: `pingpong:${Math.min(a, b)}:${Math.max(a, b)}`,
    score: assessment.score,
    summary:
      `Gold passed back and forth between two accounts: ${aToB.count} ` +
      `transfers (${aToB.gold.toLocaleString('en-US')} gold) one way and ${bToA.count} ` +
      `(${bToA.gold.toLocaleString('en-US')} gold) the other in the last ${config.funnel.windowDays} days.${
        sharedLoginPattern
          ? ' The pair also shares a login network or browser pattern.'
          : ''
      }`,
    evidence: {
      kind: 'gold-ping-pong',
      via: 'transfer',
      windowDays: config.funnel.windowDays,
      forward: {
        fromUserId: a,
        toUserId: b,
        gold: aToB.gold,
        count: aToB.count,
      },
      backward: {
        fromUserId: b,
        toUserId: a,
        gold: bToA.gold,
        count: bToA.count,
      },
      balance: Math.round(assessment.balance * 100) / 100,
      ...(sharedLoginPattern ? { sharedLoginPattern: true } : {}),
      reasons: assessment.reasons,
      thresholds: config.pingPong,
    },
    now,
  });
  return result !== 'suppressed';
}

/** Gold passed back and forth between two accounts (daily sweep). */
async function goldPingPong(
  config: AbuseDetectionConfig,
  now: Date,
  budget: Budget = newBudget(),
): Promise<number> {
  const edges = await loadTransferEdges(
    startOfWindow(now, config.funnel.windowDays),
    now,
  );
  const byKey = new Map(edges.map((e) => [`${e.source}:${e.sink}`, e]));
  let raised = 0;
  let pairs = 0;
  for (const edge of edges) {
    if (edge.source > edge.sink) continue;
    if (budget.expired()) break;
    const back = byKey.get(`${edge.sink}:${edge.source}`);
    if (!back) continue;
    pairs += 1;
    if (pairs > MAX_PINGPONG_PAIRS_PER_RUN) break;
    if (
      await raisePingPongSignal(edge.source, edge.sink, edge, back, config, now)
    )
      raised += 1;
  }
  return raised;
}

/**
 * Write-time ping-pong check right after a friend transfer: one indexed
 * lookup of the pair's two directions. Best effort; a failure is logged and
 * never touches the transfer.
 */
export function evaluateTransferPair(
  fromUserId: number,
  toUserId: number,
  now: Date = new Date(),
): Promise<boolean> {
  return writeChecks.run(async () => {
    const config = await getAbuseConfigBounded();
    if (!config?.enabled) return;
    const edges = await loadTransferEdges(
      startOfWindow(now, config.funnel.windowDays),
      now,
      [fromUserId, toUserId],
    );
    const forward = edges.find(
      (e) => e.source === fromUserId && e.sink === toUserId,
    );
    const backward = edges.find(
      (e) => e.source === toUserId && e.sink === fromUserId,
    );
    if (forward && backward)
      await raisePingPongSignal(
        fromUserId,
        toUserId,
        forward,
        backward,
        config,
        now,
      );
  });
}

/** N accounts feeding one: transfers, one-sided attacks, recruit links, treasury. */
async function resourceFunnelling(
  config: AbuseDetectionConfig,
  now: Date,
  budget: Budget = newBudget(),
): Promise<number> {
  const since = startOfWindow(now, config.funnel.windowDays);
  const minActions = config.funnel.minActionsPerSource;
  let raised = 0;
  const kinds: Array<[FunnelVia, () => Promise<TransferEdge[]>]> = [
    ['transfer', () => loadTransferEdges(since, now)],
    ['attack', () => loadAttackEdges(since, now, minActions)],
    ['recruit', () => loadRecruitEdges(since, now, minActions)],
    ['alliance', () => loadAlliancePayoutEdges(since, now)],
  ];
  for (const [via, load] of kinds) {
    // No later kind starts once the budget is spent.
    if (budget.expired()) {
      logError('Abuse funnel detector hit its time budget', { via });
      break;
    }
    try {
      raised += await raiseFunnelSignals(
        via,
        await load(),
        config,
        now,
        budget,
      );
    } catch (error) {
      logError('Abuse funnel detector failed', { via, error });
    }
  }
  return raised;
}

/** Bot-like timing from the per-day activity counters. */
async function botTiming(
  config: AbuseDetectionConfig,
  now: Date,
  budget: Budget = newBudget(),
  batchSize = BOT_BATCH_PLAYERS,
): Promise<number> {
  const sinceDay = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - BOT_TIMING_LOOKBACK_DAYS,
    ),
  );
  // A player needs enough actions in the window to reach either tell; below
  // that no ActivityDay group can trigger, so it is never loaded.
  const minActions = Math.min(
    config.bot.minDays * config.bot.minHoursPerDay,
    config.bot.minGapSamples,
  );
  let raised = 0;
  let cursor = 0;
  // Keyset pages over complete player groups: candidates are listed in
  // ascending user id in bounded batches, each batch's rows are loaded whole,
  // and the sweep walks every candidate (stopping only at the time budget).
  // No cursor is kept across days: the whole window is re-walked each sweep.
  for (;;) {
    if (budget.expired()) {
      logError('Abuse bot-timing detector hit its time budget', { cursor });
      break;
    }
    const after = cursor;
    const candidates = await read(
      (db) =>
        db.$queryRaw<Array<{ userId: number }>>`
        SELECT a."userId" FROM "ActivityDay" a
        JOIN users u ON u.id = a."userId" AND u."isBot" = false
        WHERE a.day >= ${sinceDay}::date AND a."userId" > ${after}
        GROUP BY a."userId" HAVING SUM(a.actions) >= ${minActions}
        ORDER BY a."userId" LIMIT ${batchSize}`,
    );
    if (candidates.length === 0) break;
    const ids = candidates.map((row) => Number(row.userId));
    cursor = ids[ids.length - 1];
    const rows = await read((db) =>
      db.activityDay.findMany({
        where: { userId: { in: ids }, day: { gte: sinceDay } },
        orderBy: [{ userId: 'asc' }, { day: 'asc' }],
      }),
    );
    const byUser = new Map<number, typeof rows>();
    for (const row of rows) {
      const list = byUser.get(row.userId) ?? [];
      list.push(row);
      byUser.set(row.userId, list);
    }
    raised += await raiseBotSignals(byUser, config, now, budget);
    if (candidates.length < batchSize) break;
  }
  return raised;
}

async function raiseBotSignals(
  byUser: Map<
    number,
    Array<{
      hourMask: number;
      actions: number;
      gapCount: number;
      gapSum: number;
      gapSumSq: number;
    }>
  >,
  config: AbuseDetectionConfig,
  now: Date,
  budget: Budget,
): Promise<number> {
  let raised = 0;
  for (const [userId, userRows] of byUser) {
    if (budget.expired()) break;
    const assessment = assessBotTiming(userRows, config.bot);
    if (!assessment.triggered) continue;
    const result = await raiseAbuseSignal({
      type: 'BOT_TIMING',
      userId,
      linkedUserIds: [],
      dedupeKey: `bot:${userId}`,
      score: assessment.score,
      summary: `Bot-like activity over the last ${BOT_TIMING_LOOKBACK_DAYS} days: ${[
        assessment.reasons.includes('always-on')
          ? `active in ${config.bot.minHoursPerDay}+ hours a day on ${assessment.alwaysOnDays} days`
          : null,
        assessment.reasons.includes('regular-intervals')
          ? `action intervals vary only ${Math.round(assessment.variationPercent ?? 0)}% across ${assessment.gapSamples} actions`
          : null,
      ]
        .filter(Boolean)
        .join('; ')}.`,
      evidence: {
        kind: 'bot-timing',
        daysObserved: userRows.length,
        alwaysOnDays: assessment.alwaysOnDays,
        gapSamples: assessment.gapSamples,
        meanGapSeconds: Math.round(assessment.meanGapSeconds * 100) / 100,
        variationPercent:
          assessment.variationPercent === null
            ? null
            : Math.round(assessment.variationPercent * 10) / 10,
        reasons: assessment.reasons,
        thresholds: config.bot,
      },
      now,
    });
    if (result !== 'suppressed') raised += 1;
  }
  return raised;
}

interface FreshPairRow {
  attacker: number;
  defender: number;
  attacks: number;
  wins: number;
  first_at: Date;
  last_at: Date;
  defender_created: Date | null;
}

async function loadFreshPairs(
  config: AbuseDetectionConfig['fresh'],
  now: Date,
  pair?: [number, number],
): Promise<FreshPairRow[]> {
  const since = startOfWindow(now, config.windowDays);
  const pairFilter = pair
    ? Prisma.sql`AND a.attacker_id = ${pair[0]} AND a.defender_id = ${pair[1]}`
    : Prisma.empty;
  return read(
    (db) => db.$queryRaw<FreshPairRow[]>`
    SELECT a.attacker_id AS attacker, a.defender_id AS defender,
      COUNT(*)::int AS attacks,
      COUNT(*) FILTER (WHERE a.winner = a.attacker_id)::int AS wins,
      MIN(a.timestamp) AS first_at, MAX(a.timestamp) AS last_at,
      MAX(d.created_at AT TIME ZONE 'UTC') AS defender_created
    FROM attack_log a
    JOIN users att ON att.id = a.attacker_id AND att."isBot" = false
    JOIN users d ON d.id = a.defender_id AND d."isBot" = false
    WHERE a.type = 'attack' AND a.timestamp >= ${since} AND a.timestamp <= ${now}
      AND a.attacker_id <> a.defender_id AND d.created_at IS NOT NULL
      AND a.timestamp < (d.created_at AT TIME ZONE 'UTC') + make_interval(days => ${config.accountAgeDays}::int)
      ${pairFilter}
    GROUP BY 1, 2 HAVING COUNT(*) >= ${config.minAttacks}
    ORDER BY COUNT(*) DESC LIMIT ${MAX_FRESH_PAIRS_PER_RUN}`,
    pair ? ABUSE_WRITE_STATEMENT_MS : undefined,
  );
}

async function raiseFreshPairSignal(
  row: FreshPairRow,
  config: AbuseDetectionConfig,
  now: Date,
): Promise<boolean> {
  const preliminary = assessFreshAccountFarming({
    attacks: Number(row.attacks),
    attackerWins: Number(row.wins),
    config: config.fresh,
  });
  if (!preliminary.triggered) return false;
  const sharedLoginPattern = await pairSharesLogin(
    row.attacker,
    row.defender,
    now,
  );
  const assessment = assessFreshAccountFarming({
    attacks: Number(row.attacks),
    attackerWins: Number(row.wins),
    config: config.fresh,
    sharedLoginPattern,
  });
  const result = await raiseAbuseSignal({
    type: 'FRESH_ACCOUNT_FARMING',
    userId: row.attacker,
    relatedUserId: row.defender,
    linkedUserIds: [row.defender],
    dedupeKey: `fresh:${row.attacker}:${row.defender}`,
    score: assessment.score,
    summary:
      `Attacked the same account ${row.attacks} times (${row.wins} wins) within ` +
      `${config.fresh.accountAgeDays} days of that account being created.${
        sharedLoginPattern
          ? ' The pair also shares a login network or browser pattern.'
          : ''
      }`,
    evidence: {
      kind: 'fresh-account-farming',
      defenderUserId: row.defender,
      attacks: Number(row.attacks),
      attackerWins: Number(row.wins),
      firstAttackAt: new Date(row.first_at).toISOString(),
      lastAttackAt: new Date(row.last_at).toISOString(),
      defenderCreatedAt: row.defender_created
        ? new Date(row.defender_created).toISOString()
        : null,
      accountAgeDays: config.fresh.accountAgeDays,
      windowDays: config.fresh.windowDays,
      ...(sharedLoginPattern ? { sharedLoginPattern: true } : {}),
      reasons: assessment.reasons,
      thresholds: config.fresh,
    },
    now,
  });
  return result !== 'suppressed';
}

/** Accounts under the age limit that one player keeps attacking and beating. */
async function freshAccountFarming(
  config: AbuseDetectionConfig,
  now: Date,
  budget: Budget = newBudget(),
): Promise<number> {
  let raised = 0;
  for (const row of await loadFreshPairs(config.fresh, now)) {
    if (budget.expired()) break;
    if (await raiseFreshPairSignal(row, config, now)) raised += 1;
  }
  return raised;
}

/**
 * Write-time fresh-account check right after an attack: one indexed lookup
 * of the attacker/defender pair. Best effort; never touches the attack.
 */
export function evaluateAttackPair(
  attackerId: number,
  defenderId: number,
  now: Date = new Date(),
): Promise<boolean> {
  return writeChecks.run(async () => {
    const config = await getAbuseConfigBounded();
    if (!config?.enabled) return;
    const rows = await loadFreshPairs(config.fresh, now, [
      attackerId,
      defenderId,
    ]);
    for (const row of rows) await raiseFreshPairSignal(row, config, now);
  });
}

/** Shared-network sweep over the login telemetry window. */
async function sharedNetworks(
  config: AbuseDetectionConfig,
  now: Date,
  budget: Budget = newBudget(),
): Promise<number> {
  const clusters = await findLoginClusters({
    since: startOfWindow(now, config.network.windowDays),
    minAccounts: config.network.minAccounts,
  });
  let raised = 0;
  for (const cluster of clusters) {
    if (budget.expired()) break;
    const result = await raiseLoginClusterSignal(cluster, config.network, now);
    if (result && result !== 'suppressed') raised += 1;
  }
  return raised;
}

/** Deletes activity counters beyond their short retention window. */
export async function pruneActivityDays(now = new Date()): Promise<number> {
  const cutoff = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - ACTIVITY_DAY_RETENTION_DAYS,
    ),
  );
  try {
    const result = await read((db) =>
      db.activityDay.deleteMany({ where: { day: { lt: cutoff } } }),
    );
    return result.count;
  } catch {
    logError('Unable to prune activity counters');
    return 0;
  }
}

/** See goldPingPong; every query and write inside it shares `budget`. */
export const detectGoldPingPong = (
  config: AbuseDetectionConfig,
  now: Date,
  budget: Budget = newBudget(),
): Promise<number> =>
  runWithBudget(budget, () => goldPingPong(config, now, budget));

/** See resourceFunnelling; every query and write inside it shares `budget`. */
export const detectResourceFunnelling = (
  config: AbuseDetectionConfig,
  now: Date,
  budget: Budget = newBudget(),
): Promise<number> =>
  runWithBudget(budget, () => resourceFunnelling(config, now, budget));

/** See botTiming; every query and write inside it shares `budget`. */
export const detectBotTiming = (
  config: AbuseDetectionConfig,
  now: Date,
  budget: Budget = newBudget(),
  batchSize = BOT_BATCH_PLAYERS,
): Promise<number> =>
  runWithBudget(budget, () => botTiming(config, now, budget, batchSize));

/** See freshAccountFarming; every query and write inside it shares `budget`. */
export const detectFreshAccountFarming = (
  config: AbuseDetectionConfig,
  now: Date,
  budget: Budget = newBudget(),
): Promise<number> =>
  runWithBudget(budget, () => freshAccountFarming(config, now, budget));

/** See sharedNetworks; every query and write inside it shares `budget`. */
export const detectSharedNetworks = (
  config: AbuseDetectionConfig,
  now: Date,
  budget: Budget = newBudget(),
): Promise<number> =>
  runWithBudget(budget, () => sharedNetworks(config, now, budget));

/**
 * The daily abuse sweep. Every detector is bounded and isolated: one that
 * fails is logged and the rest still run. Never throws.
 */
export async function runAbuseDetection(
  now: Date = new Date(),
): Promise<AbuseRunSummary> {
  const summary: AbuseRunSummary = {
    skipped: false,
    network: 0,
    funnel: 0,
    pingPong: 0,
    bot: 0,
    fresh: 0,
    prunedActivityDays: 0,
  };
  const config = await getAbuseConfigBounded();
  if (!config) {
    logError('Abuse detection skipped: runtime configuration unavailable');
    return { ...summary, skipped: true };
  }
  summary.prunedActivityDays = await pruneActivityDays(now);
  if (!config.enabled) return { ...summary, skipped: true };
  const steps: Array<[keyof AbuseRunSummary, () => Promise<number>]> = [
    ['network', () => detectSharedNetworks(config, now, newBudget())],
    ['funnel', () => detectResourceFunnelling(config, now, newBudget())],
    ['pingPong', () => detectGoldPingPong(config, now, newBudget())],
    ['bot', () => detectBotTiming(config, now, newBudget())],
    ['fresh', () => detectFreshAccountFarming(config, now, newBudget())],
  ];
  for (const [name, run] of steps) {
    try {
      (summary[name] as number) = await run();
    } catch (error) {
      logError('Abuse detector failed', { detector: name, error });
    }
  }
  return summary;
}
