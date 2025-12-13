// /api/alliances/getAll
import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '@/middleware/auth';
import { AllianceService } from '@/services';

const getAll = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  try {
    const alliances = await AllianceService.getAllAlliances();
    return res.status(200).json(alliances);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export default withAuth(getAll);
