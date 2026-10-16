import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { PermissionType, Prisma } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';
import { getOTStartDate } from '@/utils/timefunctions';

export const ACTIVITY_CATEGORIES = [
  'training',
  'recruiting',
  'equipment',
  'upgrades',
  'banking',
  'combat',
  'social',
  'other',
] as const;
const QuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((value) => [7, 30, 90].includes(value))
    .default(30),
  playerId: z.coerce.number().int().positive().optional(),
  category: z.enum(ACTIVITY_CATEGORIES).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce
    .number()
    .refine((value) => [10, 25, 50].includes(value))
    .default(25),
  sortDirection: z.enum(['asc', 'desc']).default('desc'),
  playerPage: z.coerce.number().int().min(1).max(10000).default(1),
  playerPageSize: z.coerce
    .number()
    .refine((value) => [10, 25, 50].includes(value))
    .default(10),
  playerSortDirection: z.enum(['asc', 'desc']).default('desc'),
});
const guard = withApiGuard({
  methods: ['GET'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.VIEW_ANALYTICS],
  rateLimitProfile: 'admin',
  querySchema: QuerySchema,
});

/** Existing durable records only; no inferred page visits or automated rewards. */
export function activityEvents(since: Date) {
  return Prisma.sql`
    WITH events AS (
      SELECT 'bank:' || id AS key, CASE WHEN from_user_id > 0 THEN from_user_id ELSE to_user_id END AS actor,
        date_time AS at,
        CASE WHEN stats->>'type' LIKE 'TRAINING_%' OR stats->>'type' = 'HIRE_MERCENARY' THEN 'training'
          WHEN stats->>'type' LIKE 'ARMORY_%' THEN 'equipment'
          WHEN stats->>'type' LIKE '%_UPGRADE' OR stats->>'type' LIKE 'BATTLE_UPGRADES_%' OR history_type = 'FORT_REPAIR' THEN 'upgrades'
          WHEN history_type IN ('FRIEND_TRANSFER', 'FRIEND_REQUEST') THEN 'social'
          WHEN history_type = 'PLAYER_TRANSFER' THEN 'banking' ELSE 'other' END AS category,
        COALESCE(stats->>'type', history_type) AS action,
        gold_amount::text AS gold, CASE WHEN history_type IN ('FRIEND_TRANSFER', 'FRIEND_REQUEST') THEN to_user_id ELSE NULL::int END AS target, NULL::int AS attack_id
      FROM bank_history
      WHERE date_time >= ${since} AND history_type IN ('SALE', 'PLAYER_TRANSFER', 'FRIEND_TRANSFER', 'FRIEND_REQUEST', 'FORT_REPAIR')
        AND COALESCE(stats->>'transferType', '') <> 'FRIEND_TRANSFER_TAX'
      UNION ALL
      SELECT 'recruit:' || id, to_user, timestamp, 'recruiting', 'RECRUIT', NULL, from_user, NULL
      FROM recruit_history WHERE timestamp >= ${since} AND from_user > 0
      UNION ALL
      SELECT 'combat:' || id, attacker_id, timestamp, 'combat', type, pillaged_gold::text, defender_id, id
      FROM attack_log WHERE timestamp >= ${since}
      UNION ALL
      SELECT 'message:' || id, from_user_id, COALESCE(created_date, date_time), 'social', 'MESSAGE_SENT', NULL, NULL, NULL
      FROM messages WHERE COALESCE(created_date, date_time) >= ${since}
      UNION ALL
      SELECT 'chat:' || id, "senderId", "sentAt", 'social', 'CHAT_SENT', NULL, NULL, NULL
      FROM "ChatMessage" WHERE "sentAt" >= ${since}
      UNION ALL
      SELECT 'reaction:' || id, "userId", "createdAt", 'social', 'CHAT_REACTION', NULL, NULL, NULL
      FROM "ChatMessageReaction" WHERE "createdAt" >= ${since}
      UNION ALL
      SELECT 'alliance-request:' || id, user_id, created_at, 'social', 'ALLIANCE_REQUEST', NULL, NULL, NULL
      FROM alliance_join_requests WHERE created_at >= ${since}
      UNION ALL
      SELECT 'alliance-bank:' || id, performed_by_user_id, created_at, 'social',
        'ALLIANCE_' || transaction_type::text, amount::text, NULL, NULL
      FROM alliance_bank_history WHERE created_at >= ${since} AND transaction_type::text IN ('DEPOSIT', 'WITHDRAWAL', 'LOAN')
    ), filtered AS (
      SELECT events.*, users.display_name FROM events JOIN users ON users.id = events.actor WHERE actor > 0
    )`;
}

