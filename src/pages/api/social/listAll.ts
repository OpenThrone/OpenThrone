import prisma from "@/lib/prisma";
import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '@/middleware/auth';
import { stringifyObj } from '@/utils/numberFormatting';

const getTopSocialRelations = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const session = req.session;

  let { type, limit, playerId } = req.query;
  if (!playerId) {
    if (!session)
      return res.status(401).json({ error: 'Unauthorized' });
    playerId = session.user.id;
  }

  if (!['FRIEND', 'ENEMY', 'REQUESTS'].includes(type)) {
    return res.status(400).json({ error: 'Invalid relationship type' });
  }

  try {
    const whereCondition = {
      AND: [
        {
          OR: [
            { playerId: parseInt(playerId.toString()) },
            { friendId: parseInt(playerId.toString()) }
          ]
        }
      ]
    };

    if (type === 'REQUESTS') {
      whereCondition.AND.push({ status: 'requested' });
    } else {
      whereCondition.AND.push({
        relationshipType: type,
        status: 'accepted'
      });
    }

    const relations = await prisma.social.findMany({
      where: whereCondition,
      include: {
        player: {
          select: { id: true, display_name: true, race: true, class: true, avatar: true }
        },
        friend: {
          select: { id: true, display_name: true, race: true, class: true, avatar: true }
        }
      }
    });

    // Filter out the current player details and keep only the friend's details
    const modifiedRelations = relations.map(relation => {
      const { player, friend, ...restRelation } = relation;
      const contact = parseInt(playerId.toString()) === player.id ? friend : player;

      return {
        ...restRelation,
        friend: contact
      };
    });

    res.status(200).json(stringifyObj(modifiedRelations));
  } catch (error) {
    res.status(500).json({ error: 'Failed to get relationships', message: error.message });
  }
};

export default withAuth(getTopSocialRelations, true);