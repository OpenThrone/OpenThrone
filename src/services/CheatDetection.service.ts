import {
  assessDefectorFarming,
  DEFECTOR_FARMING_WINDOW_DAYS,
  defectorFarmingSeverity,
} from '@/constants/KingdomMorale';
import prisma from '@/lib/prisma';
import { InvestigationStatus, SignalSeverity } from '@/lib/prisma-exports';
import { proxyLoginIpHashes } from '@/services/LoginTelemetry.service';
import { logActionStrict } from '@/utils/auditLogger';
import { getOTDayKey } from '@/utils/timefunctions';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Login telemetry retention: pairs only share a pattern within this window. */
const PAIR_LOGIN_WINDOW_DAYS = 30;
/** Bounded per-user login lookup, mirroring LoginTelemetry's own limit. */
const PAIR_LOGIN_EVENT_LIMIT = 1000;

/**
 * Deterministic advisory-lock key for one (receiver, loser, type)
 * cheat-signal pair: FNV-1a 64-bit over the triple, rendered as a signed
 * bigint string for pg_advisory_xact_lock. A hash collision only
 * over-serializes two unrelated pairs for a moment; it never
 * under-serializes a pair, which is all the dedupe needs.
 */
const cheatSignalLockKey = (
  receiverId: number,
  loserId: number,
  type: string,
): string => {
  const identity = `${receiverId}:${loserId}:${type}`;
  let hash = 0xcbf29ce484222325n; // FNV-1a offset basis
  for (let index = 0; index < identity.length; index += 1) {
    // eslint-disable-next-line no-bitwise -- FNV-1a XOR step over the byte
    hash ^= BigInt(identity.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n); // FNV-1a prime
  }
  return BigInt.asIntN(64, hash).toString();
};

/** Encapsulates cheat detection data access and domain operations. */
export class CheatDetectionService {
  static async listSignals(filters?: {
    status?: InvestigationStatus;
    severity?: SignalSeverity;
    userId?: number;
    limit?: number;
    offset?: number;
  }) {
    const where: Record<string, unknown> = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.severity) where.severity = filters.severity;
    if (filters?.userId) where.userId = filters.userId;

