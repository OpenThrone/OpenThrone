import {
  ABUSE_BACKGROUND_LIMIT,
  ABUSE_LOCK_MS,
  ABUSE_SWEEP_STATEMENT_MS,
  ABUSE_WRITE_STATEMENT_MS,
  type AbuseDetectionConfig,
  assessSharedNetwork,
  DAY_MS,
} from '@/constants/abuseSignals';
import prisma from '@/lib/prisma';
import { Prisma } from '@/lib/prisma-exports';
import { getAbuseConfigBounded } from '@/services/AbuseConfig.service';
import {
  raiseAbuseSignal,
  type RaiseAbuseSignalResult,
} from '@/services/AbuseSignalStore.service';
import { getAntiAbuseHash } from '@/utils/antiAbuse';
import { createBestEffortRunner, withDbDeadline } from '@/utils/boundedWork';
import { getTrustedProxyAddresses, ipNetworkPrefix } from '@/utils/ipUtils';
import { logError } from '@/utils/logger';

const RETENTION_DAYS = 30;

/** What produced a LoginEvent row. */
export type LoginEventKind = 'SIGN_IN' | 'SIGN_UP' | 'SEEN';

export interface LoginTelemetryInput {
  userId: number;
  ip?: string | null;
  userAgent?: string | null;
  occurredAt?: Date;
}

const hashValue = (kind: string, value?: string | null): string | null => {
  const normalized = value?.trim();
  return normalized ? getAntiAbuseHash(`${kind}:${normalized}`) : null;
};

/** Login IP hash as stored on login events. */
export const loginIpHash = (ip?: string | null): string | null =>
  hashValue('login-ip', ip);

/**
 * Salted hash of the address's IPv4 /24 or IPv6 /64 network range. A range is
 * weaker evidence than a full address (mobile carriers, CGNAT, campuses), so
 * it groups accounts for staff review but never raises a signal on its own.
 * Null when no address resolved or it is one of our own proxies.
 */
export const loginIpPrefixHash = (ip?: string | null): string | null => {
  const normalized = ip?.trim();
  if (!normalized || getTrustedProxyAddresses().includes(normalized))
    return null;
  const prefix = ipNetworkPrefix(normalized);
  return prefix ? getAntiAbuseHash(`login-ip-prefix:${prefix}`) : null;
};

/**
 * IP hashes of our own proxies. Logins that resolved to a proxy (a missing
 * or misconfigured TRUSTED_PROXY_IPS) share them without sharing a network.
 */
export const proxyLoginIpHashes = (): Set<string> =>
  new Set(
    getTrustedProxyAddresses()
      .map((ip) => loginIpHash(ip))
      .filter((hash): hash is string => hash !== null),
  );

/** The hash columns a telemetry row stores; only salted hashes, never values. */
const telemetryHashes = (input: LoginTelemetryInput) => {
  const ipHash =
    hashValue('login-ip', input.ip) ??
    getAntiAbuseHash(`login-ip:missing:${input.userId}`);
  const userAgentHash = hashValue('login-agent', input.userAgent);
  const normalizedIp = input.ip?.trim();
  const normalizedUserAgent = input.userAgent?.trim();
  // A User-Agent identifies a browser family, not a device. Use the
  // combination only as a shared network/browser pattern for staff review.
  const viaProxyOnly =
    !!normalizedIp && getTrustedProxyAddresses().includes(normalizedIp);
  const deviceHash =
    normalizedIp && normalizedUserAgent && !viaProxyOnly
      ? getAntiAbuseHash(
          `device-pattern:${normalizedIp}:${normalizedUserAgent}`,
        )
      : null;
  return {
    ipHash,
    ipPrefixHash: loginIpPrefixHash(input.ip),
    deviceHash,
    userAgentHash,
  };
};

/** The hashes a follow-up signal check needs from a written sign-in row. */
interface WrittenTelemetry {
  ipHash: string;
  deviceHash: string | null;
}

/** Writes one telemetry row of the given kind. Best effort: never throws. */
async function writeLoginEvent(
  input: LoginTelemetryInput,
  kind: LoginEventKind,
): Promise<WrittenTelemetry | null> {
  try {
    const { ipHash, ipPrefixHash, deviceHash, userAgentHash } =
      telemetryHashes(input);
    await prisma.loginEvent.create({
      data: {
        userId: input.userId,
        ipHash,
        ipPrefixHash,
        deviceHash,
        userAgentHash,
        kind,
        occurredAt: input.occurredAt,
      },
    });
    return { ipHash, deviceHash };
  } catch {
    // Telemetry is best effort. Do not log request identifiers or raw errors.
    logError('Unable to record login telemetry', { userId: input.userId });
    return null;
  }
}

