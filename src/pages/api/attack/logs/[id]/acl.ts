import { NextApiResponse } from 'next';
import { withAuth } from '@/middleware/auth';
import { logError } from '@/utils/logger';
import type { AuthenticatedRequest } from '@/types/api';
import { BattleService } from '@/services';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Extract the log ID from the URL
    const attackLogId = parseInt(req.query.id as string, 10);
    if (isNaN(attackLogId)) {
      return res.status(400).json({ message: 'Invalid log ID' });
    }

    // Extract user and room information from the request body
    const { userId, roomId, participantIds } = req.body;

    if (!userId || !roomId) {
      return res.status(400).json({ message: 'Missing required parameters' });
    }

    const result = await BattleService.manageAttackLogACL(attackLogId, {
      userId,
      roomId,
      participantIds
    });

    return res.status(200).json(result);
  } catch (error) {
    logError('Error sharing attack log:', error);
    return res.status(500).json({
      message: 'An error occurred while sharing the attack log',
      error: error.message,
    });
  }
}

export default withAuth(handler);