import { InvestigationStatus, SignalSeverity } from '@prisma/client';

import prisma from '@/lib/prisma';

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

  static async acknowledge(staffUserId: number, signalId: number) {
    return prisma.cheatSignal.update({
      where: { id: signalId },
      data: {
        status: 'ACKNOWLEDGED',
        assignedToUserId: staffUserId,
      },
    });
  }

  static async dismiss(staffUserId: number, signalId: number) {
    return prisma.cheatSignal.update({
      where: { id: signalId },
      data: {
        status: 'DISMISSED',
        resolvedByUserId: staffUserId,
        resolvedAt: new Date(),
      },
    });
  }

  static async takeAction(staffUserId: number, signalId: number) {
    return prisma.cheatSignal.update({
      where: { id: signalId },
      data: {
        status: 'ACTION_TAKEN',
        resolvedByUserId: staffUserId,
        resolvedAt: new Date(),
      },
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

    for (const login of recentLogins) {
      if (login.ipHash) {
        if (!ipToUsers.has(login.ipHash))
          ipToUsers.set(login.ipHash, new Set());
        ipToUsers.get(login.ipHash)!.add(login.userId);
      }
      if (login.deviceHash) {
        if (!deviceToUsers.has(login.deviceHash))
          deviceToUsers.set(login.deviceHash, new Set());
        deviceToUsers.get(login.deviceHash)!.add(login.userId);
      }
    }

    const clusters: Array<{
      type: 'IP' | 'DEVICE';
      hash: string;
      userIds: number[];
      userNames: Map<number, string>;
    }> = [];

    for (const [ip, users] of ipToUsers) {
      if (users.size >= 2) {
        clusters.push({
          type: 'IP',
          hash: ip,
          userIds: Array.from(users),
          userNames: new Map(),
        });
      }
    }

    for (const [device, users] of deviceToUsers) {
      if (users.size >= 2) {
        clusters.push({
          type: 'DEVICE',
          hash: device,
          userIds: Array.from(users),
          userNames: new Map(),
        });
      }
    }

    const allUserIds = new Set(clusters.flatMap((c) => c.userIds));
    const nameMap = new Map<number, string>();
    if (allUserIds.size > 0) {
      const users = await prisma.users.findMany({
        where: { id: { in: Array.from(allUserIds) } },
        select: { id: true, display_name: true },
      });
      for (const u of users) {
        nameMap.set(u.id, u.display_name);
      }
    }
    for (const cluster of clusters) {
      cluster.userNames = nameMap;
    }

    return clusters.slice(0, limit);
  }
}
