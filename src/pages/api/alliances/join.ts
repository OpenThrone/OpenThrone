import { z } from 'zod';

import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import { AllianceService } from '@/services';
import { stringifyObj } from '@/utils/numberFormatting';
import { publicErrorBody } from '@/utils/publicError';
// Adjust import if needed, usually we just cast req

const JoinAllianceSchema = z.object({
  allianceId: z.number().int().positive(),
  /** The join fee the player confirmed (whole gold); a changed fee refuses. */
  expectedFee: z
    .union([
      z.number().int().nonnegative().safe(),
      z.string().regex(/^\d{1,12}$/),
    ])
    .optional(),
});

const joinAlliance = async (req: any, res: any) => {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const validatedBody = JoinAllianceSchema.safeParse(req.body);
  if (!validatedBody.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: validatedBody.error.flatten().fieldErrors,
    });
  }

  const { user } = req.session;
  const { allianceId, expectedFee } = validatedBody.data;

  try {
    const alliance = await prisma.alliances.findUnique({
      where: { id: allianceId },
      select: { join_mode: true },
    });

    if (!alliance) {
      return res.status(404).json({ error: 'Alliance not found' });
    }

    if (alliance.join_mode === 'INVITE_ONLY') {
      return res.status(400).json({ error: 'This alliance is invite-only' });
    }

    if (alliance.join_mode === 'REQUEST_TO_JOIN') {
      const result = await AllianceService.createJoinRequest(
        user.id,
        allianceId,
      );
      return res.status(200).json(result);
    }

    // Default to OPEN
    const result = await AllianceService.joinAlliance(user.id, {
      allianceId,
      expectedFee: expectedFee ?? null,
    });
    return res.status(200).json(stringifyObj(result));
  } catch (error: any) {
    return res.status(400).json(publicErrorBody(error));
  }
};

export default withAuth(joinAlliance);