async function handler(
  _req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { query: z.infer<typeof QuerySchema> },
) {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const {
      days,
      playerId,
      category,
      page,
      pageSize,
      sortDirection,
      playerPage,
      playerPageSize,
      playerSortDirection,
    } = context.query;
    const direction =
      sortDirection === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    const playerDirection =
      playerSortDirection === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    const since = getOTStartDate(-(days - 1));
    const cte = activityEvents(since);
    const filter = Prisma.sql`WHERE (${playerId ?? null}::int IS NULL OR actor = ${playerId ?? null}) AND (${category ?? null}::text IS NULL OR category = ${category ?? null})`;
    const query = <T>(sql: Prisma.Sql): Promise<T> => prisma.$queryRaw(sql);
    const [breakdown, players, recent, counts] = await Promise.all([
      query<Array<{ category: string; actions: bigint; players: bigint }>>(
        Prisma.sql`${cte} SELECT category, COUNT(*) AS actions, COUNT(DISTINCT actor) AS players FROM filtered ${filter} GROUP BY category ORDER BY actions DESC`,
      ),
      query<
        Array<{
          actor: number;
          display_name: string;
          category: string;
          actions: bigint;
          last_at: Date;
        }>
      >(
        Prisma.sql`${cte}, leaders AS (SELECT actor AS leader_id FROM filtered ${filter} GROUP BY actor ORDER BY MAX(at) ${playerDirection}, actor LIMIT ${playerPageSize} OFFSET ${(playerPage - 1) * playerPageSize}) SELECT f.actor, f.display_name, f.category, COUNT(*) AS actions, MAX(f.at) AS last_at FROM filtered f JOIN leaders l ON f.actor = l.leader_id ${filter} GROUP BY f.actor, f.display_name, f.category ORDER BY f.actor, f.category`,
      ),
      query<
        Array<{
          key: string;
          actor: number;
          display_name: string;
          at: Date;
          category: string;
          action: string;
          gold: string | null;
          target: number | null;
          attack_id: number | null;
        }>
      >(
        Prisma.sql`${cte} SELECT * FROM filtered ${filter} ORDER BY at ${direction}, key ${direction} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      ),
      query<Array<{ total: bigint; players: bigint }>>(
        Prisma.sql`${cte} SELECT COUNT(*) AS total, COUNT(DISTINCT actor) AS players FROM filtered ${filter}`,
      ),
    ]);
    return res.status(200).json({
      since: since.toISOString(),
      days,
      page,
      pageSize,
      sortDirection,
      playerPage,
      playerPageSize,
      total: Number(counts[0]?.total ?? 0),
      activePlayers: Number(counts[0]?.players ?? 0),
      breakdown: breakdown.map((row) => ({
        ...row,
        actions: Number(row.actions),
        players: Number(row.players),
      })),
      players: players.map((row) => ({
        ...row,
        actions: Number(row.actions),
      })),
      recent,
    });
  } catch (error) {
    logError('Failed to load player activity analytics', error);
    return res.status(500).json({ error: 'Failed to load player activity' });
  }
}
export default guard(handler);
