import { NextApiResponse } from 'next';
import { MessagingService } from '@/services/Messaging.service';
import { withAuth } from '@/middleware/auth';
import { logError } from '@/utils/logger';
import type { AuthenticatedRequest } from '@/types/api';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const session = req.session;
  if (!session) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const currentUserId = Number(session.user.id);
  const roomId = Number(req.query.chatRoomId);

  if (req.method === 'POST') {
    const { userIds } = req.body; // Expecting an array of user IDs to add

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: 'User IDs must be provided as an array.' });
    }

    try {
      const result = await MessagingService.addParticipants(currentUserId, roomId, { userIds });
      return res.status(201).json(result);
    } catch (error) {
      logError("Error adding participants:", error);
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