import { z } from 'zod';

import { withAuth } from '@/middleware/auth';
import { AllianceWarService } from '@/services';

const DeclareWarApiSchema = z.object({
  allianceId: z.number().int().positive(),
  defenderAllianceId: z.number().int().positive().optional(),
  defenderUserId: z.number().int().positive().optional(),
});

const declareWarHandler = async (req: any, res: any) => {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const validatedBody = DeclareWarApiSchema.safeParse(req.body);
  if (!validatedBody.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: validatedBody.error.flatten().fieldErrors,
    });
  }

  const { user } = req.session;
  const { allianceId, defenderAllianceId, defenderUserId } = validatedBody.data;

  try {
    const war = await AllianceWarService.declareWar({
      allianceId,
      defenderAllianceId,
      defenderUserId,
      declarerUserId: user.id,
    });
    return res.status(200).json(war);
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
};

export default withAuth(declareWarHandler);
