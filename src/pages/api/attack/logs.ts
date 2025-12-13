import { withAuth } from '@/middleware/auth';
import { NextApiResponse } from 'next';
import type { AuthenticatedRequest } from '@/types/api';
import { BattleService } from '@/services';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const session = req.session;
  if (!session?.user?.id) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const userId = session.user.id;

  const {
    page = 0,
    limit = 10,
    player,
    minPillage,
    maxPillage,
    sortBy,
    sortOrder
  } = req.query;

  try {
    const result = await BattleService.getAttackLogs(userId, {
      page: parseInt(page.toString(), 10),
      limit: parseInt(limit.toString(), 10),
      player: player as string,
      minPillage: minPillage ? parseInt(minPillage.toString(), 10) : undefined,
      maxPillage: maxPillage ? parseInt(maxPillage.toString(), 10) : undefined,
      sortBy: sortBy as string,
      sortOrder: sortOrder as 'asc' | 'desc'
    });

    res.status(200).json(result);
  } catch (error) {
    console.error('Error getting attack logs:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

export default withAuth(handler)
