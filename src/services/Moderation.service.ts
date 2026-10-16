import { z } from 'zod';

import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import { BanAppealStatus } from '@/lib/prisma-exports';
import { logActionStrict } from '@/utils/auditLogger';
import { checkStaffTargetAction } from '@/utils/authorization';

const CreateAppealSchema = z.object({
  accountStatusHistoryId: z.number().int().positive(),
  subject: z.string().max(200).optional(),
  body: z.string().min(10).max(5000),
});

export class ModerationActionError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Upper bound on ban appeals returned by one listing. */
export const BAN_APPEAL_LIST_LIMIT = 200;

/** Encapsulates moderation data access and domain operations. */
export class ModerationService {
  static async getBannedUsers(limit = 50, offset = 0) {
    const now = new Date();
    const where = {
      status: { in: ['BANNED', 'SUSPENDED'] as const },
      start_date: { lte: now },
      OR: [{ end_date: null }, { end_date: { gt: now } }],
    };
    const bannedStatuses = await prisma.accountStatusHistory.findMany({
      where,
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
      where,
    });

    return { bans: bannedStatuses, total };
  }

  static async getModeratorNotes(userId: number, canViewAdminsOnly = false) {
    return prisma.moderatorNote.findMany({
      where: {
        userId,
        deletedAt: null,
        ...(!canViewAdminsOnly ? { visibility: 'STAFF' } : {}),
      },
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

  static async deleteModeratorNote(
    noteId: number,
    userId: number,
    canDeleteAdminsOnly = false,
  ) {
    return prisma.moderatorNote.updateMany({
      where: {
        id: noteId,
        userId,
        deletedAt: null,
        ...(!canDeleteAdminsOnly ? { visibility: 'STAFF' } : {}),
      },
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

  static async listBanAppeals(filters?: {
    status?: BanAppealStatus;
    limit?: number;
    offset?: number;
  }) {
    const where = filters?.status ? { status: filters.status } : undefined;
    const appeals = await prisma.banAppeal.findMany({
      where,
      take: Math.min(Math.max(filters?.limit ?? 50, 1), BAN_APPEAL_LIST_LIMIT),
      skip: Math.max(filters?.offset ?? 0, 0),
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
    const total =
      typeof prisma.banAppeal.count === 'function'
        ? await prisma.banAppeal.count({ where })
        : appeals.length;
    return { appeals, total };
  }

  static async reviewBanAppeal(
    staffUserId: number,
    appealId: number,
    data: { status: BanAppealStatus; decisionSummary?: string },
    ip?: string,
  ) {
    return prisma.$transaction(async (tx) => {
      const appeal = await tx.banAppeal.findUnique({
        where: { id: appealId },
        select: { id: true, userId: true, accountStatusHistoryId: true },
      });
      if (!appeal) throw new ModerationActionError('Appeal not found', 404);
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${appeal.userId} FOR UPDATE`;
      const denial = await checkStaffTargetAction(staffUserId, appeal.userId, {
        client: tx,
      });
      if (denial) throw new ModerationActionError(denial.error, denial.status);

      const now = new Date();
      if (data.status === 'ACCEPTED') {
        const currentRestriction = await tx.accountStatusHistory.findFirst({
          where: {
            user_id: appeal.userId,
            start_date: { lte: now },
            OR: [{ end_date: null }, { end_date: { gt: now } }],
          },
          orderBy: { start_date: 'desc' },
          select: { id: true, status: true },
        });
        if (
          currentRestriction?.id !== appeal.accountStatusHistoryId ||
          !['BANNED', 'SUSPENDED'].includes(currentRestriction?.status ?? '')
        ) {
          throw new ModerationActionError(
            'Appeal penalty is no longer the current active restriction',
            409,
          );
        }
        const lifted = await tx.accountStatusHistory.updateMany({
          where: {
            id: appeal.accountStatusHistoryId,
            user_id: appeal.userId,
            status: { in: ['BANNED', 'SUSPENDED'] },
            start_date: { lte: now },
            OR: [{ end_date: null }, { end_date: { gt: now } }],
          },
          data: { end_date: now },
        });
        if (lifted.count !== 1) {
          throw new ModerationActionError(
            'Appeal penalty changed before it could be lifted',
            409,
          );
        }
      }
      const updated = await tx.banAppeal.update({
        where: { id: appealId },
        data: {
          status: data.status,
          decisionSummary: data.decisionSummary,
          decidedByUserId: staffUserId,
          decidedAt: now,
          assignedToUserId: staffUserId,
        },
      });
      await logActionStrict(
        {
          userId: staffUserId,
          action: 'MOD_BAN_APPEAL_REVIEW',
          ip,
          targetUserId: appeal.userId,
          details: {
            appealId,
            status: data.status,
            liftedAccountStatusHistoryId:
              data.status === 'ACCEPTED' ? appeal.accountStatusHistoryId : null,
          },
        },
        tx,
      );
      return updated;
    });
  }

  static async getAuditLogs(filters: {
    action?: string;
    userId?: number;
    targetUserId?: number;
    limit?: number;
    offset?: number;
  }) {
    const where: Prisma.AuditLogWhereInput = {};
    if (filters.action)
      where.action = { contains: filters.action, mode: 'insensitive' };
    if (filters.userId) where.userId = filters.userId;
    if (filters.targetUserId) {
      // Legacy rows kept the target only in JSON; prefer the indexed column
      // when present, and accept both historical numeric and string values.
      where.OR = [
        { targetUserId: filters.targetUserId },
        {
          targetUserId: null,
          OR: [
            {
              details: { path: ['targetUserId'], equals: filters.targetUserId },
            },
            {
              details: {
                path: ['targetUserId'],
                equals: String(filters.targetUserId),
              },
            },
          ],
        },
      ];
    }

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