/** Stores only salted hashes for login network and client identifiers. */
export async function recordSuccessfulLogin(
  input: LoginTelemetryInput,
): Promise<void> {
  const written = await writeLoginEvent(input, 'SIGN_IN');
  if (!written) return;
  // Off the sign-in path: authentication never waits on abuse detection.
  loginChecks.run(() =>
    refreshLinkedDeviceSignals(written.ipHash, written.deviceHash),
  );
}

/**
 * Same salted hashes at registration, so accounts created from one network
 * link up even before their first sign-in. Raises no signal: a sign-up alone
 * is review context, like every shared-network cluster.
 */
export async function recordSignUpTelemetry(
  input: LoginTelemetryInput,
): Promise<void> {
  await writeLoginEvent(input, 'SIGN_UP');
}

/**
 * In-memory daily guard for seen events: one Set of user ids per UTC day per
 * process. The DB insert below is idempotent anyway; this keeps the common
 * path a Set lookup with no query at all.
 */
const seenGuard = { dayKey: '', users: new Set<number>() };

const utcDayOf = (at: Date): { key: string; start: Date; end: Date } => {
  const start = new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()),
  );
  return {
    key: start.toISOString().slice(0, 10),
    start,
    end: new Date(start.getTime() + 24 * 60 * 60 * 1000),
  };
};

/**
 * Records at most one SEEN event per user per UTC day of authenticated
 * activity, so players on long-lived sessions (who never sign in) still link
 * up in the multi-account view. Best effort: never blocks or fails a request.
 */
export async function recordDailySeenActivity(
  input: Omit<LoginTelemetryInput, 'occurredAt'> & { now?: Date },
): Promise<void> {
  try {
    const at = input.now ?? new Date();
    const day = utcDayOf(at);
    if (seenGuard.dayKey !== day.key) {
      seenGuard.dayKey = day.key;
      seenGuard.users = new Set<number>();
    }
    if (seenGuard.users.has(input.userId)) return;
    seenGuard.users.add(input.userId);

    const { ipHash, ipPrefixHash, deviceHash, userAgentHash } =
      telemetryHashes(input);
    // Idempotent across processes: the insert only fires when no SEEN row
    // exists for this user and UTC day yet.
    await withDbDeadline(
      (db) =>
        db.$executeRaw`INSERT INTO "LoginEvent"
          ("userId", "ipHash", "ipPrefixHash", "deviceHash", "userAgentHash", "kind", "occurredAt")
          SELECT ${input.userId}, ${ipHash}, ${ipPrefixHash}, ${deviceHash}, ${userAgentHash}, 'SEEN', ${at}
          WHERE NOT EXISTS (
            SELECT 1 FROM "LoginEvent"
            WHERE "userId" = ${input.userId} AND "kind" = 'SEEN'
              AND "occurredAt" >= ${day.start} AND "occurredAt" < ${day.end}
          )`,
      { statementMs: ABUSE_WRITE_STATEMENT_MS, lockMs: ABUSE_LOCK_MS },
    );
  } catch {
    logError('Unable to record seen telemetry', { userId: input.userId });
  }
}

export interface LoginCluster {
  via: 'ip' | 'device' | 'range';
  hash: string;
  userIds: number[];
}

const MAX_CLUSTERS_PER_RUN = 200;
const MAX_ACCOUNTS_PER_CLUSTER = 50;

const CLUSTER_COLUMNS = {
  ip: Prisma.sql`"ipHash"`,
  device: Prisma.sql`"deviceHash"`,
  range: Prisma.sql`"ipPrefixHash"`,
} as const;

export type LoginClusterVia = keyof typeof CLUSTER_COLUMNS;

/**
 * Hashed IPs, IP+browser patterns and network ranges shared by at least
 * `minAccounts` distinct human accounts since `since`. Our own proxy address
 * is everyone's address, so it never forms a cluster. `only` narrows the
 * lookup to the hashes of one login (write-time evaluation); omitted, it
 * sweeps the window. `vias` selects the cluster kinds; signal paths keep the
 * `ip`/`device` default, because a shared range (mobile carriers, CGNAT,
 * campuses) alone never raises a signal — staff see it as context.
 */
