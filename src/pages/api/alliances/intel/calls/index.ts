import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { withAuth } from '@/middleware/auth';
import {
  ALLIANCE_CALL_TYPES,
  AllianceIntelService,
  INTEL_NOTE_MAX,
} from '@/services/AllianceIntel.service';
import type { AuthenticatedRequest } from '@/types/api';
import { stringifyObj } from '@/utils/numberFormatting';

const QuerySchema = z.object({
  allianceId: z.coerce.number().int().positive(),
  includeClosed: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

const BodySchema = z.object({
  allianceId: z.number().int().positive(),
  callType: z.enum(ALLIANCE_CALL_TYPES),
  targetUserId: z.number().int().min(0).optional(),
  displayName: z.string().trim().min(1).max(100).optional(),
  note: z.string().trim().max(INTEL_NOTE_MAX).optional(),
});

const getGuard = withApiGuard({
  methods: ['GET'],
  authMode: 'required',
  querySchema: QuerySchema,
});

const postGuard = withApiGuard({
  methods: ['POST'],
  authMode: 'required',
  bodySchema: BodySchema,
});

/** Calls for members, open first. */
const getHandler = getGuard(
  async (
    req: AuthenticatedRequest,
    res: NextApiResponse,
    context: { query: z.infer<typeof QuerySchema> },
  ) => {
    res.setHeader('Cache-Control', 'private, no-store');
    try {
      const result = await AllianceIntelService.listCalls(
        Number(req.session?.user?.id),
        context.query,
      );
      return res.status(200).json(stringifyObj(result));
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  },
);

/** Opens a Hit / Farm / Recon call; needs call_targets. */
const postHandler = withAuth(
  postGuard(
    async (
      req: AuthenticatedRequest,
      res: NextApiResponse,
      context: { body: z.infer<typeof BodySchema> },
    ) => {
      try {
        const result = await AllianceIntelService.createCall(
          Number(req.session?.user?.id),
          context.body,
        );
        return res.status(200).json(stringifyObj(result));
      } catch (error: any) {
        return res.status(400).json({ error: error.message });
      }
    },
  ),
  { rateLimitProfile: 'game_write' },
);

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return req.method === 'POST'
    ? (postHandler as any)(req, res)
    : (getHandler as any)(req, res);
}
