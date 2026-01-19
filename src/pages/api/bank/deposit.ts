import type { NextApiResponse } from 'next';
import { withAuth } from '@/middleware/auth';
import { depositGold } from '@/services/Bank.service';
import type { AuthenticatedRequest } from '@/types/api';
import { stringifyObj } from '@/utils/numberFormatting';

const depositHandler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
) => {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const { session } = req;
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const updatedUser = await depositGold(
      Number(session.user.id),
      req.body?.amount,
    );
    return res
      .status(200)
      .json({ message: 'Deposit successful', data: stringifyObj(updatedUser) });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

export default withAuth(depositHandler);
