import { PrismaClient } from '@prisma/client';

import { NextApiRequest, NextApiResponse } from 'next';
import { stringifyObj } from '@/utils/numberFormatting';
import { withAuth } from '@/middleware/auth';

const prisma = new PrismaClient();

const withdraw = (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const session = req.session;
  
  const withdrawAmount = BigInt(req.body.withdrawAmount.toString());

  // Fetch the user based on the session's user ID
  const user: { id: number; gold: bigint; gold_in_bank?: bigint } | null = await prisma.users.findUnique({
    where: {
      id: Number(session.user.id),
    },
  });
  if (withdrawAmount > user?.gold_in_bank) {
    return res.status(401).json(stringifyObj({ error: `Not enough gold for withdraw`, withdrawAmount: withdrawAmount, gold_in_bank: user?.gold_in_bank, difference: (withdrawAmount - user?.gold_in_bank) }));
  }

  await prisma.users.update({
    where: { id: Number(session.user.id) },
    data: {
      gold: user.gold + withdrawAmount,
      gold_in_bank: user?.gold_in_bank - withdrawAmount,
    },
  });

  await prisma.bank_history.create({
    data: {
      gold_amount: withdrawAmount,
      from_user_id: user.id,
      from_user_account_type: 'BANK',
      to_user_id: user.id,
      to_user_account_type: 'HAND',
      date_time: new Date().toISOString(),
      history_type: 'PLAYER_TRANSFER',
    },
  });

  // Return the updated user data or any other relevant response
  return res.status(200).json({ message: 'Withdraw successful' });
};

export default withAuth(withdraw);