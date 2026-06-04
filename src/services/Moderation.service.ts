import { BanAppealStatus } from '@prisma/client';
import { z } from 'zod';

import prisma from '@/lib/prisma';

const CreateAppealSchema = z.object({
  accountStatusHistoryId: z.number().int().positive(),
  subject: z.string().max(200).optional(),
  body: z.string().min(10).max(5000),
});

export class ModerationService {
  static async getBannedUsers(limit = 50, offset = 0) {
    const bannedStatuses = await prisma.accountStatusHistory.findMany({
      where: {
        status: { in: ['BANNED', 'SUSPENDED'] },
        end_date: null,
      },
      include: {
        user: {
          select: {
            id: true,
            display_name: true,
            email: true,
            last_active: true,
          },
        },
        admin: {
          select: { id: true, display_name: true },
        },
      },
      orderBy: { start_date: 'desc' },
      take: limit,
      skip: offset,
    });

    const total = await prisma.accountStatusHistory.count({
      where: {
        status: { in: ['BANNED', 'SUSPENDED'] },
        end_date: null,
      },
    });

    return { bans: bannedStatuses, total };
  }

  static async getModeratorNotes(userId: number) {
    return prisma.moderatorNote.findMany({
      where: { userId, deletedAt: null },
      include: {
        author: { select: { id: true, display_name: true } },
      },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
    });
  }

  static async addModeratorNote(
    authorUserId: number,
    targetUserId: number,
    data: {
      note: string;
      visibility?: string;
      relatedReportId?: number;
      isPinned?: boolean;
    },
  ) {
    return prisma.moderatorNote.create({
      data: {
        authorUserId,
        userId: targetUserId,
        note: data.note,
        visibility: (data.visibility as 'STAFF' | 'ADMINS_ONLY') ?? 'STAFF',
        relatedReportId: data.relatedReportId,
        isPinned: data.isPinned ?? false,
      },
    });
  }

  static async deleteModeratorNote(noteId: number) {
    return prisma.moderatorNote.update({
      where: { id: noteId },
      data: { deletedAt: new Date() },
    });
  }

  static async createBanAppeal(
    userId: number,
    data: z.infer<typeof CreateAppealSchema>,
  ) {
    const validated = CreateAppealSchema.parse(data);
    return prisma.banAppeal.create({
      data: {
        userId,
        accountStatusHistoryId: validated.accountStatusHistoryId,
        subject: validated.subject,
        body: validated.body,
      },
    });
  }

  static async listBanAppeals(filters?: { status?: BanAppealStatus }) {
    return prisma.banAppeal.findMany({
      where: filters?.status ? { status: filters.status } : undefined,
      include: {
        user: { select: { id: true, display_name: true } },
        accountStatusHistory: {
          include: {
            admin: { select: { id: true, display_name: true } },
          },
        },
        assignedTo: { select: { id: true, display_name: true } },
        decidedBy: { select: { id: true, display_name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async reviewBanAppeal(
    staffUserId: number,
    appealId: number,
    data: { status: BanAppealStatus; decisionSummary?: string },
  ) {
    return prisma.banAppeal.update({
      where: { id: appealId },
      data: {
        status: data.status,
        decisionSummary: data.decisionSummary,
        decidedByUserId: staffUserId,
        decidedAt: new Date(),
        assignedToUserId: staffUserId,
      },
    });
  }

  static async getAuditLogs(filters: {
    action?: string;
    userId?: number;
    targetUserId?: number;
    limit?: number;
    offset?: number;
  }) {
    const where: Record<string, unknown> = {};
    if (filters.action)
      where.action = { contains: filters.action, mode: 'insensitive' };
    if (filters.userId) where.userId = filters.userId;
    if (filters.targetUserId) where.targetUserId = filters.targetUserId;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { id: true, display_name: true } },
        },
        orderBy: { timestamp: 'desc' },
        take: filters.limit ?? 50,
        skip: filters.offset ?? 0,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return { logs, total };
  }
}
