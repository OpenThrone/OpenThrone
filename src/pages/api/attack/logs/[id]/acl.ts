import { NextApiResponse } from 'next';
import { withAuth } from '@/middleware/auth';
import { logError } from '@/utils/logger';
import type { AuthenticatedRequest } from '@/types/api';
import { BattleService } from '@/services';
import { z } from 'zod';

const IdQuerySchema = z.object({
  id: z.string().pipe(z.coerce.number()),
});

const AttackLogACLSchema = z.object({
  userId: z.number(),
  roomId: z.number(),
  participantIds: z.array(z.number()).optional(),
});

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const queryParse = IdQuerySchema.safeParse(req.query);
    if (!queryParse.success) {
      return res.status(400).json({ message: 'Invalid log ID', details: queryParse.error.flatten().fieldErrors });
    }
    const { id: attackLogId } = queryParse.data;

    const bodyParse = AttackLogACLSchema.safeParse(req.body);
    if (!bodyParse.success) {
      return res.status(400).json({ message: 'Invalid request body', details: bodyParse.error.flatten().fieldErrors });
    }
    const { userId, roomId, participantIds } = bodyParse.data;

    const result = await BattleService.manageAttackLogACL(attackLogId, {
      userId,
      roomId,
      participantIds
    });

    return res.status(200).json(result);
  } catch (error) {
    logError('Error sharing attack log:', error);
    return res.status(500).json({
      message: 'An error occurred while sharing the attack log',
      error: error.message,
    });
  }
}

export default withAuth(handler);