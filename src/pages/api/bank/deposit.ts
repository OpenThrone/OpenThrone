import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import UserModel from '@/models/Users';
import { deposit, getDepositHistory } from '@/services/Bank.service';
import type { AuthenticatedRequest } from '@/types/api';
import { stringifyObj } from '@/utils/numberFormatting';

const DepositSchema = z.object({
  amount: z
    .string()
    .or(z.number())
    .transform((val) => BigInt(val)),
});

const depositHandler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
) => {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const validatedBody = DepositSchema.safeParse(req.body);
  if (!validatedBody.success) {
    return res
      .status(400)
      .json({ error: `Invalid deposit amount: ${req.body.amount}` });
  }

  const { session } = req;
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // Use centralized BigInt parser

  const { amount } = validatedBody.data;
  if (amount === null || amount <= 0) {
    return res
      .status(400)
      .json({ error: `Invalid deposit amount: ${req.body.amount}` });
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
    const updatedUser = await deposit(Number(session.user.id), amount);
    return res
      .status(200)
      .json({ message: 'Deposit successful', data: stringifyObj(updatedUser) });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

export default withAuth(depositHandler);
