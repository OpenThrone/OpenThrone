import { existsSync, statSync } from 'fs';
import type { NextApiResponse } from 'next';
import { join } from 'path';
import { z } from 'zod';

import { CONFIG_ROOT_DIR } from '@/botUsers/constants';
import { withApiGuard } from '@/middleware/apiGuard';
import { BotService } from '@/services';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logAction } from '@/utils/auditLogger';

const ProvisionBodySchema = z.object({
  manifest: z
    .string()
    .regex(/^[a-z0-9_-]+$/i)
    .optional(),
  dryRun: z.boolean().optional(),
});

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'admin',
  rateLimitProfile: 'admin',
  bodySchema: ProvisionBodySchema,
});

const provisionBots = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
  ctx: { body: z.infer<typeof ProvisionBodySchema> },
) => {
  const manifest = ctx.body.manifest ?? 'default';
  const manifestPath = join(
    process.cwd(),
    CONFIG_ROOT_DIR,
    'manifests',
    `${manifest}.json`,
  );
  if (!existsSync(manifestPath) || !statSync(manifestPath).isFile()) {
    return res.status(400).json({ error: 'Unknown bot manifest' });
  }
  const result = await BotService.provisionBotsFromManifest(manifest, {
    dryRun: ctx.body.dryRun,
  });

  await logAction(
    Number(req.session?.user?.id),
    'ADMIN_BOTS_PROVISION',
    getRequestIp(req),
    {
      manifest: result.manifestName,
      dryRun: !!result.dryRun,
      created: result.created.length,
    },
  );

  return res.status(200).json({
    message: result.dryRun
      ? 'Dry run — no bots created'
      : `Provisioned ${result.created.length} bot(s)`,
    manifest: result.manifestName,
    planned: result.planned,
    created: result.created,
    skipped: result.skipped,
    failed: result.failed,
  });
};

export default guardedHandler(provisionBots);
