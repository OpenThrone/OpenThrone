import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '@/middleware/auth';
import { deposit } from '@/services/bank.service';
import { stringifyObj } from '@/utils/numberFormatting';

const depositHandler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const session = req.session;
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const depositAmount = BigInt(req.body.depositAmount);

  try {
    const updatedUser = await deposit(Number(session.user.id), depositAmount);
    return res.status(200).json({ message: 'Deposit successful', data: stringifyObj(updatedUser) });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

export default withAuth(depositHandler);
