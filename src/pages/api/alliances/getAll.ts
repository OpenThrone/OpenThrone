// /api/alliances/getAll
import type { NextApiResponse } from 'next';

import { withAuth } from '@/middleware/auth';
import { AllianceService } from '@/services';
import type { AuthenticatedRequest } from '@/types/api';

const getAll = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  try {
    const viewerId = Number(req.session?.user?.id);
    const alliances = await AllianceService.getAllAlliances(
      undefined,
      Number.isSafeInteger(viewerId) ? viewerId : null,
    );
    return res.status(200).json(alliances);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export default withAuth(getAll);
