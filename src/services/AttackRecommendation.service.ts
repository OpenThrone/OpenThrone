import prisma from '@/lib/prisma';
import { BattleUser } from '@/models/BattleUser';
import { getUserById } from '@/services/AttackDataService';
import {
  ATTACK_LOG_ACL_SELECT,
  getAttackLogViewerRole,
  getCurrentAllianceIds,
  readableAttackLogWhere,
  redactAttackLogForViewer,
} from '@/services/AttackLogAccess.service';
import {
  assessAttackRecommendation,
  type BattleRecommendationFacts,
  RECOMMENDATION_HISTORY_MS,
  type RecommendationEvidence,
} from '@/utils/attackRecommendation';

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export async function getAttackRecommendation(
  viewerId: number,
  targetId: number,
) {
  const now = new Date();
  const [era, alliances, viewer, targetPresence] = await Promise.all([
    prisma.era.findFirst({
      where: { endDate: null },
      orderBy: { startDate: 'desc' },
    }),
    getCurrentAllianceIds(viewerId),
    getUserById(viewerId),
    // last_active is already public on the battle target list. No defender stats.
    prisma.users.findUnique({
      where: { id: targetId },
      select: { last_active: true },
    }),
  ]);
  if (!era || !viewer || targetId === viewerId)
    return assessAttackRecommendation([], 0, now.getTime());
  const reports = await prisma.attack_log.findMany({
    where: {
      AND: [
        readableAttackLogWhere(viewerId, alliances),
        // Only rows that can become evidence, so unrelated shares cannot fill `take`.
        {
          OR: [
            { type: 'attack', attacker_id: viewerId, defender_id: targetId },
            { type: { not: 'attack' }, defender_id: targetId },
          ],
        },
      ],
      timestamp: {
        gte: new Date(
          Math.max(
            era.startDate.getTime(),
            now.getTime() - RECOMMENDATION_HISTORY_MS,
          ),
        ),
        lte: now,
      },
    },
    include: { acl: { select: ATTACK_LOG_ACL_SELECT } },
    orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
    take: 50,
  });
  const evidence: RecommendationEvidence[] = [];
  for (const report of reports) {
    // Recheck against this request's memberships; never extract from raw stats.
    const role = await getAttackLogViewerRole(
      viewerId,
      report,
      prisma,
      alliances,
    );
    if (!role) continue;
    const visible = redactAttackLogForViewer(report, role);
    if (!visible.timestamp) continue;
    if (visible.type === 'attack') {
      // Only this player's own attacks against this target are comparable outcomes.
      if (visible.attacker_id !== viewerId || visible.defender_id !== targetId)
        continue;
      evidence.push({
        id: visible.id,
        timestamp: visible.timestamp,
        kind: 'battle',
        battle: visible.stats
          .recommendation_facts as unknown as BattleRecommendationFacts,
        defense: null,
        won:
          visible.winner === viewerId
            ? true
            : visible.winner === targetId
              ? false
              : null,
      });
    } else if (visible.defender_id === targetId) {
      const spy = record(visible.stats.spyResults);
      const intel = record(spy.intelligenceGathered);
      if (
        spy.success !== true ||
        typeof intel.defense !== 'number' ||
        !Number.isFinite(intel.defense) ||
        intel.defense < 0
      )
        continue;
      evidence.push({
        id: visible.id,
        timestamp: visible.timestamp,
        kind: 'intel',
        defense: intel.defense,
        won: null,
      });
    }
  }
  const attacker = new BattleUser(viewer);
  const lastActive = targetPresence?.last_active
    ? new Date(targetPresence.last_active).getTime()
    : null;
  return assessAttackRecommendation(
    evidence,
    attacker.offense,
    now.getTime(),
    lastActive,
    [...attacker.units, ...attacker.mercenaries]
      .filter((unit) => unit.type === 'OFFENSE')
      .reduce((sum, unit) => sum + unit.quantity, 0),
  );
}
