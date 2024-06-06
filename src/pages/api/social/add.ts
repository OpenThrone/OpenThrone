import prisma from "@/lib/prisma";
import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '@/middleware/auth';

const addSocialRelation = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const session = req.session;
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { friendId, relationshipType } = req.body;
  const playerId = session.user.id;
  console.log(req.body);
  console.log(relationshipType)

  if (!['FRIEND', 'ENEMY'].includes(relationshipType)) {
    return res.status(400).json({ error: 'Invalid relationship type' });
  }

  try {

    const social = await prisma.social.findFirst({
      where: {
        OR: [
          { AND: [
            { playerId },
            { friendId },
            { relationshipType },
          ] },
          { AND: [
            { playerId: friendId },
            { friendId: playerId },
            { relationshipType },
          ] }
        ]
      },
    });

    if (social) {
      return res.status(400).json({ error: 'Relationship already exists or is pending a request.' });
    }

    await prisma.social.create({
      data: {
        playerId,
        friendId,
        relationshipType,
      },
    });
    res.status(200).json({ message: 'Relationship added successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add relationship' });
  }
};

export default withAuth(addSocialRelation);
