import { z } from 'zod';

import prisma from '@/lib/prisma';

export const INTERNAL_BATTLES_PAGE_SIZE = 20;

const ListSchema = z.object({
  allianceId: z.number().int().positive(),
  page: z.number().int().min(1).default(1),
});

/** One attack between two current members of the same alliance. */
export interface InternalBattle {
  id: number;
  timestamp: Date | null;
  attacker: { id: number; display_name: string };
  defender: { id: number; display_name: string };
  winner: number;
  /** Plain decimal string (not the `123n` form stringifyObj gives BigInts). */
  pillaged_gold: string;
}

/**
 * Friendly-fire log: attacks during the current era where both the attacker
 * and the defender are current members of the alliance. Members only.
 */
export class AllianceInternalBattlesService {
  static async list(userId: number, input: unknown) {
    const parsed = ListSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? 'Invalid input');
    }
    const { allianceId, page } = parsed.data;

    const members = await prisma.alliance_memberships.findMany({
      where: { alliance_id: allianceId },
      select: { user_id: true },
    });
    const memberIds = members.map((member) => member.user_id);
    if (!memberIds.includes(userId)) {
      throw new Error('You are not a member of this alliance');
    }

    const pageSize = INTERNAL_BATTLES_PAGE_SIZE;
    // A lone member cannot have fought a fellow member.
    if (memberIds.length < 2) {
      return { items: [] as InternalBattle[], total: 0, page, pageSize };
    }

    const activeEra = await prisma.era.findFirst({
      where: { endDate: null },
      orderBy: { startDate: 'desc' },
      select: { startDate: true },
    });
    const where = {
      type: 'attack',
      attacker_id: { in: memberIds },
      defender_id: { in: memberIds },
      ...(activeEra?.startDate
        ? { timestamp: { gte: activeEra.startDate } }
        : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.attack_log.count({ where }),
      prisma.attack_log.findMany({
        where,
        orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          timestamp: true,
          winner: true,
          pillaged_gold: true,
          attackerPlayer: { select: { id: true, display_name: true } },
          defenderPlayer: { select: { id: true, display_name: true } },
        },
      }),
    ]);

    const items: InternalBattle[] = rows.map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      attacker: row.attackerPlayer,
      defender: row.defenderPlayer,
      winner: row.winner,
      pillaged_gold: BigInt(row.pillaged_gold ?? 0).toString(),
    }));
    return { items, total, page, pageSize };
  }
}
