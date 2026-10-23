import type { NextApiResponse } from 'next';
import { z } from 'zod';

import {
  isRuntimeSettingKey,
  RUNTIME_SETTING_REGISTRY,
} from '@/constants/runtimeSettings';
import prisma from '@/lib/prisma';
import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import {
  getRuntimeConfig,
  invalidateRuntimeConfigCache,
  type RuntimeConfig,
} from '@/services/RuntimeConfig.service';
import { ServerSettingService } from '@/services/ServerSetting.service';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logActionStrict } from '@/utils/auditLogger';
import { lockEraLifecycle } from '@/utils/eraLifecycleLock';
import { logError } from '@/utils/logger';

const Schema = z.object({
  key: z.string().min(1),
  value: z.unknown().optional(),
  revertAuditId: z.number().int().positive().optional(),
});
const guardedHandler = withApiGuard({
  methods: ['GET', 'PUT', 'DELETE'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.MANAGE_SERVER_SETTINGS],
  rateLimitProfile: 'admin',
  bodySchema: Schema,
});

function runtimeValue(config: RuntimeConfig, key: string): unknown {
  const values: Record<string, unknown> = {
    'account.inactivity.remindersEnabled':
      config.inactivityRemindersEnabled ?? false,
    'account.inactivity.autoAnonymizeEnabled':
      config.inactivityAutoAnonymizeEnabled ?? false,
    'email.outbox.enabled': config.emailOutboxEnabled ?? false,
    'email.outbox.ratePerMinute': config.emailOutboxRatePerMinute ?? 60,
    'recruit.dailyCap': config.externalRecruitDailyCap ?? 25,
    'recruit.internalDailyCap': config.recruitDailyCap ?? 250,
    'recruit.externalIpDailyCap': config.externalRecruitIpDailyCap ?? 5,
    'era.protectionDurationDays': config.protectionDurationDays ?? 14,
    ENABLE_ATTACKING: config.enableAttacking,
    ATTACK_LEVEL_RANGE: config.attackLevelRange,
    ENABLE_INFILTRATIONS: config.enableInfiltrations,
    ENABLE_ASSASSINATIONS: config.enableAssassinations,
    ENABLE_INTEL: config.enableIntel,
    ENABLE_SOCIAL: config.enableSocial,
    ENABLE_MESSAGING: config.enableMessaging,
    ENABLE_ENEMIES: config.enableEnemies,
    DISABLE_LOGIN: config.disableLogin,
    DISABLE_REGISTRATION: config.disableRegistration,
    MAINTENANCE_MODE: config.maintenance,
  };
  // Unknown-to-this-map keys still get a reversible value from the registry.
  return isRuntimeSettingKey(key)
    ? (values[key] ?? RUNTIME_SETTING_REGISTRY[key].fallback)
    : values[key];
}

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: {
    query: { key?: string; historyKey?: string };
    body?: z.infer<typeof Schema>;
  },
) {
  if (req.method === 'GET') {
    if (
      context.query.historyKey &&
      isRuntimeSettingKey(context.query.historyKey)
    ) {
      const logs = await prisma.auditLog.findMany({
        where: {
          action: {
            in: ['ADMIN_SERVER_SETTING_UPDATE', 'ADMIN_SERVER_SETTING_DELETE'],
          },
          entityType: 'ServerSetting',
          details: { path: ['key'], equals: context.query.historyKey },
        },
        orderBy: { timestamp: 'desc' },
        take: 20,
        select: { id: true, timestamp: true, details: true },
      });
      return res.status(200).json(
        logs.map(({ timestamp, ...log }) => ({
          ...log,
          createdAt: timestamp,
        })),
      );
    }
    return res.status(200).json(await ServerSettingService.list());
  }
  const userId = Number(req.session?.user?.id);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    if (req.method === 'PUT') {
      const { body } = context;
      if (!body)
        return res.status(400).json({ error: 'Setting details required' });
      const { key, revertAuditId } = body;
      if (!isRuntimeSettingKey(key))
        return res.status(400).json({ error: 'Unknown setting key' });
      const meta = RUNTIME_SETTING_REGISTRY[key];
      let nextValue = body.value;
      if (revertAuditId) {
        const prior = await prisma.auditLog.findFirst({
          where: {
            id: revertAuditId,
            action: {
              in: [
                'ADMIN_SERVER_SETTING_UPDATE',
                'ADMIN_SERVER_SETTING_DELETE',
              ],
            },
            entityType: 'ServerSetting',
          },
        });
        const details = prior?.details as {
          key?: string;
          previousValue?: unknown;
        } | null;
        if (
          !prior ||
          !details ||
          details?.key !== key ||
          !Object.prototype.hasOwnProperty.call(details, 'previousValue')
        )
          return res
            .status(400)
            .json({ error: 'No reversible prior value found' });
        nextValue = details.previousValue;
      }
      const parsed = meta.schema.safeParse(nextValue);
      if (!parsed.success)
        return res.status(400).json({ error: 'Invalid value for setting' });
      const currentConfig = await getRuntimeConfig();
      const result = await prisma.$transaction(async (tx) => {
        if (key === 'DISABLE_LOGIN') await lockEraLifecycle(tx);
        const previous = await tx.serverSetting.findUnique({ where: { key } });
        const updated = await tx.serverSetting.upsert({
          where: { key },
          create: {
            key,
            label: meta.label,
            type: meta.type,
            value: parsed.data as object,
            isPublic: meta.isPublic,
            isRuntimeEditable: true,
            updatedByUserId: userId,
          },
          update: {
            label: meta.label,
            type: meta.type,
            value: parsed.data as object,
            isPublic: meta.isPublic,
            isRuntimeEditable: true,
            updatedByUserId: userId,
          },
        });
        await logActionStrict(
          {
            userId,
            action: 'ADMIN_SERVER_SETTING_UPDATE',
            ip: getRequestIp(req),
            entityType: 'ServerSetting',
            entityId: updated.id,
            details: {
              key,
              previousValue:
                previous?.value ?? runtimeValue(currentConfig, key),
              newValue: parsed.data,
              revertedAuditId: revertAuditId ?? null,
            },
          },
          tx,
        );
        return updated;
      });
      invalidateRuntimeConfigCache();
      return res.status(200).json(result);
    }
    const { key } = context.query;
    if (!key || !isRuntimeSettingKey(key))
      return res.status(400).json({ error: 'Unknown setting key' });
    const prior = await ServerSettingService.get(key);
    if (prior) {
      const currentConfig = await getRuntimeConfig();
      await prisma.$transaction(async (tx) => {
        if (key === 'DISABLE_LOGIN') await lockEraLifecycle(tx);
        await tx.serverSetting.delete({ where: { key } });
        await logActionStrict(
          {
            userId,
            action: 'ADMIN_SERVER_SETTING_DELETE',
            ip: getRequestIp(req),
            entityType: 'ServerSetting',
            entityId: prior.id,
            details: {
              key,
              previousValue: prior.value ?? runtimeValue(currentConfig, key),
              newValue: null,
            },
          },
          tx,
        );
      });
      invalidateRuntimeConfigCache();
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    logError('Failed to update server setting', err);
    return res.status(500).json({ error: 'Setting update failed' });
  }
}

export default guardedHandler(handler);
