import { z } from 'zod';

import { withAuth } from '@/middleware/auth';
import { AllianceService } from '@/services';

const ProcessRequestSchema = z.object({
  requestId: z.number().int().positive(),
});

const acceptRequestHandler = async (req: any, res: any) => {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const validatedBody = ProcessRequestSchema.safeParse(req.body);
  if (!validatedBody.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: validatedBody.error.flatten().fieldErrors,
    });
  }

  const { user } = req.session;
  const { requestId } = validatedBody.data;

  try {
    const result = await AllianceService.acceptJoinRequest(requestId, user.id);
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
};

export default withAuth(acceptRequestHandler);
