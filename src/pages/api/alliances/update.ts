import { z } from 'zod';

import { withAuth } from '@/middleware/auth';
import { AllianceService } from '@/services';

const UpdateAllianceSchema = z.object({
  allianceId: z.number().int().positive(),
  motto: z.string().optional(),
  comments: z.string().optional(),
  avatar: z.string().optional(),
  join_mode: z.enum(['OPEN', 'REQUEST_TO_JOIN', 'INVITE_ONLY']).optional(),
  roster_visibility: z.enum(['PUBLIC', 'MEMBERS_ONLY']).optional(),
});

const updateAllianceHandler = async (req: any, res: any) => {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const validatedBody = UpdateAllianceSchema.safeParse(req.body);
  if (!validatedBody.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: validatedBody.error.flatten().fieldErrors,
    });
  }

  const { user } = req.session;
  const { allianceId, ...updateData } = validatedBody.data;

  try {
    const result = await AllianceService.updateAlliance(
      allianceId,
      user.id,
      updateData,
    );
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
};

export default withAuth(updateAllianceHandler);
