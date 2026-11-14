import type { NextApiRequest, NextApiResponse } from 'next';
import type { Session } from 'next-auth';
import { z } from 'zod';

import {
  REALTIME_TICKET_TTL_MS,
  signRealtimeTicket,
} from '@/lib/realtimeTicket';
import { withAuth } from '@/middleware/auth';
import {
  assertCanJoinChatRoom,
  ChatRoomJoinError,
  withLockedChatRoom,
} from '@/services/chatRoomGuards';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

// Define a custom request type that includes the session injected by withAuth
interface TicketRequest extends NextApiRequest {
  session: Session;
}

const TicketRequestSchema = z.object({
  roomId: z.number().int().positive().optional(),
});

/**
 * POST /api/realtime/ticket — issues the short-lived signed ticket the
 * browser presents when opening a Durable Object websocket (#23 pilot).
 *
 * Auth is the standard session (`withAuth`), the same guard as every other
 * messaging endpoint. A room-scoped ticket is issued only after the full
 * join-authorization sequence (participant + alliance membership), so the DO
 * can trust `ticket → { userId, roomId }` without reaching NextAuth from the
 * worker entry; personal-channel tickets (no roomId) need only the session.
 * Full rationale in docs/realtime-pilot.md §7 (auth design).
 */
export const ticketHandler = async (
  req: TicketRequest,
  res: NextApiResponse,
) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const parsed = TicketRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: 'Invalid request body',
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const userId = Number(req.session.user.id);
  const { roomId } = parsed.data;

  if (roomId !== undefined) {
    try {
      await withLockedChatRoom(roomId, (tx) =>
        assertCanJoinChatRoom(tx, userId, roomId),
      );
    } catch (error: unknown) {
      if (error instanceof ChatRoomJoinError) {
        return res.status(403).json({ error: error.message });
      }
      logError('Error authorizing realtime room ticket', {
        userId,
        roomId,
        error,
      });
      return res.status(500).json({ error: 'Server error joining room.' });
    }
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    logError('JWT_SECRET is not set; cannot issue realtime tickets');
    return res
      .status(500)
      .json({ message: 'Realtime tickets are not configured' });
  }

  const ticket = await signRealtimeTicket(secret, {
    userId,
    roomId: roomId ?? null,
  });

  return res.status(200).json({
    ticket,
    roomScope: roomId ?? null,
    expiresAt: Date.now() + REALTIME_TICKET_TTL_MS,
  });
};

export default withAuth((req: AuthenticatedRequest, res: NextApiResponse) =>
  ticketHandler(req as TicketRequest, res),
);
