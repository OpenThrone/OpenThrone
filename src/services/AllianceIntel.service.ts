import { z } from 'zod';

import type { AlliancePermissionKey } from '@/constants/alliancePermissions';
import { hasAlliancePermission } from '@/constants/alliancePermissions';
import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import { postToAllianceRoom } from '@/services/AllianceRoom.service';
import { getAttackLogViewerRole } from '@/services/AttackLogAccess.service';
import { getLevelFromXP } from '@/utils/utilities';

export const ALLIANCE_CALL_TYPES = ['HIT', 'FARM', 'RECON'] as const;
export type AllianceCallTypeName = (typeof ALLIANCE_CALL_TYPES)[number];
export const INTEL_NOTE_MAX = 200;
export const INTEL_PAGE_SIZE = 20;
const SYSTEM_USER_ID = 0;

type Db = Prisma.TransactionClient | typeof prisma;

const NoteSchema = z.string().trim().max(INTEL_NOTE_MAX).optional();

const ShareSchema = z.object({
  allianceId: z.number().int().positive(),
  attackLogId: z.number().int().positive(),
  note: NoteSchema,
  callId: z.number().int().positive().optional(),
  reportThreat: z.boolean().optional(),
});

const FeedSchema = z.object({
  allianceId: z.number().int().positive(),
  page: z.number().int().min(1).default(1),
  filter: z.enum(['all', 'threats']).default('all'),
  callId: z.number().int().positive().optional(),
});

const CreateCallSchema = z
  .object({
    allianceId: z.number().int().positive(),
    callType: z.enum(ALLIANCE_CALL_TYPES),
    targetUserId: z.number().int().min(0).optional(),
    displayName: z.string().trim().min(1).max(100).optional(),
    note: NoteSchema,
  })
  .refine((d) => d.targetUserId !== undefined || !!d.displayName, {
    message: 'Provide a target user id or display name',
  });

const CloseCallSchema = z.object({
  allianceId: z.number().int().positive(),
  callId: z.number().int().positive(),
});

const ListCallsSchema = z.object({
  allianceId: z.number().int().positive(),
  includeClosed: z.boolean().default(false),
});

const CALL_LABEL: Record<AllianceCallTypeName, string> = {
  HIT: 'Hit',
  FARM: 'Farm',
  RECON: 'Recon',
};

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
  can: (key: AlliancePermissionKey) => boolean;
}

/** Loads the actor's standing; throws unless they belong to the alliance. */
const requireMember = async (
  db: Db,
  allianceId: number,
  userId: number,
): Promise<MemberContext> => {
  const membership = await db.alliance_memberships.findUnique({
    where: {
      unique_alliance_user: { alliance_id: allianceId, user_id: userId },
    },
    include: { role: true, alliance: true },
  });
  if (!membership) throw new Error('You are not a member of this alliance');
  const { alliance } = membership;
  return {
    alliance: {
      id: alliance.id,
      name: alliance.name,
      leader_id: alliance.leader_id,
    },
    can: (key) =>
      hasAlliancePermission(alliance.leader_id, userId, membership.role, key),
  };
};

const requirePermission = async (
  db: Db,
  allianceId: number,
  userId: number,
  key: AlliancePermissionKey,
  denied: string,
) => {
  const ctx = await requireMember(db, allianceId, userId);
  if (!ctx.can(key)) throw new Error(denied);
  return ctx;
};

const PLAYER_NAME_SELECT = { id: true, display_name: true } as const;

