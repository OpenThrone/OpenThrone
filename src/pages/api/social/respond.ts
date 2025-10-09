import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import { logError } from '@/utils/logger';
import { NextApiResponse } from 'next';
import type { AuthenticatedRequest } from '@/types/api';
import { z } from 'zod';

const RespondSchema = z.object({
  requestId: z.number().int(),
  action: z.enum(['accept', 'decline']),
});

const handler = async (req: AuthenticatedRequest,
  res: NextApiResponse,) => {
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = req.session;
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parseResult = RespondSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parseResult.error.flatten().fieldErrors
    });
  }

  const { requestId, action } = parseResult.data;

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
      return res.status(404).json({
        error: 'Friend request not found or already processed',
        requestId,
        userId: session.user.id
      });
    }

    const message = action === 'accept'
      ? 'Friend request accepted successfully'
      : 'Friend request declined successfully';
    
    return res.status(200).json({
      message,
      action,
      requestId
    });
  } catch (error) {
    logError("Error processing friend request:", error);
    return res.status(500).json({ error: 'Failed to process friend request' });
  }
};

export default withAuth(handler);