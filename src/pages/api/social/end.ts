import { withAuth } from "@/middleware/auth";
import { logError } from "@/utils/logger";
import { SocialService } from '@/services/Social.service';
import { z } from 'zod';

const EndRelationshipSchema = z.object({
  friendId: z.number().int()
});

const handler = async (req, res) => {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = req.session;
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parseResult = EndRelationshipSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid request body', details: parseResult.error.flatten().fieldErrors });
  }

  const { friendId } = parseResult.data;
  const playerId = session.user.id;

  try {
    const result = await SocialService.endRelationship(playerId, { friendId });
    return res.status(200).json(result);
  } catch (error) {
    logError("Error ending friendship:", error);
    return res.status(500).json({ error: error.message });
  }
};

export default withAuth(handler);
