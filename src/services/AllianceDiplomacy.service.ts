import { z } from 'zod';

import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import { requireAlliancePermission } from '@/services/AllianceLists.service';

const SendRequestSchema = z.object({
  allianceId: z.number().int().positive(),
  targetAllianceId: z.number().int().positive(),
});
const RespondSchema = z.object({
  allianceId: z.number().int().positive(),
  relationId: z.number().int().positive(),
  accept: z.boolean(),
});
const RemoveSchema = z.object({
  allianceId: z.number().int().positive(),
  relationId: z.number().int().positive(),
});

export const ALLIANCE_SEARCH_MIN = 2;
export const ALLIANCE_SEARCH_MAX_RESULTS = 20;

const SearchSchema = z.object({
  q: z.string().trim().min(ALLIANCE_SEARCH_MIN).max(50),
  excludeId: z.number().int().positive().optional(),
});

const DENIED = 'You do not have permission to manage allies';
/** Wars in these states block an alliance between the two sides. */
const BLOCKING_WAR_STATUSES = ['WARMUP', 'ACTIVE'] as const;

/** Locks both alliance rows in ascending id order so concurrent writes cannot deadlock. */
const lockAlliances = async (
  tx: Prisma.TransactionClient,
  a: number,
  b: number,
) => {
  for (const id of [...new Set([a, b])].sort((x, y) => x - y)) {
    await tx.$queryRaw`SELECT id FROM alliances WHERE id = ${id} FOR UPDATE`;
  }
};

const assertNoWar = async (
  tx: Prisma.TransactionClient,
  a: number,
  b: number,
) => {
  const war = await tx.alliance_wars.findFirst({
    where: {
      status: { in: [...BLOCKING_WAR_STATUSES] },
      OR: [
        { attacker_alliance_id: a, defender_alliance_id: b },
        { attacker_alliance_id: b, defender_alliance_id: a },
      ],
    },
    select: { id: true },
  });
  if (war) throw new Error('You cannot ally an alliance you are at war with');
};

