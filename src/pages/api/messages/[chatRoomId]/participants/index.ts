import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withAuth } from '@/middleware/auth';
import { MessagingService } from '@/services/Messaging.service';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

const ChatRoomQuerySchema = z.object({
  chatRoomId: z.string().pipe(z.coerce.number()),
});

const AddParticipantsBodySchema = z.object({
  userIds: z.array(z.number()).min(1),
});

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const { session } = req;
  if (!session) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const queryParse = ChatRoomQuerySchema.safeParse(req.query);
  if (!queryParse.success) {
    return res.status(400).json({
      message: 'Invalid query parameters',
      details: queryParse.error.flatten().fieldErrors,
    });
  }
  const { chatRoomId: roomId } = queryParse.data;

  const currentUserId = Number(session.user.id);

  if (req.method === 'POST') {
    const bodyParse = AddParticipantsBodySchema.safeParse(req.body);
    if (!bodyParse.success) {
      return res.status(400).json({
        message: 'Invalid request body',
        details: bodyParse.error.flatten().fieldErrors,
      });
    }
    const { userIds } = bodyParse.data;

    try {
      const result = await MessagingService.addParticipants(
        currentUserId,
        roomId,
        { userIds },
      );
      return res.status(201).json(result);
    } catch (error) {
      logError('Error adding participants:', error);
      if (error.message.includes('Forbidden')) {
        return res.status(403).json({ message: error.message });
      }
      if (error.message.includes('Chat room not found')) {
        return res.status(404).json({ message: error.message });
      }
      if (error.message.includes('No valid users')) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: 'Failed to add participants.' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }
}

export default withAuth(handler);
