// pages/api/bank/history.js
import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '@/middleware/auth';
import { getBankHistory } from '@/services/bank.service';
import { stringifyObj } from '@/utils/numberFormatting';

const historyHandler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const session = req.session;
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { deposits, withdraws, war_spoils, transfers, sale } = req.query;
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
      history_type: 'WAR_SPOILS',
    });
  }

  if (transfers === 'true') {
    conditions.push({
      history_type: 'PLAYER_TRANSFER',
    });
  }


  if (sale === 'true') {
    conditions.push({
      history_type: 'SALE',
    });
  }

  try {
    const bankHistory = await getBankHistory(conditions);
    return res.status(200).json(stringifyObj(bankHistory));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

export default withAuth(historyHandler);