/** Shapes share rows for the feed; resolves each report's non-member side. */
const mapShares = async (db: Db, allianceId: number, rows: any[]) => {
  const userIds = [
    ...new Set(
      rows.flatMap((row) => [
        row.attack_log.attacker_id,
        row.attack_log.defender_id,
      ]),
    ),
  ] as number[];
  const memberRows = userIds.length
    ? await db.alliance_memberships.findMany({
        where: { alliance_id: allianceId, user_id: { in: userIds } },
        select: { user_id: true },
      })
    : [];
  const memberIds = new Set(memberRows.map((m) => m.user_id));
  const sharerIds = [...new Set(rows.map((row) => row.shared_by))] as number[];
  const sharers = sharerIds.length
    ? await db.users.findMany({
        where: { id: { in: sharerIds } },
        select: PLAYER_NAME_SELECT,
      })
    : [];
  const sharerNames = new Map(sharers.map((u) => [u.id, u.display_name]));

  return rows.map((row) => {
    const log = row.attack_log;
    const candidates = [log.attacker_id, log.defender_id].filter(
      (id: number) => !memberIds.has(id),
    );
    const target =
      candidates.find((id: number) => id !== row.shared_by) ??
      candidates[0] ??
      null;
    return {
      id: row.id,
      attack_log_id: log.id,
      type: log.type === 'attack' ? 'attack' : 'spy',
      attacker_name: log.attackerPlayer?.display_name ?? null,
      defender_name: log.defenderPlayer?.display_name ?? null,
      winner: log.winner,
      timestamp: log.timestamp,
      shared_by: row.shared_by,
      shared_by_name: sharerNames.get(row.shared_by) ?? null,
      note: row.note,
      is_threat: row.is_threat,
      call_id: row.call_id,
      created_at: row.created_at,
      target_user_id: target,
      target_display_name:
        target === null
          ? null
          : target === log.attacker_id
            ? (log.attackerPlayer?.display_name ?? null)
            : (log.defenderPlayer?.display_name ?? null),
      url: `/battle/results/${log.id}`,
    };
  });
};

const SHARE_INCLUDE = {
  attack_log: {
    select: {
      id: true,
      type: true,
      attacker_id: true,
      defender_id: true,
      winner: true,
      timestamp: true,
      attackerPlayer: { select: PLAYER_NAME_SELECT },
      defenderPlayer: { select: PLAYER_NAME_SELECT },
    },
  },
} as const;

/** Intel sharing and Hit / Farm / Recon calls inside an alliance (#66). */
export class AllianceIntelService {
  /**
   * Shares a report the actor took part in with an alliance. Grants the
   * alliance read access through the existing attack_log_acl (viewers get the
   * regular 'shared' redaction) and records a feed row.
   */
  static async shareReport(userId: number, input: unknown) {
    const data = parse(ShareSchema, input);
    return prisma.$transaction(async (tx) => {
      const { alliance } = await requirePermission(
        tx,
        data.allianceId,
        userId,
        'share_reports',
        'You do not have permission to share reports with the alliance',
      );

      const log = await tx.attack_log.findUnique({
        where: { id: data.attackLogId },
        select: {
          id: true,
          attacker_id: true,
          defender_id: true,
          acl: {
            select: {
              shared_with_user_id: true,
              shared_with_alliance_id: true,
            },
          },
        },
      });
      // Only the attacker or defender may share; a log merely shared with the
      // actor cannot be passed on.
      const role = log ? await getAttackLogViewerRole(userId, log, tx) : null;
      if (!log || (role !== 'attacker' && role !== 'defender')) {
        throw new Error('Report not found');
      }
      if (data.reportThreat && role !== 'defender') {
        throw new Error('Only the defender can report a threat');
      }

      if (data.callId !== undefined) {
        const call = await tx.alliance_target_calls.findFirst({
          where: { id: data.callId, alliance_id: alliance.id },
        });
        if (!call) throw new Error('Call not found');
        if (call.status !== 'OPEN') {
          throw new Error('That call is closed');
        }
      }

      const existing = await tx.alliance_intel_shares.findUnique({
        where: {
          unique_alliance_intel_share: {
            alliance_id: alliance.id,
            attack_log_id: log.id,
          },
        },
      });
      if (existing) {
        throw new Error('That report is already shared with this alliance');
      }

      const hasAcl = (log.acl ?? []).some(
        (entry: { shared_with_alliance_id: number | null }) =>
          entry.shared_with_alliance_id === alliance.id,
      );
      if (!hasAcl) {
        await tx.attack_log_acl.create({
          data: {
            attack_log_id: log.id,
            shared_with_alliance_id: alliance.id,
          },
        });
      }

      return tx.alliance_intel_shares.create({
        data: {
          alliance_id: alliance.id,
          attack_log_id: log.id,
          shared_by: userId,
          note: data.note || null,
          call_id: data.callId ?? null,
          is_threat: data.reportThreat === true,
        },
      });
    });
  }

