import { NextApiResponse } from 'next';
import { withAuth } from '@/middleware/auth';
import { z } from 'zod';
import { SocialService } from '@/services/Social.service';
import type { AuthenticatedRequest } from '@/types/api';
import prisma from '@/lib/prisma';
import { getSocketIO } from '@/lib/socket';
import md5 from 'md5';

const AddSocialSchema = z.object({
  friendId: z.number().int(),
  relationshipType: z.enum(['FRIEND', 'ENEMY'])
});

const emitSocialCountUpdate = async (userId: number) => {
  const io = getSocketIO();
  if (!io) return;

  const [friendRequests, goldRequests] = await Promise.all([
    SocialService.countPendingRequests(userId),
    SocialService.countPendingGoldRequests(userId),
  ]);
  const totalCount = (friendRequests.count || 0) + (goldRequests.count || 0);
  io.to(`user-${userId}`).emit('socialCountUpdate', { count: totalCount });
};

const addSocialRelation = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const session = req.session;
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parseResult = AddSocialSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid request body', details: parseResult.error.flatten().fieldErrors });
  }

  const { friendId, relationshipType } = parseResult.data;
  const playerId = session.user.id;

  try {
    const result = await SocialService.addRelationship(playerId, { friendId, relationshipType });

    if (relationshipType === 'FRIEND') {
      const sender = await prisma.users.findUnique({
        where: { id: playerId },
        select: { display_name: true },
      });
      const senderName = sender?.display_name || 'someone';

      const io = getSocketIO();
      const message = `You have received a friend request from ${senderName}`;
      const hash = md5(message + friendId);
      io?.to(`user-${friendId}`).emit('friendRequestNotification', {
        message,
        hash,
        senderId: playerId,
        senderName,
      });

      await emitSocialCountUpdate(friendId);
    }

    res.status(200).json(result);
  } catch (error: any) {
    console.error('Error adding relationship:', error);
    res.status(400).json({ error: error.message });
  }
};

export default withAuth(addSocialRelation);
