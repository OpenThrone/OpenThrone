import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import type {
  BattleUpgradeType,
  BonusPointsType,
  ItemType,
  ItemUsage,
  StructureUpgradeType,
  UnitType,
} from '@/lib/prisma-exports';
import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import type { ItemDelta } from '@/services/ItemLedger.service';
import { recordItemLedger } from '@/services/ItemLedger.service';
import type { AuthenticatedRequest } from '@/types/api';
import { recomputeStoredStatsInTx } from '@/utils/adminRecomputeStats';
import {
  AdminUpgradesUpdateSchema,
  BATTLE_UPGRADE_CATALOG,
  battleKey,
  BONUS_MAX_LEVEL,
  BONUS_TYPES,
  diffByKey,
  findMissingExpectations,
  findStaleUpgrades,
  grantedItemDeltas,
  ITEM_CATALOG,
  itemKey,
  missingItems,
  missingUnits,
  snapshotUpgrades,
  STALE_UPGRADES_MESSAGE,
  STRUCTURE_MAX_LEVEL,
  UNIT_CATALOG,
  unitKey,
  validateUpgradesUpdate,
} from '@/utils/adminUpgrades';
import { getRequestIp, logAction, logActionStrict } from '@/utils/auditLogger';
import { lockEraLifecycleShared } from '@/utils/eraLifecycleLock';
import { logError } from '@/utils/logger';
import { getLevelFromXP } from '@/utils/utilities';

const QuerySchema = z.object({
  userId: z.coerce.number().int().positive(),
});

const guardedRead = withApiGuard({
  methods: ['GET'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.MANAGE_USERS],
  rateLimitProfile: 'admin',
  querySchema: QuerySchema,
});
const guardedUpdate = withApiGuard({
  methods: ['PUT'],
  authMode: 'admin',
  rateLimitProfile: 'admin',
  querySchema: QuerySchema,
});

const upgradeInclude = {
  UserUnit: true,
  UserItem: true,
  UserStructureUpgrade: true,
  UserBattleUpgrade: true,
  UserBonusPoints: true,
} as const;

type LevelRow = { type: string; level: number };
type QuantityRow = LevelRow & { quantity: number };

class DeniedError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
    public code?: string,
  ) {
    super(message);
  }
}

async function handleGet(userId: number, res: NextApiResponse) {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: { experience: true, currentEraId: true, ...upgradeInclude },
  });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const level = getLevelFromXP(user.experience ?? 0);
  const usedPoints = user.UserBonusPoints.reduce((s, b) => s + b.level, 0);
  return res.status(200).json({
    currentEraId: user.currentEraId ?? null,
    level,
    proficiencyPoints: { total: level, used: usedPoints },
    structureUpgrades: user.UserStructureUpgrade.map(({ type, level: l }) => ({
      type,
      level: l,
    })),
    battleUpgrades: user.UserBattleUpgrade.map(
      ({ type, level: l, quantity }) => ({
        type,
        level: l,
        quantity,
      }),
    ),
    bonusPoints: user.UserBonusPoints.map(({ type, level: l }) => ({
      type,
      level: l,
    })),
    limits: {
      structureMaxLevel: STRUCTURE_MAX_LEVEL,
      bonusMaxLevel: BONUS_MAX_LEVEL,
      bonusTypes: BONUS_TYPES,
    },
    catalog: {
      units: UNIT_CATALOG,
      items: ITEM_CATALOG,
      battleUpgrades: BATTLE_UPGRADE_CATALOG,
    },
    missing: {
      units: missingUnits(user.UserUnit),
      items: missingItems(user.UserItem),
    },
  });
}