export async function findLoginClusters(options: {
  since: Date;
  minAccounts: number;
  vias?: readonly LoginClusterVia[];
  only?: {
    ipHash?: string | null;
    deviceHash?: string | null;
    ipPrefixHash?: string | null;
  };
}): Promise<LoginCluster[]> {
  const proxies = [...proxyLoginIpHashes()];
  const vias = options.vias ?? (['ip', 'device'] as const);
  const clusters: LoginCluster[] = [];
  for (const via of vias) {
    const column = CLUSTER_COLUMNS[via];
    const only =
      via === 'ip'
        ? options.only?.ipHash
        : via === 'device'
          ? options.only?.deviceHash
          : options.only?.ipPrefixHash;
    if (options.only && !only) continue;
    const narrow = only ? Prisma.sql`AND l.${column} = ${only}` : Prisma.empty;
    const rows = await withDbDeadline(
      (db) =>
        db.$queryRaw<
          Array<{ hash: string; users: number[] }>
        >`SELECT l.${column} AS hash, array_agg(DISTINCT l."userId") AS users
      FROM "LoginEvent" l
      JOIN users u ON u.id = l."userId" AND u."isBot" = false
      WHERE l."occurredAt" >= ${options.since}
        AND l.${column} IS NOT NULL
        AND NOT (l."ipHash" = ANY(${proxies}::text[]))
        ${narrow}
      GROUP BY l.${column}
      HAVING COUNT(DISTINCT l."userId") >= ${options.minAccounts}
      ORDER BY COUNT(DISTINCT l."userId") DESC
      LIMIT ${MAX_CLUSTERS_PER_RUN}`,
      {
        statementMs: options.only
          ? ABUSE_WRITE_STATEMENT_MS
          : ABUSE_SWEEP_STATEMENT_MS,
        lockMs: ABUSE_LOCK_MS,
      },
    );
    for (const row of rows)
      clusters.push({
        via,
        hash: row.hash,
        userIds: row.users
          .map(Number)
          .sort((a, b) => a - b)
          .slice(0, MAX_ACCOUNTS_PER_CLUSTER),
      });
  }
  return clusters;
}

/** Files (or refreshes) the shared-network signal for one cluster. */
export async function raiseLoginClusterSignal(
  cluster: LoginCluster,
  config: AbuseDetectionConfig['network'],
  now: Date,
): Promise<RaiseAbuseSignalResult | null> {
  // A shared network range is weaker evidence than a shared address (mobile
  // carriers, CGNAT, campuses): context for staff review, never a signal.
  if (cluster.via === 'range') return null;
  const assessment = assessSharedNetwork({
    via: cluster.via,
    accounts: cluster.userIds.length,
    minAccounts: config.minAccounts,
  });
  if (!assessment.triggered) return null;
  const [anchor, ...linked] = cluster.userIds;
  return raiseAbuseSignal({
    type: 'LINKED_ACCOUNT_ACTIVITY',
    userId: anchor,
    linkedUserIds: linked,
    dedupeKey: `net:${cluster.via}:${cluster.hash.slice(0, 24)}`,
    score: assessment.score,
    summary:
      cluster.via === 'device'
        ? `${cluster.userIds.length} accounts logged in from the same network and browser within ${config.windowDays} days.`
        : `${cluster.userIds.length} accounts logged in from the same network within ${config.windowDays} days.`,
    evidence: {
      kind: 'shared-network',
      via: cluster.via,
      distinctAccounts: cluster.userIds.length,
      windowDays: config.windowDays,
      // A short prefix of the salted hash lets staff tell clusters apart
      // without exposing a value that could be matched elsewhere.
      patternId: cluster.hash.slice(0, 10),
      reasons: assessment.reasons,
      thresholds: { minAccounts: config.minAccounts },
    },
    now,
  });
}

/** Login-time cluster checks: bounded concurrency, dropped (the daily sweep catches up) when busy. */
const loginChecks = createBestEffortRunner(
  'Abuse login check',
  ABUSE_BACKGROUND_LIMIT,
);
/** Resolves once every login-time check started so far has settled (tests). */
export const settleLoginChecks = () => loginChecks.idle();

/** Write-time check after a login: only this login's hashes are examined. */
async function refreshLinkedDeviceSignals(
  ipHash: string,
  deviceHash: string | null,
): Promise<void> {
  // A login that resolved to our own proxy shares an address with everyone.
  if (proxyLoginIpHashes().has(ipHash)) return;
  const config = await getAbuseConfigBounded();
  if (!config?.enabled) return;
  const now = new Date();
  const clusters = await findLoginClusters({
    since: new Date(now.getTime() - config.network.windowDays * DAY_MS),
    minAccounts: config.network.minAccounts,
    only: { ipHash, deviceHash },
  });
  for (const cluster of clusters)
    await raiseLoginClusterSignal(cluster, config.network, now);
}

/** Deletes telemetry beyond its bounded 30-day retention window. */
export async function pruneLoginTelemetry(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  try {
    const result = await prisma.loginEvent.deleteMany({
      where: { occurredAt: { lt: cutoff } },
    });
    return result.count;
  } catch {
    logError('Unable to prune login telemetry');
    return 0;
  }
}
