import { NextApiResponse } from 'next';
import { MessagingService } from '@/services/Messaging.service';
import { withAuth } from '@/middleware/auth';
import { logError } from '@/utils/logger';
import type { AuthenticatedRequest } from '@/types/api';
import { z } from 'zod';

const ParticipantQuerySchema = z.object({
  chatRoomId: z.string().pipe(z.coerce.number()),
  participantId: z.string().pipe(z.coerce.number()),
});

const ParticipantBodySchema = z.object({
  action: z.enum(['promote', 'demote', 'updatePermissions']),
  canWrite: z.boolean().optional(),
});

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const session = req.session;
  if (!session) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const queryParse = ParticipantQuerySchema.safeParse(req.query);
  if (!queryParse.success) {
    return res.status(400).json({ message: 'Invalid query parameters', details: queryParse.error.flatten().fieldErrors });
  }
  const { chatRoomId: roomId, participantId: targetUserId } = queryParse.data;

  const currentUserId = Number(session.user.id);

  if (req.method !== 'PATCH' && req.method !== 'DELETE') {
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  try {
    if (req.method === 'PATCH') {
      const bodyParse = ParticipantBodySchema.safeParse(req.body);
      if (!bodyParse.success) {
        return res.status(400).json({ message: 'Invalid request body', details: bodyParse.error.flatten().fieldErrors });
      }
      const { action, canWrite } = bodyParse.data;
      const result = await MessagingService.manageParticipant(currentUserId, roomId, targetUserId, { action, canWrite });
      return res.status(200).json(result);
    } else if (req.method === 'DELETE') {
      const result = await MessagingService.removeParticipant(currentUserId, roomId, targetUserId);
      return res.status(200).json(result);
    }
  } catch (error) {
    logError("Error managing participant:", error);
    if (error.message.includes('Forbidden')) {
      return res.status(403).json({ message: error.message });
    }
    if (error.message.includes('not in this room') || error.message.includes('Target user')) {
      return res.status(404).json({ message: error.message });
    }
    if (error.message.includes('manage your own') || error.message.includes('Invalid') || error.message.includes('already') || error.message.includes('No changes') || error.message.includes('Cannot remove')) {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to manage participant.' });
  }
}

export default withAuth(handler);