  /** Newest-first feed of shared reports; members only. */
  static async listFeed(userId: number, input: unknown) {
    const data = parse(FeedSchema, input);
    const { can } = await requireMember(prisma, data.allianceId, userId);
    const where: Prisma.alliance_intel_sharesWhereInput = {
      alliance_id: data.allianceId,
      ...(data.filter === 'threats' ? { is_threat: true } : {}),
      ...(data.callId !== undefined ? { call_id: data.callId } : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.alliance_intel_shares.count({ where }),
      prisma.alliance_intel_shares.findMany({
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip: (data.page - 1) * INTEL_PAGE_SIZE,
        take: INTEL_PAGE_SIZE,
        include: SHARE_INCLUDE,
      }),
    ]);
    return {
      items: await mapShares(prisma, data.allianceId, rows),
      total,
      page: data.page,
      pageSize: INTEL_PAGE_SIZE,
      totalPages: Math.max(1, Math.ceil(total / INTEL_PAGE_SIZE)),
      canShare: can('share_reports'),
      canCall: can('call_targets'),
    };
  }

  /**
   * Opens a Hit / Farm / Recon call. Hit and Farm also put the target on the
   * matching alliance list (a duplicate is ignored); every other member gets
   * an inbox message.
   */
  static async createCall(userId: number, input: unknown) {
    const data = parse(CreateCallSchema, input);
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM alliances WHERE id = ${data.allianceId} FOR UPDATE`;
      const { alliance } = await requirePermission(
        tx,
        data.allianceId,
        userId,
        'call_targets',
        'You do not have permission to call targets',
      );

      if (data.targetUserId === SYSTEM_USER_ID) {
        throw new Error('That player cannot be targeted');
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

      const targetMembership = await tx.alliance_memberships.findUnique({
        where: {
          unique_alliance_user: {
            alliance_id: alliance.id,
            user_id: target.id,
          },
        },
      });
      if (targetMembership || alliance.leader_id === target.id) {
        throw new Error('You cannot call a member of your own alliance');
      }

      const call = await tx.alliance_target_calls.create({
        data: {
          alliance_id: alliance.id,
          target_user_id: target.id,
          call_type: data.callType,
          note: data.note || null,
          created_by: userId,
        },
      });

      if (data.callType !== 'RECON') {
        const existing = await tx.alliance_list_entries.findUnique({
          where: {
            unique_alliance_list_target: {
              alliance_id: alliance.id,
              list_type: data.callType,
              target_user_id: target.id,
            },
          },
        });
        if (!existing) {
          await tx.alliance_list_entries.create({
            data: {
              alliance_id: alliance.id,
              list_type: data.callType,
              target_user_id: target.id,
              note: data.note || null,
              added_by: userId,
            },
          });
        }
      }

      const members = await tx.alliance_memberships.findMany({
        where: { alliance_id: alliance.id },
        select: { user_id: true },
      });
      const recipients = [
        ...new Set(members.map((m: { user_id: number }) => m.user_id)),
      ].filter((id) => id !== userId);
      if (recipients.length > 0) {
        const subject = `[Alliance] ${CALL_LABEL[data.callType]} call: ${target.display_name}`;
        const body = [
          `${alliance.name} has opened a ${CALL_LABEL[data.callType].toLowerCase()} call on ${target.display_name}.`,
          data.note ? `Note: ${data.note}` : '',
          `Open the Intel tab of your alliance page for details.`,
        ]
          .filter(Boolean)
          .join('\n\n');
        // Delivered to the alliance's conversation in /messaging.
        await postToAllianceRoom(tx, alliance, userId, `${subject}\n\n${body}`);
      }

      return { call, notified: recipients.length };
    });
  }

  /** Closes a call: call_targets holders, or the creator of the call. */
  static async closeCall(userId: number, input: unknown) {
    const data = parse(CloseCallSchema, input);
    return prisma.$transaction(async (tx) => {
      const { can } = await requireMember(tx, data.allianceId, userId);
      const call = await tx.alliance_target_calls.findFirst({
        where: { id: data.callId, alliance_id: data.allianceId },
      });
      if (!call) throw new Error('Call not found');
      if (!can('call_targets') && call.created_by !== userId) {
        throw new Error('You cannot close this call');
      }
      if (call.status === 'CLOSED')
        throw new Error('That call is already closed');
      return tx.alliance_target_calls.update({
        where: { id: call.id },
        data: { status: 'CLOSED', closed_at: new Date() },
      });
    });
  }

  /** Calls for members, open ones first (newest first within each group). */
  static async listCalls(userId: number, input: unknown) {
    const data = parse(ListCallsSchema, input);
    const { can } = await requireMember(prisma, data.allianceId, userId);
    const rows = await prisma.alliance_target_calls.findMany({
      where: {
        alliance_id: data.allianceId,
        ...(data.includeClosed ? {} : { status: 'OPEN' }),
      },
      orderBy: [{ status: 'asc' }, { created_at: 'desc' }, { id: 'desc' }],
      take: 100,
      include: {
        target_user: {
          select: { id: true, display_name: true, experience: true },
        },
        _count: { select: { shares: true } },
      },
    });
    const creatorIds = [...new Set(rows.map((row) => row.created_by))];
    const creators = creatorIds.length
      ? await prisma.users.findMany({
          where: { id: { in: creatorIds } },
          select: PLAYER_NAME_SELECT,
        })
      : [];
    const creatorNames = new Map(creators.map((u) => [u.id, u.display_name]));
    return {
      calls: rows.map((row) => ({
        id: row.id,
        call_type: row.call_type,
        status: row.status,
        note: row.note,
        created_by: row.created_by,
        created_by_name: creatorNames.get(row.created_by) ?? null,
        created_at: row.created_at,
        closed_at: row.closed_at,
        target_user_id: row.target_user_id,
        target_display_name: row.target_user?.display_name ?? null,
        target_level: row.target_user
          ? getLevelFromXP(row.target_user.experience)
          : null,
        report_count: row._count?.shares ?? 0,
      })),
      canCall: can('call_targets'),
    };
  }

  /** One call with its attached reports, newest first. */
  static async getCall(userId: number, input: unknown) {
    const data = parse(CloseCallSchema, input);
    await requireMember(prisma, data.allianceId, userId);
    const call = await prisma.alliance_target_calls.findFirst({
      where: { id: data.callId, alliance_id: data.allianceId },
      include: { target_user: { select: PLAYER_NAME_SELECT } },
    });
    if (!call) throw new Error('Call not found');
    const rows = await prisma.alliance_intel_shares.findMany({
      where: { alliance_id: data.allianceId, call_id: call.id },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      include: SHARE_INCLUDE,
    });
    return {
      call: {
        id: call.id,
        call_type: call.call_type,
        status: call.status,
        note: call.note,
        created_by: call.created_by,
        created_at: call.created_at,
        closed_at: call.closed_at,
        target_user_id: call.target_user_id,
        target_display_name: call.target_user?.display_name ?? null,
      },
      reports: await mapShares(prisma, data.allianceId, rows),
    };
  }

  /**
   * Which of the viewer's alliances can receive a share of this report (viewer
   * must be attacker or defender and hold share_reports). Used by the report
   * page to decide whether to show "Share with alliance".
   */
  static async getShareTargets(userId: number, attackLogId: number) {
    const log = await prisma.attack_log.findUnique({
      where: { id: attackLogId },
      select: { id: true, attacker_id: true, defender_id: true },
    });
    if (!log) return [];
    const role =
      log.attacker_id === userId
        ? 'attacker'
        : log.defender_id === userId
          ? 'defender'
          : null;
    if (!role) return [];
    const memberships = await prisma.alliance_memberships.findMany({
      where: { user_id: userId },
      include: {
        role: true,
        alliance: { select: { id: true, name: true, leader_id: true } },
      },
    });
    const allowed = memberships.filter((m) =>
      hasAlliancePermission(
        m.alliance.leader_id,
        userId,
        m.role,
        'share_reports',
      ),
    );
    if (allowed.length === 0) return [];
    const shared = await prisma.alliance_intel_shares.findMany({
      where: {
        attack_log_id: log.id,
        alliance_id: { in: allowed.map((m) => m.alliance_id) },
      },
      select: { alliance_id: true },
    });
    const sharedIds = new Set(shared.map((s) => s.alliance_id));
    return allowed.map((m) => ({
      allianceId: m.alliance_id,
      allianceName: m.alliance.name,
      alreadyShared: sharedIds.has(m.alliance_id),
      canReportThreat: role === 'defender',
    }));
  }
}
