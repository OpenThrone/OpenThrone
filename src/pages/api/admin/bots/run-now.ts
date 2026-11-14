import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { isKnownBotSchedule } from '@/botUsers/config';
import { withApiGuard } from '@/middleware/apiGuard';
import { BotService } from '@/services';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logAction } from '@/utils/auditLogger';

const RunNowBodySchema = z.object({
  schedule: z
    .string()
    .regex(/^[a-z0-9_-]+$/i)
    .optional(),
});

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'admin',
  rateLimitProfile: 'admin',
  bodySchema: RunNowBodySchema,
});

const runBotTickNow = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
  ctx: { body: z.infer<typeof RunNowBodySchema> },
) => {
  const schedule = ctx.body.schedule ?? 'default';
  if (!isKnownBotSchedule(schedule)) {
    return res.status(400).json({ error: 'Unknown bot schedule' });
  }
  const result = await BotService.runDailyBotTick(schedule);

  await logAction(
    Number(req.session?.user?.id),
    'ADMIN_BOTS_RUN_NOW',
    getRequestIp(req),
    { schedule, totalBots: result.totalBots },
  );

  return res.status(200).json({
    message: 'Bot tick executed',
    totalBots: result.totalBots,
    processedAt: result.processedAt,
    byAction: result.byAction,
    byStatus: result.byStatus,
    durationMs: result.durationMs,
    results: result.results,
  });
};

export default guardedHandler(runBotTickNow);
