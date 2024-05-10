// pages/api/bank/history.js
import { PrismaClient } from '@prisma/client';

import { NextApiRequest, NextApiResponse } from 'next';
import { stringifyObj } from '@/utils/numberFormatting';
import { withAuth } from '@/middleware/auth';
const prisma = new PrismaClient();

const history = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const session = req.session;
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { deposits, withdraws, war_spoils, transfers } = req.query;

  let conditions = [];

  if (deposits === 'true') {
    conditions.push({
      from_user_account_type: 'HAND',
      to_user_account_type: 'BANK',
    });
  }

  if (withdraws === 'true') {
    conditions.push({
      from_user_account_type: 'BANK',
      to_user_account_type: 'HAND',
    });
  }

  if (war_spoils === 'true') {
    conditions.push({
      history_type: 'WAR_SPOILS'
    });
  }

  if (transfers === 'true') {
    conditions.push({
      history_type: 'TRANSFER'
    });
  }

  const bankHistory = await prisma.bank_history.findMany({
    where: {
      OR: conditions.length > 0 ? conditions : undefined,
    },
    orderBy: {
      date_time: 'desc',
    },
  });

  return res.status(200).json(stringifyObj(bankHistory));
};

export default withAuth(history);
