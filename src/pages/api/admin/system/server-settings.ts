import { PermissionType } from '@prisma/client';
import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { ServerSettingService } from '@/services/ServerSetting.service';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

const Schema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
  label: z.string().min(1).optional(),
  description: z.string().optional(),
  type: z.enum(['STRING', 'NUMBER', 'BOOLEAN', 'JSON']).optional(),
});

const guardedHandler = withApiGuard({
  methods: ['GET', 'PUT', 'DELETE'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.MANAGE_SERVER_SETTINGS],
  rateLimitProfile: 'admin',
  bodySchema: Schema,
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { query: { key?: string }; body?: z.infer<typeof Schema> },
) {
  if (req.method === 'GET') {
    const settings = await ServerSettingService.list();
    return res.status(200).json(settings);
  }

  if (req.method === 'PUT') {
    const userId = req.session?.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const result = await ServerSettingService.upsert(Number(userId), {
        key: context.body!.key,
        value: context.body!.value,
        label: context.body!.label ?? context.body!.key,
        description: context.body!.description,
        type: context.body!.type ?? 'STRING',
      });
      return res.status(200).json(result);
    } catch (err) {
      logError('Failed to update setting:', err);
      return res.status(500).json({ error: 'Failed to update setting' });
    }
  }

  if (req.method === 'DELETE') {
    const { key } = context.query;
    if (!key) return res.status(400).json({ error: 'Key required' });
    await ServerSettingService.delete(key);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ message: 'Method not allowed' });
}

export default guardedHandler(handler);
