import { z } from 'zod';

import prisma from '@/lib/prisma';
import {
  ReportCategory,
  ReportPriority,
  ReportResolution,
  ReportStatus,
} from '@/lib/prisma-exports';

const CreateReportSchema = z.object({
  reportedUserId: z.number().int().positive(),
  category: z
    .nativeEnum(ReportCategory)
    .or(z.string().min(1))
    .transform((v) => v as ReportCategory),
  description: z.string().min(10).max(2000),
  subject: z.string().max(200).optional(),
  chatMessageId: z.number().int().positive().optional(),
  roomId: z.number().int().positive().optional(),
});

const ListReportsSchema = z.object({
  status: z.nativeEnum(ReportStatus).optional(),
  category: z.nativeEnum(ReportCategory).optional(),
  priority: z.nativeEnum(ReportPriority).optional(),
  assignedToUserId: z.coerce.number().int().optional(),
  reportedUserId: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

const AssignReportSchema = z.object({
  reportId: z.number().int().positive(),
  assignedToUserId: z.number().int().positive().optional(),
});

const ResolveReportSchema = z.object({
  reportId: z.number().int().positive(),
  resolution: z.nativeEnum(ReportResolution),
  resolutionSummary: z.string().max(2000).optional(),
});

const AddReportActionSchema = z.object({
  reportId: z.number().int().positive(),
  type: z.enum(['NOTE_ADDED', 'STATUS_CHANGED', 'PRIORITY_CHANGED']),
  body: z.string().max(2000).optional(),
  toStatus: z.nativeEnum(ReportStatus).optional(),
  toPriority: z.nativeEnum(ReportPriority).optional(),
});

/** Encapsulates report data access and domain operations. */
export class ReportService {
  static async createReport(
    reporterUserId: number,
    data: z.infer<typeof CreateReportSchema>,
  ) {
    const validated = CreateReportSchema.parse(data);

    const report = await prisma.report.create({
      data: {
        reporterUserId,
        reportedUserId: validated.reportedUserId,
        category: validated.category,
        description: validated.description,
        subject: validated.subject,
        chatMessageId: validated.chatMessageId,
        roomId: validated.roomId,
      },
    });

    await prisma.reportAction.create({
      data: {
        reportId: report.id,
        actorUserId: reporterUserId,
        type: 'CREATED',
      },
    });

    return report;
  }

  static async listReports(
    _staffUserId: number,
    filters: z.infer<typeof ListReportsSchema>,
  ) {
    const validated = ListReportsSchema.parse(filters);

    const where: Record<string, unknown> = {};
    if (validated.status) where.status = validated.status;
    if (validated.category) where.category = validated.category;
    if (validated.priority) where.priority = validated.priority;
    if (validated.assignedToUserId)
      where.assignedToUserId = validated.assignedToUserId;
    if (validated.reportedUserId)
      where.reportedUserId = validated.reportedUserId;

    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where,
        include: {
          reporter: {
            select: { id: true, display_name: true },
          },
          reportedUser: {
            select: { id: true, display_name: true },
          },
          assignedTo: {
            select: { id: true, display_name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: validated.limit,
        skip: validated.offset,
      }),
      prisma.report.count({ where }),
    ]);

    return { reports, total };
  }

  static async getReport(_staffUserId: number, reportId: number) {
    return prisma.report.findUnique({
      where: { id: reportId },
      include: {
        reporter: {
          select: { id: true, display_name: true },
        },
        reportedUser: {
          select: { id: true, display_name: true },
        },
        assignedTo: {
          select: { id: true, display_name: true },
        },
        resolvedBy: {
          select: { id: true, display_name: true },
        },
        room: {
          select: { id: true, name: true },
        },
        chatMessage: {
          select: { id: true, content: true, sentAt: true },
        },
        actions: {
          include: {
            actor: {
              select: { id: true, display_name: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  static async assignReport(
    staffUserId: number,
    data: z.infer<typeof AssignReportSchema>,
  ) {
    const validated = AssignReportSchema.parse(data);

    const report = await prisma.report.update({
      where: { id: validated.reportId },
      data: {
        assignedToUserId: validated.assignedToUserId ?? staffUserId,
        status: 'TRIAGED',
      },
    });

    await prisma.reportAction.create({
      data: {
        reportId: validated.reportId,
        actorUserId: staffUserId,
        type: 'ASSIGNED',
        body: validated.assignedToUserId
          ? `Assigned to user ${validated.assignedToUserId}`
          : 'Self-assigned',
      },
    });

    return report;
  }

  static async resolveReport(
    staffUserId: number,
    data: z.infer<typeof ResolveReportSchema>,
  ) {
    const validated = ResolveReportSchema.parse(data);

    const report = await prisma.report.update({
      where: { id: validated.reportId },
      data: {
        status: 'RESOLVED',
        resolution: validated.resolution,
        resolutionSummary: validated.resolutionSummary,
        resolvedByUserId: staffUserId,
        resolvedAt: new Date(),
      },
    });

    await prisma.reportAction.create({
      data: {
        reportId: validated.reportId,
        actorUserId: staffUserId,
        type: 'RESOLVED',
        body: validated.resolutionSummary,
        toStatus: 'RESOLVED',
      },
    });

    return report;
  }

  static async addAction(
    staffUserId: number,
    data: z.infer<typeof AddReportActionSchema>,
  ) {
    const validated = AddReportActionSchema.parse(data);

    if (validated.type === 'STATUS_CHANGED' && validated.toStatus) {
      await prisma.report.update({
        where: { id: validated.reportId },
        data: { status: validated.toStatus },
      });
    }

    if (validated.type === 'PRIORITY_CHANGED' && validated.toPriority) {
      await prisma.report.update({
        where: { id: validated.reportId },
        data: { priority: validated.toPriority },
      });
    }

    const body =
      validated.type === 'PRIORITY_CHANGED' && validated.toPriority
        ? [validated.body, `Priority changed to ${validated.toPriority}`]
            .filter(Boolean)
            .join('\n')
        : validated.body;

    return prisma.reportAction.create({
      data: {
        reportId: validated.reportId,
        actorUserId: staffUserId,
        type: validated.type,
        body,
        toStatus: validated.toStatus,
      },
    });
  }

  static async getReportStats(_staffUserId: number) {
    const [open, triaged, inReview, total] = await Promise.all([
      prisma.report.count({ where: { status: 'OPEN' } }),
      prisma.report.count({ where: { status: 'TRIAGED' } }),
      prisma.report.count({ where: { status: 'IN_REVIEW' } }),
      prisma.report.count(),
    ]);

    return { open, triaged, inReview, total };
  }
}
