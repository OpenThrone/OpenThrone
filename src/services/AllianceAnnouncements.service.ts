import { z } from 'zod';

import { hasAlliancePermission } from '@/constants/alliancePermissions';
import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import { logError } from '@/utils/logger';

export const ANNOUNCEMENT_TITLE_MAX = 120;
export const ANNOUNCEMENT_BODY_MAX = 4000;
export const ANNOUNCEMENTS_PER_DAY = 10;
export const ANNOUNCEMENTS_PAGE_SIZE_MAX = 50;

const DAY_MS = 24 * 60 * 60 * 1000;

const CreateSchema = z.object({
  allianceId: z.number().int().positive(),
  title: z.string().trim().min(1).max(ANNOUNCEMENT_TITLE_MAX),
  body: z.string().trim().min(1).max(ANNOUNCEMENT_BODY_MAX),
});

const ListSchema = z.object({
  allianceId: z.number().int().positive(),
  page: z.number().int().min(1).default(1),
  pageSize: z
    .number()
    .int()
    .min(1)
    .max(ANNOUNCEMENTS_PAGE_SIZE_MAX)
    .default(10),
});

const TargetSchema = z.object({
  allianceId: z.number().int().positive(),
  announcementId: z.number().int().positive(),
});

const PinSchema = TargetSchema.extend({ pinned: z.boolean() });

/** Normalises newlines and strips control characters so the body stays plain text. */
const toPlainText = (value: string): string =>
  value
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();

const parse = <T extends z.ZodTypeAny>(
  schema: T,
  input: unknown,
): z.infer<T> => {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? 'Invalid input');
  }
  return result.data;
};

interface MemberContext {
  alliance: { id: number; name: string; leader_id: number };
  canPost: boolean;
}

export class AllianceAnnouncementsService {
  /** Loads the viewer's membership; throws unless they belong to the alliance. */
  private static async requireMember(
    db: Prisma.TransactionClient,
    allianceId: number,
    userId: number,
  ): Promise<MemberContext> {
    const membership = await db.alliance_memberships.findUnique({
      where: {
        unique_alliance_user: { alliance_id: allianceId, user_id: userId },
      },
      include: { role: true, alliance: true },
    });
    if (!membership) {
      throw new Error('You are not a member of this alliance');
    }
    const { alliance } = membership;
    return {
      alliance: {
        id: alliance.id,
        name: alliance.name,
        leader_id: alliance.leader_id,
      },
      canPost: hasAlliancePermission(
        alliance.leader_id,
        userId,
        membership.role,
        'post_announcements',
      ),
    };
  }

  /**
   * Posts an announcement and delivers it to every other member's inbox
   * (the `messages` table, sent from the author) in the same transaction.
   */
  static async create(userId: number, input: unknown) {
    const data = parse(CreateSchema, input);
    const title = toPlainText(data.title);
    const body = toPlainText(data.body);
    if (!title || !body) throw new Error('Title and body are required');

    try {
      return await prisma.$transaction(async (tx) => {
        const { alliance, canPost } = await this.requireMember(
          tx,
          data.allianceId,
          userId,
        );
        if (!canPost) {
          throw new Error('You do not have permission to post announcements');
        }

        // Soft-deleted posts still count, so deleting cannot bypass the limit.
        const recent = await tx.alliance_announcements.count({
          where: {
            alliance_id: alliance.id,
            created_at: { gte: new Date(Date.now() - DAY_MS) },
          },
        });
        if (recent >= ANNOUNCEMENTS_PER_DAY) {
          throw new Error(
            `Daily announcement limit reached (${ANNOUNCEMENTS_PER_DAY} per 24 hours)`,
          );
        }

        const announcement = await tx.alliance_announcements.create({
          data: { alliance_id: alliance.id, author_id: userId, title, body },
        });

        const members = await tx.alliance_memberships.findMany({
          where: { alliance_id: alliance.id },
          select: { user_id: true },
        });
        const recipients = [
          ...new Set(members.map((m: { user_id: number }) => m.user_id)),
        ].filter((id) => id !== userId);

        if (recipients.length > 0) {
          await tx.messages.createMany({
            data: recipients.map((toUserId) => ({
              from_user_id: userId,
              to_user_id: toUserId,
              subject: `[${alliance.name}] ${title}`.slice(0, 200),
              body,
            })),
          });
        }

        return { announcement, delivered: recipients.length };
      });
    } catch (error) {
      logError('Error creating alliance announcement', { userId, error });
      throw error;
    }
  }

  /** Lists announcements for members: pinned first, then newest. */
  static async list(userId: number, input: unknown) {
    const data = parse(ListSchema, input);
    const { canPost } = await this.requireMember(
      prisma as unknown as Prisma.TransactionClient,
      data.allianceId,
      userId,
    );
    const where = { alliance_id: data.allianceId, deleted_at: null };
    const [total, items] = await Promise.all([
      prisma.alliance_announcements.count({ where }),
      prisma.alliance_announcements.findMany({
        where,
        orderBy: [{ pinned: 'desc' }, { created_at: 'desc' }, { id: 'desc' }],
        skip: (data.page - 1) * data.pageSize,
        take: data.pageSize,
        include: { author: { select: { id: true, display_name: true } } },
      }),
    ]);
    return { items, total, page: data.page, pageSize: data.pageSize, canPost };
  }

  /** Pins or unpins an announcement (post_announcements). */
  static async setPinned(userId: number, input: unknown) {
    const data = parse(PinSchema, input);
    const { canPost } = await this.requireMember(
      prisma as unknown as Prisma.TransactionClient,
      data.allianceId,
      userId,
    );
    if (!canPost) {
      throw new Error('You do not have permission to pin announcements');
    }
    const existing = await this.findLive(data.allianceId, data.announcementId);
    return prisma.alliance_announcements.update({
      where: { id: existing.id },
      data: { pinned: data.pinned },
    });
  }

  /** Soft-deletes: post_announcements holders, or the author their own. */
  static async remove(userId: number, input: unknown) {
    const data = parse(TargetSchema, input);
    const { canPost } = await this.requireMember(
      prisma as unknown as Prisma.TransactionClient,
      data.allianceId,
      userId,
    );
    const existing = await this.findLive(data.allianceId, data.announcementId);
    if (!canPost && existing.author_id !== userId) {
      throw new Error('You cannot delete this announcement');
    }
    return prisma.alliance_announcements.update({
      where: { id: existing.id },
      data: { deleted_at: new Date(), pinned: false },
    });
  }

  private static async findLive(allianceId: number, announcementId: number) {
    const existing = await prisma.alliance_announcements.findFirst({
      where: { id: announcementId, alliance_id: allianceId, deleted_at: null },
    });
    if (!existing) throw new Error('Announcement not found');
    return existing;
  }
}
