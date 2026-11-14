import { z } from 'zod';

import {
  ALLIANCE_RULE_CODES,
  AllianceRuleError,
} from '@/constants/allianceErrors';
import {
  ALLIANCE_LEVEL_MAX,
  getAllianceLevel,
  getNextAllianceLevel,
} from '@/constants/allianceLevels';
import { hasAlliancePermission } from '@/constants/alliancePermissions';
import prisma from '@/lib/prisma';
import { AllianceTransactionType } from '@/lib/prisma-exports';
import {
  ALLIANCE_BANK_TX_OPTIONS,
  type DepositWindow,
  getDepositWindow,
  lockAllianceThenUsers,
} from '@/services/AllianceBank.service';
import { assertAllianceActive } from '@/services/allianceStatus';
import { lockEraLifecycleShared } from '@/utils/eraLifecycleLock';
import { logError } from '@/utils/logger';

const PurchaseSchema = z.object({
  allianceId: z.number().int().positive(),
  actorId: z.number().int().positive(),
  /** The level being bought; must be the current level + 1. */
  level: z.number().int().min(1).max(ALLIANCE_LEVEL_MAX),
});

/** What the Upgrades tab and the deposit form show a member. */
export interface AllianceUpgradeStatus {
  allianceId: number;
  status: string;
  hallLevel: number;
  memberCount: number;
  treasury: bigint;
  /** Whether the viewer may buy the next level (leader or upgrade_alliance). */
  canUpgrade: boolean;
  /** The viewer's deposit slots at the current level. */
  deposits: DepositWindow;
}

/** Alliance Hall levels: status for members and one-level-at-a-time purchases. */
export class AllianceUpgradeService {
  /** Hall level, member count, treasury and the viewer's deposit slots. Members only. */
  static async getStatus(
    allianceId: number,
    viewerId: number,
  ): Promise<AllianceUpgradeStatus> {
    const [alliance, membership, memberCount] = await Promise.all([
      prisma.alliances.findUnique({
        where: { id: allianceId },
        select: {
          id: true,
          leader_id: true,
          status: true,
          hall_level: true,
          gold_in_bank: true,
        },
      }),
      prisma.alliance_memberships.findUnique({
        where: {
          unique_alliance_user: { alliance_id: allianceId, user_id: viewerId },
        },
        include: { role: true },
      }),
      prisma.alliance_memberships.count({
        where: { alliance_id: allianceId },
      }),
    ]);
    if (!alliance) {
      throw new AllianceRuleError(
        ALLIANCE_RULE_CODES.notFound,
        'Alliance not found',
      );
    }
    if (!membership && alliance.leader_id !== viewerId) {
      throw new Error('Forbidden: only alliance members can view upgrades');
    }
    const level = getAllianceLevel(alliance.hall_level);
    const deposits = await getDepositWindow(
      prisma,
      allianceId,
      viewerId,
      level.depositsPer24h,
    );
    return {
      allianceId,
      status: alliance.status ?? 'ACTIVE',
      hallLevel: level.level,
      memberCount,
      treasury: BigInt(alliance.gold_in_bank ?? 0n),
      canUpgrade: hasAlliancePermission(
        alliance.leader_id,
        viewerId,
        membership?.role ?? null,
        'upgrade_alliance',
      ),
      deposits,
    };
  }

  /**
   * Buys the next Alliance Hall level with treasury gold. The leader or a
   * rank with upgrade_alliance may buy. Takes the era lifecycle shared lock,
   * then the alliance row lock (lockAllianceThenUsers order), re-checks every
   * rule on the locked row, and debits with a conditional update
   * (gold_in_bank >= cost) so concurrent purchases or payouts cannot overdraw.
   */
  static async purchase(data: {
    allianceId: number;
    actorId: number;
    level: number;
  }) {
    const input = PurchaseSchema.parse(data);
    try {
      return await prisma.$transaction(async (tx) => {
        await lockEraLifecycleShared(tx);
        await lockAllianceThenUsers(tx, input.allianceId, []);

        const alliance = await tx.alliances.findUnique({
          where: { id: input.allianceId },
          select: {
            id: true,
            leader_id: true,
            status: true,
            hall_level: true,
            gold_in_bank: true,
          },
        });
        if (!alliance) {
          throw new AllianceRuleError(
            ALLIANCE_RULE_CODES.notFound,
            'Alliance not found',
          );
        }
        assertAllianceActive(alliance);

        if (alliance.leader_id !== input.actorId) {
          const membership = await tx.alliance_memberships.findUnique({
            where: {
              unique_alliance_user: {
                alliance_id: input.allianceId,
                user_id: input.actorId,
              },
            },
            include: { role: true },
          });
          if (!membership) {
            throw new AllianceRuleError(
              ALLIANCE_RULE_CODES.notMember,
              'You are not a member of this alliance',
            );
          }
          if (
            !hasAlliancePermission(
              alliance.leader_id,
              input.actorId,
              membership.role,
              'upgrade_alliance',
            )
          ) {
            throw new AllianceRuleError(
              ALLIANCE_RULE_CODES.upgradeForbidden,
              'You do not have permission to buy alliance upgrades',
            );
          }
        }

        const current = getAllianceLevel(alliance.hall_level);
        const next = getNextAllianceLevel(current.level);
        if (!next) {
          throw new AllianceRuleError(
            ALLIANCE_RULE_CODES.upgradeMaxed,
            'The Alliance Hall is already at its highest level',
          );
        }
        // One level at a time; a stale page or a double click buys nothing.
        if (input.level !== next.level) {
          throw new AllianceRuleError(
            ALLIANCE_RULE_CODES.upgradeStale,
            `The Alliance Hall is at level ${current.level}; only level ${next.level} can be bought next. Reload the page.`,
            { current: current.level, next: next.level },
          );
        }

        const memberCount = await tx.alliance_memberships.count({
          where: { alliance_id: input.allianceId },
        });
        if (memberCount < next.minMembers) {
          throw new AllianceRuleError(
            ALLIANCE_RULE_CODES.upgradeMembers,
            `${next.name} needs at least ${next.minMembers} members; the alliance has ${memberCount}.`,
            { level: next.level, min: next.minMembers, count: memberCount },
          );
        }

        const debit = await tx.alliances.updateMany({
          where: {
            id: input.allianceId,
            hall_level: current.level,
            gold_in_bank: { gte: next.cost },
          },
          data: {
            gold_in_bank: { decrement: next.cost },
            hall_level: next.level,
          },
        });
        if (debit.count !== 1) {
          throw new AllianceRuleError(
            ALLIANCE_RULE_CODES.upgradeFunds,
            `Not enough treasury gold: ${next.name} costs ${next.cost.toLocaleString('en-US')} gold.`,
            { level: next.level, cost: Number(next.cost) },
          );
        }

        await tx.alliance_bank_history.create({
          data: {
            alliance_id: input.allianceId,
            transaction_type: AllianceTransactionType.UPGRADE,
            amount: next.cost,
            performed_by_user_id: input.actorId,
            related_user_id: null,
            notes: `Level ${next.level}`,
          },
        });

        return {
          message: `The Alliance Hall is now ${next.name} (level ${next.level})`,
          hallLevel: next.level,
        };
      }, ALLIANCE_BANK_TX_OPTIONS);
    } catch (error) {
      logError('Error buying alliance upgrade', { ...input, error });
      throw error;
    }
  }
}
