import prisma from '@/lib/prisma';
import { InvestigationStatus, SignalSeverity } from '@/lib/prisma-exports';
import { proxyLoginIpHashes } from '@/services/LoginTelemetry.service';
import { logActionStrict } from '@/utils/auditLogger';

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
}
