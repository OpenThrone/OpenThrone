import prisma from "@/lib/prisma";
import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '@/middleware/auth';
import { z } from 'zod';

const AddSocialSchema = z.object({
  friendId: z.number().int(),
  relationshipType: z.enum(['FRIEND', 'ENEMY'])
});

const addSocialRelation = async (req: NextApiRequest, res: NextApiResponse) => {
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
  console.log(req.body);
  console.log(relationshipType);

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
