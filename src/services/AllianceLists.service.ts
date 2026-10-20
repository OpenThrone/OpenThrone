import { z } from 'zod';

import type { AlliancePermissionKey } from '@/constants/alliancePermissions';
import { hasAlliancePermission } from '@/constants/alliancePermissions';
import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import { getLevelFromXP } from '@/utils/utilities';

export const ALLIANCE_LIST_TYPES = ['FARM', 'HIT', 'BLOCK'] as const;
export type AllianceListTypeName = (typeof ALLIANCE_LIST_TYPES)[number];

export const ALLIANCE_LIST_PAGE_SIZE = 25;
export const ALLIANCE_LIST_NOTE_MAX = 200;
/** The system account can never be listed. */
const SYSTEM_USER_ID = 0;

export const LOOKUP_BATCH_MAX = 100;

const ListTypeSchema = z.enum(ALLIANCE_LIST_TYPES);

const AddEntrySchema = z
  .object({
    allianceId: z.number().int().positive(),
    listType: ListTypeSchema,
    targetUserId: z.number().int().min(0).optional(),
    displayName: z.string().trim().min(1).max(100).optional(),
    note: z.string().trim().max(ALLIANCE_LIST_NOTE_MAX).optional(),
  })
  .refine((d) => d.targetUserId !== undefined || !!d.displayName, {
    message: 'Provide a target user id or display name',
  });

const BatchIdsSchema = z
  .array(z.number().int().min(0))
  .min(1)
  .max(LOOKUP_BATCH_MAX);

const RemoveEntrySchema = z.object({
  allianceId: z.number().int().positive(),
  entryId: z.number().int().positive(),
});

const ListQuerySchema = z.object({
  allianceId: z.number().int().positive(),
  listType: ListTypeSchema,
  page: z.number().int().min(1).default(1),
});

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Loads the actor's standing in an alliance and enforces a rank permission.
 * The leader holds every permission; everyone else needs a membership whose
 * role grants it. Shared with the diplomacy service.
 */
export const requireAlliancePermission = async (
  db: Db,
  allianceId: number,
  userId: number,
  key: AlliancePermissionKey,
  denied: string,
) => {
  const alliance = await db.alliances.findUnique({
    where: { id: allianceId },
    select: { id: true, name: true, leader_id: true },
  });
  if (!alliance) throw new Error('Alliance not found');
  const membership = await db.alliance_memberships.findUnique({
    where: {
      unique_alliance_user: { alliance_id: allianceId, user_id: userId },
    },
    include: { role: true },
  });
  if (!membership && alliance.leader_id !== userId) {
    throw new Error('You are not a member of this alliance');
  }
  if (
    !hasAlliancePermission(alliance.leader_id, userId, membership?.role, key)
  ) {
    throw new Error(denied);
  }
  return alliance;
};

/** Farm / Hit / Block target lists shared inside an alliance. */
export class AllianceListsService {
  static async listEntries(
    userId: number,
    input: z.input<typeof ListQuerySchema>,
  ) {
    const { allianceId, listType, page } = ListQuerySchema.parse(input);
    await requireAlliancePermission(
      prisma,
      allianceId,
      userId,
      'view_list',
      'You do not have permission to view alliance lists',
    );
    const where = { alliance_id: allianceId, list_type: listType };
    const [total, rows] = await Promise.all([
      prisma.alliance_list_entries.count({ where }),
      prisma.alliance_list_entries.findMany({
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * ALLIANCE_LIST_PAGE_SIZE,
        take: ALLIANCE_LIST_PAGE_SIZE,
        include: {
          target_user: {
            select: {
              id: true,
              display_name: true,
              experience: true,
              race: true,
            },
          },
        },
      }),
    ]);
    const adderIds = [...new Set(rows.map((row) => row.added_by))];
    const adders = adderIds.length
      ? await prisma.users.findMany({
          where: { id: { in: adderIds } },
          select: { id: true, display_name: true },
        })
      : [];
    const adderNames = new Map(adders.map((u) => [u.id, u.display_name]));
    return {
      entries: rows.map((row) => ({
        id: row.id,
        list_type: row.list_type,
        note: row.note,
        created_at: row.created_at,
        added_by: row.added_by,
        added_by_name: adderNames.get(row.added_by) ?? null,
        target_user_id: row.target_user_id,
        target_display_name: row.target_user?.display_name ?? null,
        target_level: row.target_user
          ? getLevelFromXP(row.target_user.experience)
          : null,
        target_race: row.target_user?.race ?? null,
      })),
      total,
      page,
      pageSize: ALLIANCE_LIST_PAGE_SIZE,
      totalPages: Math.max(1, Math.ceil(total / ALLIANCE_LIST_PAGE_SIZE)),
    };
  }

