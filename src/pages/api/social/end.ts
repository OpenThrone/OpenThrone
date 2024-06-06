import prisma from "@/lib/prisma";
import { withAuth } from "@/middleware/auth";

const handler = async (req, res) => {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = req.session;
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { friendId } = req.body;

  if (!friendId) {
    return res.status(400).json({ error: 'Missing friendId' });
  }

  const playerId = session.user.id;

  try {
    await prisma.social.updateMany({
      where: {
        OR: [
          { playerId: playerId, friendId: friendId, status: 'accepted' },
          { playerId: friendId, friendId: playerId, status: 'accepted' }
        ]
      },
      data: {
        status: 'ended',
        endDate: new Date()
      }
    });
    return res.status(200).json({ message: 'Friendship ended successfully' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to end friendship' });
  }
};

export default withAuth(handler);
