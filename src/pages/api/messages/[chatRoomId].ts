import type { NextApiRequest, NextApiResponse } from 'next';
import type { Session } from 'next-auth'; // Import Session type
import { z } from 'zod';

import { withAuth } from '@/middleware/auth';
import { MessagingService } from '@/services/Messaging.service';
import { logError } from '@/utils/logger';
import { publicErrorMessage } from '@/utils/publicError';

// Define a custom request type that includes the session injected by withAuth
interface AuthenticatedRequest extends NextApiRequest {
  session: Session;
}

const ChatRoomIdSchema = z.object({
  chatRoomId: z.coerce.number().int().positive(),
  beforeId: z.coerce.number().int().positive().optional(),
  aroundId: z.coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER - 1)
    .optional(),
});

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  // Use AuthenticatedRequest
  const validatedQuery = ChatRoomIdSchema.safeParse(req.query);
  if (!validatedQuery.success) {
    return res.status(400).json({ message: 'Invalid chatRoomId' });
  }
  const { chatRoomId, beforeId, aroundId } = validatedQuery.data;
  const { session } = req; // Now correctly typed

  if (!session) {
    // This should ideally not happen if withAuth is working correctly
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const userId = Number(session.user.id);
  const roomId = Number(chatRoomId);

  // --- GET Request (Fetching Messages) ---
  if (req.method === 'GET') {
    try {
      const messages = await MessagingService.getRoomMessages(
        userId,
        roomId,
        aroundId ? aroundId + 1 : beforeId,
        51,
      );
      if (aroundId && !messages.some((message) => message.id === aroundId))
        return res.status(404).json({ message: 'Message unavailable' });
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Has-More', String(messages.length > 50));
      res.status(200).json(messages.slice(-50));
    } catch (error) {
      logError('GET /api/messages/[chatRoomId] Error:', error);
      if (error.message.includes('Forbidden')) {
        return res.status(403).json({ message: publicErrorMessage(error) });
      }
      res.status(500).json({ message: 'Failed to fetch messages' });
    }
  }
  // --- POST/PUT/DELETE etc. are removed as message creation/modification is handled via WebSockets ---
  else {
    res.setHeader('Allow', ['GET']);
    res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }
}

export default withAuth(handler); // Apply authentication middleware