  static async addEntry(userId: number, input: z.input<typeof AddEntrySchema>) {
    const data = AddEntrySchema.parse(input);
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM alliances WHERE id = ${data.allianceId} FOR UPDATE`;
      const alliance = await requireAlliancePermission(
        tx,
        data.allianceId,
        userId,
        'edit_list',
        'You do not have permission to edit alliance lists',
      );

      if (data.targetUserId === SYSTEM_USER_ID) {
        throw new Error('That player cannot be added to a list');
      }
      const target =
        data.targetUserId !== undefined
          ? await tx.users.findUnique({
              where: { id: data.targetUserId },
              select: { id: true, display_name: true },
            })
          : await tx.users.findFirst({
              where: {
                display_name: { equals: data.displayName, mode: 'insensitive' },
              },
              select: { id: true, display_name: true },
            });
      if (!target || target.id === SYSTEM_USER_ID) {
        throw new Error('Player not found');
      }

      if (data.listType !== 'BLOCK') {
        const isMember = await tx.alliance_memberships.findUnique({
          where: {
            unique_alliance_user: {
              alliance_id: data.allianceId,
              user_id: target.id,
            },
          },
        });
        if (isMember || alliance.leader_id === target.id) {
          throw new Error(
            'Members of your own alliance cannot be added to the Farm or Hit list',
          );
        }
      }

      const existing = await tx.alliance_list_entries.findUnique({
        where: {
          unique_alliance_list_target: {
            alliance_id: data.allianceId,
            list_type: data.listType,
            target_user_id: target.id,
          },
        },
      });
      if (existing) throw new Error('That player is already on this list');

      return tx.alliance_list_entries.create({
        data: {
          alliance_id: data.allianceId,
          list_type: data.listType,
          target_user_id: target.id,
          note: data.note || null,
          added_by: userId,
        },
      });
    });
  }

  static async removeEntry(
    userId: number,
    input: z.input<typeof RemoveEntrySchema>,
  ) {
    const data = RemoveEntrySchema.parse(input);
    return prisma.$transaction(async (tx) => {
      await requireAlliancePermission(
        tx,
        data.allianceId,
        userId,
        'edit_list',
        'You do not have permission to edit alliance lists',
      );
      const { count } = await tx.alliance_list_entries.deleteMany({
        where: { id: data.entryId, alliance_id: data.allianceId },
      });
      if (count === 0) throw new Error('List entry not found');
      return { message: 'Removed from list' };
    });
  }

  /** The viewer's alliances where their rank grants view_list. */
  private static async viewableAlliances(userId: number) {
    const memberships = await prisma.alliance_memberships.findMany({
      where: { user_id: userId },
      include: {
        role: true,
        alliance: { select: { id: true, name: true, leader_id: true } },
      },
    });
    return memberships.filter((m) =>
      hasAlliancePermission(m.alliance.leader_id, userId, m.role, 'view_list'),
    );
  }

  /**
   * Which of the viewer's alliances list a target, and on which lists. Only
   * alliances where the viewer may view lists are reported.
   */
  static async lookupTarget(userId: number, targetUserId: number) {
    const viewable = await this.viewableAlliances(userId);
    if (viewable.length === 0) return { alliances: [] };
    const entries = await prisma.alliance_list_entries.findMany({
      where: {
        target_user_id: targetUserId,
        alliance_id: { in: viewable.map((m) => m.alliance_id) },
      },
      select: { alliance_id: true, list_type: true },
    });
    const alliances = viewable
      .map((m) => ({
        allianceId: m.alliance_id,
        allianceName: m.alliance.name,
        lists: entries
          .filter((e) => e.alliance_id === m.alliance_id)
          .map((e) => e.list_type),
      }))
      .filter((a) => a.lists.length > 0);
    return { alliances };
  }

  /**
   * Batch variant of lookupTarget: one membership query and one entry query
   * for up to LOOKUP_BATCH_MAX targets. Targets without hits are omitted.
   */
  static async lookupTargets(userId: number, targetUserIds: number[]) {
    const ids = [...new Set(BatchIdsSchema.parse(targetUserIds))];
    const result: Record<
      number,
      {
        allianceId: number;
        allianceName: string;
        lists: AllianceListTypeName[];
      }[]
    > = {};
    const viewable = await this.viewableAlliances(userId);
    if (viewable.length === 0) return result;
    const entries = await prisma.alliance_list_entries.findMany({
      where: {
        target_user_id: { in: ids },
        alliance_id: { in: viewable.map((m) => m.alliance_id) },
      },
      select: { alliance_id: true, list_type: true, target_user_id: true },
    });
    const names = new Map<number, string>(
      viewable.map((m) => [m.alliance_id, m.alliance.name]),
    );
    const grouped = new Map<string, AllianceListTypeName[]>();
    for (const e of entries) {
      const key = `${e.target_user_id}:${e.alliance_id}`;
      grouped.set(key, [...(grouped.get(key) ?? []), e.list_type]);
    }
    for (const [key, lists] of grouped) {
      const [target, alliance] = key.split(':').map(Number);
      (result[target] ??= []).push({
        allianceId: alliance,
        allianceName: names.get(alliance) ?? '',
        lists,
      });
    }
    return result;
  }
}
