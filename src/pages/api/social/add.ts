import { NextApiResponse } from 'next';
import { withAuth } from '@/middleware/auth';
import { z } from 'zod';
import { SocialService } from '@/services/Social.service';
import type { AuthenticatedRequest } from '@/types/api';

const AddSocialSchema = z.object({
  friendId: z.number().int(),
  relationshipType: z.enum(['FRIEND', 'ENEMY'])
});

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

    res.status(200).json(result);
  } catch (error: any) {
    console.error('Error adding relationship:', error);
    res.status(400).json({ error: error.message });
  }
};

export default withAuth(addSocialRelation);
