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

  const { deposits, withdraws, war_spoils, transfers, sale, training, economy, recruitment, fortification } = req.query;
  const conditions = [];
  const transactionConditions = [];

  if (deposits === 'true') {
    transactionConditions.push({
      from_user_account_type: 'HAND',
      to_user_id: session.user.id,
      to_user_account_type: 'BANK',
      from_user_id: session.user.id,
      history_type: 'PLAYER_TRANSFER',
    });
  }

  if (withdraws === 'true') {
    transactionConditions.push({
      from_user_account_type: 'BANK',
      to_user_id: session.user.id,
      to_user_account_type: 'HAND',
      from_user_id: session.user.id,
      history_type: 'PLAYER_TRANSFER',
    });
  }

  if (war_spoils === 'true') {
    transactionConditions.push({
      history_type: 'WAR_SPOILS',
    });
  }

  if (transfers === 'true') {
    transactionConditions.push({
      history_type: 'PLAYER_TRANSFER',
      AND: [
        {
          OR: [
            { from_user_id: session.user.id },
            { to_user_id: session.user.id }
          ]
        },
        {
          NOT: [
            { from_user_id: session.user.id, to_user_id: session.user.id }
          ]
        }
      ]
    });
  }

  if (economy === 'true') {
    transactionConditions.push({
      history_type: 'ECONOMY',
      to_user_id: session.user.id,
    });
  }

  if (fortification === 'true') {
    transactionConditions.push({
      history_type: 'FORT_REPAIR',
      from_user_id: session.user.id,
    });
  }

  if (recruitment === 'true') {
    transactionConditions.push({
      history_type: 'RECRUITMENT',
      to_user_id: session.user.id,
    });
  }

  if (sale === 'true') {
    transactionConditions.push({
      history_type: 'SALE',
      stats: {
        path: ['type'],
        string_contains: 'ARMORY',
      }
    });
    transactionConditions.push({
      history_type: 'SALE',
      stats: {
        path: ['type'],
        string_contains: 'BATTLE_UPGRADES',
      }
    });
  }


  if (training === 'true') {
    transactionConditions.push({
      history_type: { in: ['SALE'] },
      stats: {
        path: ['type'],
        string_contains: 'TRAINING_',
      },
    });
  }


  if (transactionConditions.length > 0) {
    conditions.push({
      OR: transactionConditions,
    });
  }

  conditions.push({
    OR: [
      { from_user_id: session.user.id },
      { to_user_id: session.user.id },
    ],
  });

  //console.log('conditions: ', JSON.stringify(conditions));
  try {
    const bankHistory = await getBankHistory(conditions);
    return res.status(200).json(stringifyObj(bankHistory));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

export default withAuth(historyHandler);
