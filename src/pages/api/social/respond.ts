import prisma from '@/lib/prisma'; 
import { withAuth } from '@/middleware/auth';
import { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest,
  res: NextApiResponse,) => {
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = req.session;
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { requestId, action } = req.body;

  if (!requestId || !action) {
    return res.status(400).json({ error: 'Missing friendId or action' });
  }

  if (!['accept', 'decline'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action' });
  }

  const newStatus = action === 'accept' ? 'accepted' : 'declined';
  const acceptanceDate = action === 'accept' ? new Date() : null;
  const endDate = action === 'decline' ? new Date() : null;

  try {
    const updateResult = await prisma.social.updateMany({
      where: {
        id: requestId,
        friendId: session.user.id,
        status: 'requested'
      },
      data: {
        status: newStatus,
        acceptanceDate: acceptanceDate,
        endDate: endDate
      }
    });

    if (updateResult.count === 0) {
      return res.status(404).json({ error: 'Friend request not found or already processed', id: requestId, user: session.user.id });
    }

    const message = action === 'accept' ? 'Friend request accepted successfully' : 'Friend request declined successfully';
    return res.status(200).json({ message });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to process friend request' });
  }
};

export default withAuth(handler);