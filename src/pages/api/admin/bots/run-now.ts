import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { BotService } from '@/services';
import type { AuthenticatedRequest } from '@/types/api';

const RunNowBodySchema = z.object({
  schedule: z.string().optional(),
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
  const result = await BotService.runDailyBotTick(schedule);

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
