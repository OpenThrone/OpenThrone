import prisma from '@/lib/prisma';
import { getAntiAbuseHash } from '@/utils/antiAbuse';
import { logError } from '@/utils/logger';

const RETENTION_DAYS = 30;
const MAX_EVENTS_PER_DEVICE_LOOKUP = 1000;
const LINKED_ACCOUNT_THRESHOLD = 3;

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

/** Stores only salted hashes for login network and client identifiers. */
export async function recordSuccessfulLogin(
  input: LoginTelemetryInput,
): Promise<void> {
  try {
    const ipHash =
      hashValue('login-ip', input.ip) ??
      getAntiAbuseHash(`login-ip:missing:${input.userId}`);
    const userAgentHash = hashValue('login-agent', input.userAgent);
    const normalizedIp = input.ip?.trim();
    const normalizedUserAgent = input.userAgent?.trim();
    // A User-Agent identifies a browser family, not a device. Use the
    // combination only as a shared network/browser pattern for staff review.
    const deviceHash =
      normalizedIp && normalizedUserAgent
        ? getAntiAbuseHash(
            `device-pattern:${normalizedIp}:${normalizedUserAgent}`,
          )
        : null;

    await prisma.loginEvent.create({
      data: {
        userId: input.userId,
        ipHash,
        ipPrefixHash: null,
        deviceHash,
        userAgentHash,
        occurredAt: input.occurredAt,
      },
    });

    if (deviceHash) await refreshLinkedDeviceSignals(deviceHash);
  } catch {
    // Telemetry is best effort. Do not log request identifiers or raw errors.
    logError('Unable to record login telemetry', { userId: input.userId });
  }
}

async function refreshLinkedDeviceSignals(deviceHash: string): Promise<void> {
  const since = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const lockKey = BigInt(`0x${deviceHash.slice(0, 15)}`);

  await prisma.$transaction(async (tx) => {
    // Serialize writers for this hashed pattern; the lock releases on commit.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(${lockKey})`;
    const events = await tx.loginEvent.findMany({
      where: { deviceHash, occurredAt: { gte: since } },
      select: { userId: true },
      distinct: ['userId'],
      orderBy: { occurredAt: 'desc' },
      take: MAX_EVENTS_PER_DEVICE_LOOKUP,
    });
    const userIds = [...new Set(events.map((event) => event.userId))];
    if (userIds.length < LINKED_ACCOUNT_THRESHOLD) return;

    const now = new Date();
    for (const userId of userIds) {
      const openSignal = await tx.cheatSignal.findFirst({
        where: {
          userId,
          type: 'LINKED_ACCOUNT_ACTIVITY',
          status: { in: ['OPEN', 'ACKNOWLEDGED'] },
          evidence: { path: ['deviceLink'], equals: 'network-browser-pattern' },
        },
        select: { id: true },
      });
      if (openSignal) {
        await tx.cheatSignal.update({
          where: { id: openSignal.id },
          data: { lastSeenAt: now },
        });
        continue;
      }
      await tx.cheatSignal.create({
        data: {
          userId,
          type: 'LINKED_ACCOUNT_ACTIVITY',
          severity: 'LOW',
          score: 1,
          status: 'OPEN',
          summary:
            'This account shares a network/browser pattern with at least two other accounts.',
          evidence: {
            deviceLink: 'network-browser-pattern',
            distinctAccounts: userIds.length,
            windowDays: RETENTION_DAYS,
          },
        },
      });
    }
  });
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