    const [signals, total] = await Promise.all([
      prisma.cheatSignal.findMany({
        where,
        include: {
          user: { select: { id: true, display_name: true } },
          relatedUser: { select: { id: true, display_name: true } },
          assignedTo: { select: { id: true, display_name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: filters?.limit ?? 25,
        skip: filters?.offset ?? 0,
      }),
      prisma.cheatSignal.count({ where }),
    ]);

    return { signals, total };
  }

  static async applyAction(
    staffUserId: number,
    signalId: number,
    action: 'acknowledge' | 'dismiss' | 'takeAction',
    ip: string,
  ) {
    return prisma.$transaction(async (tx) => {
      const signal = await tx.cheatSignal.findUnique({
        where: { id: signalId },
        select: { id: true, userId: true },
      });
      if (!signal) throw new Error('Signal not found');

      const data =
        action === 'acknowledge'
          ? { status: 'ACKNOWLEDGED' as const, assignedToUserId: staffUserId }
          : {
              status:
                action === 'dismiss'
                  ? ('DISMISSED' as const)
                  : ('ACTION_TAKEN' as const),
              resolvedByUserId: staffUserId,
              resolvedAt: new Date(),
            };
      const updated = await tx.cheatSignal.update({
        where: { id: signalId },
        data,
      });
      await logActionStrict(
        {
          userId: staffUserId,
          targetUserId: signal.userId,
          action: 'ADMIN_CHEAT_SIGNAL_ACTION',
          ip,
          entityType: 'CheatSignal',
          entityId: signalId,
          details: { signalId, action },
        },
        tx,
      );
      return updated;
    });
  }

  static async getMultiAccountClusters(limit = 50) {
    const recentLogins = await prisma.loginEvent.findMany({
      where: {
        occurredAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      select: { userId: true, ipHash: true, deviceHash: true },
      take: 5000,
      orderBy: { occurredAt: 'desc' },
    });

    const ipToUsers = new Map<string, Set<number>>();
    const deviceToUsers = new Map<string, Set<number>>();
    const addUser = (
      map: Map<string, Set<number>>,
      key: string,
      userId: number,
    ) => {
      const users = map.get(key) ?? new Set<number>();
      users.add(userId);
      map.set(key, users);
    };

    // Our own proxy's address is everyone's address, not a shared network.
    const proxyHashes = proxyLoginIpHashes();
    for (const login of recentLogins) {
      if (login.ipHash && proxyHashes.has(login.ipHash)) continue;
      if (login.ipHash) {
        addUser(ipToUsers, login.ipHash, login.userId);
      }
      if (login.deviceHash) {
        addUser(deviceToUsers, login.deviceHash, login.userId);
      }
    }

    const clusters: Array<{
      type: 'IP' | 'NETWORK_BROWSER';
      hash: string;
      userIds: number[];
      userNames: Record<number, string>;
    }> = [];

    for (const [ip, users] of ipToUsers) {
      if (users.size >= 3) {
        clusters.push({
          type: 'IP',
          hash: ip,
          userIds: Array.from(users),
          userNames: {},
        });
      }
    }

    for (const [device, users] of deviceToUsers) {
      if (users.size >= 3) {
        clusters.push({
          type: 'NETWORK_BROWSER',
          hash: device,
          userIds: Array.from(users),
          userNames: {},
        });
      }
    }

    const allUserIds = new Set(clusters.flatMap((c) => c.userIds));
    const nameMap: Record<number, string> = {};
    if (allUserIds.size > 0) {
      const users = await prisma.users.findMany({
        where: { id: { in: Array.from(allUserIds) } },
        select: { id: true, display_name: true },
      });
      for (const u of users) {
        nameMap[u.id] = u.display_name;
      }
    }
    for (const cluster of clusters) {
      cluster.userNames = nameMap;
    }

    return clusters.slice(0, limit).map(({ hash, ...cluster }) => ({
      ...cluster,
      hash: `${hash.slice(0, 10)}…`,
    }));
  }

  /**
   * Defector-farming cheat signal (#205): after a loser's daily morale pass
   * commits its defections, evaluate every receiver that loser fed within
   * the rolling DEFECTOR_FARMING_WINDOW_DAYS. A pair signals when the
   * receiver collected the loser's defectors on DEFECTOR_FARMING_MIN_DAYS or
   * more distinct OT days, or took at least half of everything the loser
   * lost to desertion in the window; a shared login IP/device pattern adds
   * weight. Runs on plain prisma AFTER the pass's transaction commits (a
   * failed statement inside it would abort the whole pass on Postgres) and
   * reads the committed desertionEvent rows, so a same-day re-run of the
   * pass re-evaluates it; the per-pair dedupe keeps that idempotent.
   * Signal only — this never blocks gameplay. Bots never signal in either
   * direction: bot losers feeding a human attacker (or a bot collecting a
   * human's collapse) is ordinary play.
   */
  static async detectDefectorFarming(
    loserId: number,
    now: Date = new Date(),
  ): Promise<void> {
    if (!Number.isSafeInteger(loserId) || loserId <= 0) return;
    const windowStart = new Date(
      now.getTime() - DEFECTOR_FARMING_WINDOW_DAYS * DAY_MS,
    );

    const loser = await prisma.users.findUnique({
      where: { id: loserId },
      select: { display_name: true, isBot: true },
    });
    if (!loser || loser.isBot) return;

    const defectRows = await prisma.desertionEvent.findMany({
      where: {
        userId: loserId,
        kind: 'DEFECT',
        createdAt: { gte: windowStart },
      },
      select: { defectedToUserId: true, quantity: true, createdAt: true },
    });
    if (defectRows.length === 0) return;

    // Everything the loser lost to desertion in the window, every kind:
    // citizens, trained deserters that abandoned, defectors and mercenaries.
    const totalLost = await prisma.desertionEvent.aggregate({
      _sum: { quantity: true },
      where: { userId: loserId, createdAt: { gte: windowStart } },
    });
    const totalLostToDesertion = Number(totalLost._sum.quantity ?? 0);
    if (totalLostToDesertion <= 0) return;

    const perReceiver = new Map<
      number,
      { quantity: number; days: Set<string> }
    >();
    for (const row of defectRows) {
      if (row.defectedToUserId === null || row.defectedToUserId === loserId)
        continue;
      const entry = perReceiver.get(row.defectedToUserId) ?? {
        quantity: 0,
        days: new Set<string>(),
      };
      entry.quantity += row.quantity;
      entry.days.add(getOTDayKey(new Date(row.createdAt)));
      perReceiver.set(row.defectedToUserId, entry);
    }
    if (perReceiver.size === 0) return;

    const receiverRows = await prisma.users.findMany({
      where: { id: { in: [...perReceiver.keys()] } },
      select: { id: true, isBot: true },
    });
    const humanReceivers = receiverRows.filter((row) => !row.isBot);

    for (const receiver of humanReceivers) {
      const stats = perReceiver.get(receiver.id);
      if (!stats) continue;
      const base = assessDefectorFarming({
        distinctDays: stats.days.size,
        defectedToReceiver: stats.quantity,
        totalLostToDesertion,
      });
      if (!base.triggered) continue;

      // Extra weight when the pair already shares a login network or device
      // pattern — the same telemetry the multi-account clusters are built
      // from, queried for just this pair.
      const sharedLoginPattern = await this.pairSharesLoginPattern(
        receiver.id,
        loserId,
        now,
      );
      const assessment = assessDefectorFarming({
        distinctDays: stats.days.size,
        defectedToReceiver: stats.quantity,
        totalLostToDesertion,
        sharedLoginPattern,
      });
      const sharePercent = Math.round(assessment.share * 100);
      const summary =
        `Received ${stats.quantity} defectors from ${loser.display_name} across ` +
        `${stats.days.size} of the last ${DEFECTOR_FARMING_WINDOW_DAYS} days — ` +
        `${sharePercent}% of everything that kingdom lost to desertion.${
          sharedLoginPattern
            ? ' The pair also shares a login network/browser pattern.'
            : ''
        }`;
      const evidence = {
        kind: 'defector-farming',
        defectedToReceiver: stats.quantity,
        totalLostToDesertion,
        distinctDays: stats.days.size,
        share: Math.round(assessment.share * 1000) / 1000,
        windowDays: DEFECTOR_FARMING_WINDOW_DAYS,
        reasons: assessment.reasons,
        ...(sharedLoginPattern ? { sharedLoginPattern: true } : {}),
      };

      // Deduplicated per pair, serialized by a per-pair advisory lock in a
      // small transaction around the find/update/create: two concurrent
      // detections (an overlapping cron pass retried the loser) cannot both
      // pass the findFirst with nothing there and create duplicate signals.
      // An open or acknowledged signal is bumped in place; a dismissed or
      // actioned one is never resurrected — the next qualifying pattern
      // raises a fresh signal instead. ($executeRaw, not $queryRaw:
      // pg_advisory_xact_lock returns void, which $queryRaw cannot
      // deserialize.)
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${cheatSignalLockKey(
          receiver.id,
          loserId,
          'DEFECTOR_FARMING',
        )}::bigint)`;
        const openSignal = await tx.cheatSignal.findFirst({
          where: {
            userId: receiver.id,
            relatedUserId: loserId,
            type: 'DEFECTOR_FARMING',
            status: { in: ['OPEN', 'ACKNOWLEDGED'] },
          },
          select: { id: true, score: true },
        });
        if (openSignal) {
          // The signal never weakens while open: score ratchets up and the
          // severity always matches the stored score.
          const score = Math.max(openSignal.score, assessment.score);
          await tx.cheatSignal.update({
            where: { id: openSignal.id },
            data: {
              score,
              severity: defectorFarmingSeverity(score),
              lastSeenAt: now,
              summary,
              evidence,
            },
          });
          return;
        }
        await tx.cheatSignal.create({
          data: {
            userId: receiver.id,
            relatedUserId: loserId,
            type: 'DEFECTOR_FARMING',
            severity: assessment.severity,
            score: assessment.score,
            status: 'OPEN',
            summary,
            evidence,
          },
        });
      });
    }
  }

  /**
   * Whether two accounts share a login IP or device pattern inside the
   * telemetry retention window, excluding our own proxy's address (everyone
   * logs in through it, so it is not a shared network). Targeted pair lookup
   * over the same LoginEvent data getMultiAccountClusters clusters.
   */
  private static async pairSharesLoginPattern(
    userA: number,
    userB: number,
    now: Date,
  ): Promise<boolean> {
    const since = new Date(now.getTime() - PAIR_LOGIN_WINDOW_DAYS * DAY_MS);
    const [eventsA, eventsB] = await Promise.all([
      prisma.loginEvent.findMany({
        where: { userId: userA, occurredAt: { gte: since } },
        select: { ipHash: true, deviceHash: true },
        distinct: ['ipHash', 'deviceHash'],
        orderBy: { occurredAt: 'desc' },
        take: PAIR_LOGIN_EVENT_LIMIT,
      }),
      prisma.loginEvent.findMany({
        where: { userId: userB, occurredAt: { gte: since } },
        select: { ipHash: true, deviceHash: true },
        distinct: ['ipHash', 'deviceHash'],
        orderBy: { occurredAt: 'desc' },
        take: PAIR_LOGIN_EVENT_LIMIT,
      }),
    ]);
    if (eventsA.length === 0 || eventsB.length === 0) return false;
    const proxyHashes = proxyLoginIpHashes();
    const ipsOf = (events: typeof eventsA) =>
      new Set(
        events
          .map((event) => event.ipHash)
          .filter((hash) => hash && !proxyHashes.has(hash)),
      );
    const devicesOf = (events: typeof eventsA) =>
      new Set(
        events
          .map((event) => event.deviceHash)
          .filter((hash): hash is string => hash !== null),
      );
    const [ipsA, ipsB] = [ipsOf(eventsA), ipsOf(eventsB)];
    if ([...ipsA].some((hash) => ipsB.has(hash))) return true;
    const [devicesA, devicesB] = [devicesOf(eventsA), devicesOf(eventsB)];
    return [...devicesA].some((hash) => devicesB.has(hash));
  }
}