async function handlePut(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  userId: number,
) {
  const adminUserId = Number(req.session?.user?.id);
  const ip = getRequestIp(req);
  const auditDetails: Record<string, unknown> = { targetUserId: userId };

  const parsed = AdminUpgradesUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      error: 'Invalid upgrades update',
      details: parsed.error.flatten().fieldErrors,
    });
  }
  const update = parsed.data;
  const missing = findMissingExpectations(update);
  if (missing.length > 0) {
    return res.status(422).json({
      error: 'Every edited row needs its loaded value in expected',
      details: missing,
    });
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        await lockEraLifecycleShared(tx);
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
        const before = await tx.users.findUnique({
          where: { id: userId },
          include: upgradeInclude,
        });
        if (!before) throw new DeniedError(404, 'User not found');

        // Same rule as the main user editor: admins cannot edit other admins.
        if (adminUserId !== userId) {
          const targetIsAdmin = await tx.staffRoleAssignment.count({
            where: { userId, role: 'ADMINISTRATOR', revokedAt: null },
          });
          if (targetIsAdmin > 0) {
            throw new DeniedError(
              403,
              'Administrators cannot edit other administrators',
            );
          }
        }

        // Optimistic concurrency: refuse edits based on outdated values.
        const stale = findStaleUpgrades(
          update.expected,
          snapshotUpgrades(before),
        );
        if (stale.length > 0) {
          auditDetails.staleFields = stale;
          throw new DeniedError(
            409,
            STALE_UPGRADES_MESSAGE,
            undefined,
            'STALE',
          );
        }

        const errors = validateUpgradesUpdate(
          update,
          getLevelFromXP(before.experience ?? 0),
          before.UserBonusPoints,
        );
        if (errors.length > 0) {
          throw new DeniedError(422, 'Invalid upgrades update', errors);
        }

        for (const s of update.structureUpgrades) {
          const type = s.type as StructureUpgradeType;
          await tx.userStructureUpgrade.upsert({
            where: { userId_type: { userId, type } },
            create: { userId, type, level: s.level },
            update: { level: s.level },
          });
        }
        for (const b of update.battleUpgrades) {
          const type = b.type as BattleUpgradeType;
          await tx.userBattleUpgrade.upsert({
            where: { userId_type_level: { userId, type, level: b.level } },
            create: { userId, type, level: b.level, quantity: b.quantity },
            update: { quantity: b.quantity },
          });
        }
        for (const bp of update.bonusPoints) {
          const type = bp.type as BonusPointsType;
          await tx.userBonusPoints.upsert({
            where: { userId_type: { userId, type } },
            create: { userId, type, level: bp.level },
            update: { level: bp.level },
          });
        }
        // New rows are always permanent (isMercenary: false); existing rows
        // keep their quantity so this cannot silently overwrite inventory.
        for (const u of update.addUnits) {
          const type = u.type as UnitType;
          await tx.userUnit.upsert({
            where: {
              userId_type_level_isMercenary: {
                userId,
                type,
                level: u.level,
                isMercenary: false,
              },
            },
            create: {
              userId,
              type,
              level: u.level,
              quantity: u.quantity,
              isMercenary: false,
            },
            update: {},
          });
        }
        for (const i of update.addItems) {
          const type = i.type as ItemType;
          const usage = i.usage as ItemUsage;
          await tx.userItem.upsert({
            where: {
              userId_type_usage_level: {
                userId,
                type,
                usage,
                level: i.level,
              },
            },
            create: {
              userId,
              type,
              usage,
              level: i.level,
              quantity: i.quantity,
            },
            update: {},
          });
        }
        await recordItemLedger(
          tx,
          userId,
          'ADMIN_GRANT',
          grantedItemDeltas(
            update.addItems as (ItemDelta & { quantity: number })[],
            before.UserItem,
          ) as ItemDelta[],
        );

        const after = await tx.users.findUnique({
          where: { id: userId },
          include: upgradeInclude,
        });
        if (!after) throw new DeniedError(404, 'User not found');

        // Stored stats include the current-era contract roster and the
        // persisted killing/defense strength.
        const stats = await recomputeStoredStatsInTx(tx, userId);

        auditDetails.diff = {
          structureUpgrades: diffByKey<LevelRow>(
            before.UserStructureUpgrade,
            after.UserStructureUpgrade,
            (r) => r.type,
            (r) => r.level,
          ),
          battleUpgrades: diffByKey<QuantityRow>(
            before.UserBattleUpgrade,
            after.UserBattleUpgrade,
            (r) => battleKey(r),
            (r) => r.quantity,
          ),
          bonusPoints: diffByKey<LevelRow>(
            before.UserBonusPoints,
            after.UserBonusPoints,
            (r) => r.type,
            (r) => r.level,
          ),
          units: diffByKey<QuantityRow>(
            before.UserUnit.filter((u) => !u.isMercenary),
            after.UserUnit.filter((u) => !u.isMercenary),
            (r) => unitKey(r),
            (r) => r.quantity,
          ),
          items: diffByKey<QuantityRow & { usage: string }>(
            before.UserItem,
            after.UserItem,
            (r) => itemKey(r),
            (r) => r.quantity,
          ),
          stats: {
            before: {
              offense: before.offense,
              defense: before.defense,
              spy: before.spy,
              sentry: before.sentry,
              killingStrength: before.killing_str,
              defenseStrength: before.defense_str,
            },
            after: {
              offense: stats.offense,
              defense: stats.defense,
              spy: stats.spy,
              sentry: stats.sentry,
              killingStrength: stats.killingStrength,
              defenseStrength: stats.defenseStrength,
            },
          },
        };

        await logActionStrict(
          {
            userId: adminUserId,
            action: 'ADMIN_USER_UPGRADES_UPDATE',
            ip,
            targetUserId: userId,
            details: auditDetails,
          },
          tx,
        );
      },
      { isolationLevel: 'Serializable' },
    );
    return res.status(200).json({ message: 'Upgrades updated successfully' });
  } catch (error) {
    if (error instanceof DeniedError) {
      auditDetails.reason =
        error.code === 'STALE' ? 'stale_edit' : error.message;
      await logAction(
        adminUserId,
        'ADMIN_USER_UPGRADES_UPDATE_DENIED',
        ip,
        auditDetails,
      );
      return res.status(error.status).json({
        error: error.message,
        details: error.details,
        ...(error.code ? { code: error.code } : {}),
      });
    }
    if ((error as { code?: unknown })?.code === 'P2034') {
      // Serialization conflict with a concurrent gameplay write.
      auditDetails.reason = 'stale_edit';
      await logAction(
        adminUserId,
        'ADMIN_USER_UPGRADES_UPDATE_DENIED',
        ip,
        auditDetails,
      );
      return res.status(409).json({
        error: STALE_UPGRADES_MESSAGE,
        code: 'STALE',
      });
    }
    logError('Error updating user upgrades:', error);
    await logAction(
      adminUserId,
      'ADMIN_USER_UPGRADES_UPDATE_FAILED',
      ip,
      auditDetails,
    );
    return res.status(500).json({ error: 'Failed to update upgrades' });
  }
}

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { query: z.infer<typeof QuerySchema> },
) {
  const { userId } = context.query;
  if (req.method === 'GET') {
    try {
      return await handleGet(userId, res);
    } catch (error) {
      logError('Error fetching user upgrades:', error);
      return res.status(500).json({ error: 'Failed to fetch upgrades' });
    }
  }
  return handlePut(req, res, userId);
}

export default async function routed(
  req: AuthenticatedRequest,
  res: NextApiResponse,
) {
  if (req.method === 'GET') return guardedRead(handler)(req, res);
  if (req.method === 'PUT') return guardedUpdate(handler)(req, res);
  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: 'Method not allowed' });
}
