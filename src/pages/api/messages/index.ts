import { withAuth } from "@/middleware/auth";
import { NextApiRequest, NextApiResponse } from "next";
import { MessagingService } from "@/services/Messaging.service";
import { logDebug, logError, logInfo } from "@/utils/logger";
import { Session } from "next-auth"; // Import Session type

// Define a custom request type that includes the session injected by withAuth
interface AuthenticatedRequest extends NextApiRequest {
  session: Session;
}

async function handler(req: AuthenticatedRequest, res: NextApiResponse) { // Use AuthenticatedRequest
  const userId = Number(req.session.user.id); // Access session correctly

  if (req.method === "GET") {
    try {
      const rooms = await MessagingService.getUserChatRooms(userId);
      logInfo("Fetched rooms for user:", userId);
      logInfo("Returning formatted rooms for user:", userId);
      logDebug("Formatted rooms:", rooms);
      return res.json(rooms);
    } catch (error) {
      logError('Error getting user chat rooms', { userId, error });
      return res.status(500).json({ message: 'Failed to fetch chat rooms' });
    }
  }

  if (req.method === "POST") {
    const { name, recipients, message, isPrivate = true } = req.body;

    try {
      const result = await MessagingService.createOrFindRoom(userId, { name, recipients, message, isPrivate });
      return res.status(result.isExisting ? 200 : 201).json(result);
    } catch (error) {
      logError('Error creating or finding chat room', { userId, data: req.body, error });
      if (error.message.includes('Conflict') || error.message.includes('could not create')) {
        return res.status(409).json({ message: error.message });
      }
      return res.status(500).json({ message: 'Failed to create conversation' });
    }
  }

  res.status(405).end();
}

export default withAuth(handler);
