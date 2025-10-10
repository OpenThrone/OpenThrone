import prisma from "@/lib/prisma";
import { NextApiResponse } from 'next';
import { withAuth } from '@/middleware/auth';
import { deposit, getDepositHistory } from '@/services/bank.service';
import { stringifyObj } from '@/utils/numberFormatting';
import { parseBigInt } from '@/utils/jsonHelpers';
import UserModel from '@/models/Users';
import type { AuthenticatedRequest } from '@/types/api';

const depositHandler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  console.log('Deposit Request Body:', req.body);

  const session = req.session;
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // Use centralized BigInt parser

  const depositAmount = parseBigInt(req.body.depositAmount);
  console.log('Deposit Amount:', req.body.depositAmount, 'parsed:', depositAmount);
  if (depositAmount === null || depositAmount <= 0) {
    return res.status(400).json({ error: 'Invalid deposit amount' });
  }

  const history = await getDepositHistory(Number(session.user.id));
  const user = await prisma.users.findUnique({
    where: { id: Number(session.user.id) },
  });

  console.log('User:', user);
  const uModel = new UserModel(user);

  if (uModel.maximumBankDeposits - history.length <= 0) {
    return res.status(400).json({ error: 'Maximum deposits reached' });
  }

  try {
    const updatedUser = await deposit(Number(session.user.id), depositAmount);
    return res.status(200).json({ message: 'Deposit successful', data: stringifyObj(updatedUser) });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

export default withAuth(depositHandler);
