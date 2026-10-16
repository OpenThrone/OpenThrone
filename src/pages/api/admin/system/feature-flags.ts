import type { NextApiResponse } from 'next';
import { z } from 'zod';

import {
  isRuntimeSettingKey,
  RUNTIME_SETTING_REGISTRY,
} from '@/constants/runtimeSettings';
import prisma from '@/lib/prisma';
import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import { invalidateRuntimeConfigCache } from '@/services/RuntimeConfig.service';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logActionStrict } from '@/utils/auditLogger';
import { lockEraLifecycle } from '@/utils/eraLifecycleLock';
import { logError } from '@/utils/logger';

const Schema = z.object({
  key: z.string().min(1).max(100),
  enabled: z.boolean().optional(),
  description: z.string().max(1000).nullable().optional(),
  rules: z.unknown().nullable().optional(),
});
const guardedHandler = withApiGuard({
  methods: ['GET', 'PUT', 'POST', 'DELETE'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.MANAGE_FEATURE_FLAGS],
  rateLimitProfile: 'admin',
  bodySchema: Schema,
});

function featureKey(key: string) {
  return (
    isRuntimeSettingKey(key) &&
    (key.startsWith('ENABLE_') ||
      key === 'DISABLE_LOGIN' ||
      key === 'DISABLE_REGISTRATION') &&
    RUNTIME_SETTING_REGISTRY[key].type === 'BOOLEAN'
  );
}

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { body?: z.infer<typeof Schema>; query: { key?: string } },
) {
  if (req.method === 'GET')
    return res.status(200).json(
      await prisma.featureFlag.findMany({
        where: {
          key: {
            in: Object.keys(RUNTIME_SETTING_REGISTRY).filter(featureKey),
          },
        },
        orderBy: { key: 'asc' },
      }),
    );
  const userId = Number(req.session?.user?.id);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { body } = context;
  const key = req.method === 'DELETE' ? context.query.key : body?.key;
  if (!key || !featureKey(key))
    return res.status(400).json({ error: 'Unknown feature key' });
  if (req.method === 'DELETE') {
    try {
      const prior = await prisma.featureFlag.findUnique({ where: { key } });
      if (prior)
        await prisma.$transaction(async (tx) => {
          if (key === 'DISABLE_LOGIN') await lockEraLifecycle(tx);
          await tx.featureFlag.delete({ where: { key } });
          await logActionStrict(
            {
              userId,
              action: 'ADMIN_FEATURE_FLAG_DELETE',
              ip: getRequestIp(req),
              entityType: 'FeatureFlag',
              entityId: prior.id,
              details: { key, previousEnabled: prior.enabled, newValue: null },
            },
            tx,
          );
        });
      invalidateRuntimeConfigCache();
      return res.status(200).json({ success: true });
    } catch (err) {
      logError('Failed to delete feature flag', err);
      return res.status(500).json({ error: 'Failed to delete feature flag' });
    }
  }
  if (!body) return res.status(400).json({ error: 'Feature details required' });
  if (
    body.rules != null &&
    (!Array.isArray(body.rules) || body.rules.length > 0)
  )
    return res
      .status(400)
      .json({ error: 'Rules are not supported; clear rules to continue' });
  try {
    const result = await prisma.$transaction(async (tx) => {
      if (key === 'DISABLE_LOGIN') await lockEraLifecycle(tx);
      const old = await tx.featureFlag.findUnique({ where: { key } });
      const flag = await tx.featureFlag.upsert({
        where: { key },
        create: {
          key,
          enabled: body.enabled ?? false,
          description: body.description ?? RUNTIME_SETTING_REGISTRY[key].label,
          rules: null,
          createdByUserId: userId,
        },
        update: {
          ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
          ...(body.description !== undefined
            ? { description: body.description }
            : {}),
          rules: null,
          updatedByUserId: userId,
        },
      });
      await logActionStrict(
        {
          userId,
          action:
            req.method === 'POST'
              ? 'ADMIN_FEATURE_FLAG_CREATE'
              : 'ADMIN_FEATURE_FLAG_UPDATE',
          ip: getRequestIp(req),
          entityType: 'FeatureFlag',
          entityId: flag.id,
          details: {
            key,
            previousValue: old
              ? { enabled: old.enabled, description: old.description }
              : null,
            newValue: { enabled: flag.enabled, description: flag.description },
          },
        },
        tx,
      );
      return flag;
    });
    invalidateRuntimeConfigCache();
    return res.status(200).json(result);
  } catch (err) {
    logError('Failed to update feature flag', err);
    return res.status(500).json({ error: 'Failed to save feature flag' });
  }
}

export default guardedHandler(handler);
