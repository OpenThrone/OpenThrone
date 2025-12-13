import { NextApiRequest, NextApiResponse } from 'next';
import { MessagingService } from '@/services/Messaging.service';
import { getSocketIO } from '@/lib/socket';
import { withAuth } from '@/middleware/auth';
import { logError } from '@/utils/logger';
import { Session } from 'next-auth'; // Import Session type

// Define a custom request type that includes the session injected by withAuth
interface AuthenticatedRequest extends NextApiRequest {
  session: Session;
}

async function handler(req: AuthenticatedRequest, res: NextApiResponse) { // Use AuthenticatedRequest
  const { chatRoomId } = req.query;
  const session = req.session; // Now correctly typed

  if (!session) {
    // This should ideally not happen if withAuth is working correctly
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const userId = Number(session.user.id);
  const roomId = Number(chatRoomId);

  // --- GET Request (Fetching Messages) ---
  if (req.method === 'GET') {
    try {
      const messages = await MessagingService.getRoomMessages(userId, roomId);
      res.status(200).json(messages);
    } catch (error) {
      logError("GET /api/messages/[chatRoomId] Error:", error);
      if (error.message.includes('Forbidden')) {
        return res.status(403).json({ message: error.message });
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