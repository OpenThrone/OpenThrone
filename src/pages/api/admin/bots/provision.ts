import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { BotService } from '@/services';
import type { AuthenticatedRequest } from '@/types/api';

const ProvisionBodySchema = z.object({
  manifest: z.string().optional(),
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
  const result = await BotService.provisionBotsFromManifest(manifest, {
    dryRun: ctx.body.dryRun,
  });

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
