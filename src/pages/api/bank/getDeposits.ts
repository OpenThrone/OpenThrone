import type { NextApiRequest, NextApiResponse } from 'next';

import { withAuth } from '@/middleware/auth';
import { getDepositStatus } from '@/services/Bank.service';
import { publicErrorMessage } from '@/utils/publicError';

const getDeposits = async (req: NextApiRequest, res: NextApiResponse) => {
  const { session } = req;
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const status = await getDepositStatus(Number(session.user.id));
    if (!status) return res.status(404).json({ error: 'User not found' });

    return res.status(200).json(status);
  } catch (error) {
    return res.status(400).json({ error: publicErrorMessage(error) });
  }
};

export default withAuth(getDeposits);