/** Ally requests and relations between alliances. */
export class AllianceDiplomacyService {
  static async listRelations(userId: number, allianceId: number) {
    const alliance = await prisma.alliances.findUnique({
      where: { id: allianceId },
      select: { id: true, leader_id: true },
    });
    if (!alliance) throw new Error('Alliance not found');
    const membership = await prisma.alliance_memberships.findUnique({
      where: {
        unique_alliance_user: { alliance_id: allianceId, user_id: userId },
      },
    });
    if (!membership && alliance.leader_id !== userId) {
      throw new Error('You are not a member of this alliance');
    }
    const rows = await prisma.alliance_relations.findMany({
      where: {
        OR: [{ alliance_id: allianceId }, { other_alliance_id: allianceId }],
      },
      include: {
        alliance: { select: { id: true, name: true, avatar: true } },
        other_alliance: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: { created_at: 'desc' },
    });
    const all = rows.map((row) => {
      const outgoing = row.alliance_id === allianceId;
      const other = outgoing ? row.other_alliance : row.alliance;
      return {
        id: row.id,
        status: row.status,
        outgoing,
        created_at: row.created_at,
        accepted_at: row.accepted_at,
        other_alliance_id: other.id,
        other_alliance_name: other.name,
        other_alliance_avatar: other.avatar,
      };
    });
    return {
      allies: all.filter((r) => r.status === 'ACTIVE'),
      incoming: all.filter((r) => r.status === 'PENDING' && !r.outgoing),
      outgoing: all.filter((r) => r.status === 'PENDING' && r.outgoing),
    };
  }

  static async sendRequest(
    userId: number,
    input: z.input<typeof SendRequestSchema>,
  ) {
    const { allianceId, targetAllianceId } = SendRequestSchema.parse(input);
    return prisma.$transaction(async (tx) => {
      await lockAlliances(tx, allianceId, targetAllianceId);
      await requireAlliancePermission(
        tx,
        allianceId,
        userId,
        'manage_allies',
        DENIED,
      );
      if (allianceId === targetAllianceId) {
        throw new Error('An alliance cannot ally itself');
      }
      const target = await tx.alliances.findUnique({
        where: { id: targetAllianceId },
        select: { id: true },
      });
      if (!target) throw new Error('Target alliance not found');

      const existing = await tx.alliance_relations.findFirst({
        where: {
          OR: [
            { alliance_id: allianceId, other_alliance_id: targetAllianceId },
            { alliance_id: targetAllianceId, other_alliance_id: allianceId },
          ],
        },
      });
      if (existing) {
        throw new Error(
          existing.status === 'ACTIVE'
            ? 'You are already allied with that alliance'
            : 'An ally request between these alliances is already pending',
        );
      }
      await assertNoWar(tx, allianceId, targetAllianceId);

      return tx.alliance_relations.create({
        data: {
          alliance_id: allianceId,
          other_alliance_id: targetAllianceId,
          requested_by: userId,
          status: 'PENDING',
        },
      });
    });
  }

  /** The receiving alliance accepts or declines an incoming request. */
  static async respond(userId: number, input: z.input<typeof RespondSchema>) {
    const { allianceId, relationId, accept } = RespondSchema.parse(input);
    return prisma.$transaction(async (tx) => {
      const relation = await tx.alliance_relations.findFirst({
        where: {
          id: relationId,
          other_alliance_id: allianceId,
          status: 'PENDING',
        },
      });
      if (!relation) throw new Error('Ally request not found');
      await lockAlliances(tx, relation.alliance_id, allianceId);
      await requireAlliancePermission(
        tx,
        allianceId,
        userId,
        'manage_allies',
        DENIED,
      );

      if (!accept) {
        await tx.alliance_relations.delete({ where: { id: relation.id } });
        return { message: 'Ally request declined' };
      }
      await assertNoWar(tx, relation.alliance_id, allianceId);
      await tx.alliance_relations.update({
        where: { id: relation.id },
        data: { status: 'ACTIVE', accepted_at: new Date() },
      });
      return { message: 'Alliance formed' };
    });
  }

  /** Cancels an outgoing request or breaks an active alliance (either side). */
  static async remove(userId: number, input: z.input<typeof RemoveSchema>) {
    const { allianceId, relationId } = RemoveSchema.parse(input);
    return prisma.$transaction(async (tx) => {
      const relation = await tx.alliance_relations.findFirst({
        where: {
          id: relationId,
          OR: [{ alliance_id: allianceId }, { other_alliance_id: allianceId }],
        },
      });
      if (!relation) throw new Error('Relation not found');
      await lockAlliances(tx, relation.alliance_id, relation.other_alliance_id);
      await requireAlliancePermission(
        tx,
        allianceId,
        userId,
        'manage_allies',
        DENIED,
      );
      if (
        relation.status === 'PENDING' &&
        relation.other_alliance_id === allianceId
      ) {
        throw new Error('Decline incoming requests instead of cancelling them');
      }
      await tx.alliance_relations.delete({ where: { id: relation.id } });
      return {
        message:
          relation.status === 'ACTIVE'
            ? 'Alliance broken'
            : 'Ally request cancelled',
      };
    });
  }

  /**
   * Lean name search used by the ally request picker. Returns only public
   * identifiers (never bank balances or other private columns).
   */
  static async searchByName(input: z.input<typeof SearchSchema>) {
    const { q, excludeId } = SearchSchema.parse(input);
    const rows = await prisma.alliances.findMany({
      where: {
        name: { contains: q, mode: 'insensitive' },
        ...(excludeId !== undefined ? { id: { not: excludeId } } : {}),
      },
      select: {
        id: true,
        name: true,
        leader: { select: { display_name: true } },
        _count: { select: { members: true } },
      },
      orderBy: { name: 'asc' },
      take: ALLIANCE_SEARCH_MAX_RESULTS,
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      memberCount: r._count.members,
      leaderName: r.leader?.display_name ?? null,
    }));
  }
}
