import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withAuth } from '@/middleware/auth';
import { getBankHistory } from '@/services/Bank.service';
import type { AuthenticatedRequest } from '@/types/api';
import { stringifyObj } from '@/utils/jsonHelpers';

const HistoryQuerySchema = z.object({
  deposits: z.string().optional(),
  withdraws: z.string().optional(),
  war_spoils: z.string().optional(),
  transfers: z.string().optional(),
  sale: z.string().optional(),
  training: z.string().optional(),
  economy: z.string().optional(),
  recruitment: z.string().optional(),
  fortification: z.string().optional(),
  daily: z.string().optional(),
  friend_transfers: z.string().optional(),
  page: z.coerce.number().int().optional().default(0),
  limit: z.coerce.number().int().optional().default(10),
});

const historyHandler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
) => {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const validatedQuery = HistoryQuerySchema.safeParse(req.query);
  if (!validatedQuery.success) {
    return res.status(400).json({
      error: 'Invalid query parameters',
      details: validatedQuery.error.flatten().fieldErrors,
    });
  }

  const { session } = req;
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const {
    deposits,
    withdraws,
    war_spoils,
    transfers,
    sale,
    training,
    economy,
    recruitment,
    fortification,
    daily,
    friend_transfers,
    page,
    limit,
  } = validatedQuery.data;
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
            { to_user_id: session.user.id },
          ],
        },
        {
          NOT: [{ from_user_id: session.user.id, to_user_id: session.user.id }],
        },
      ],
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
      },
    });
    transactionConditions.push({
      history_type: 'SALE',
      stats: {
        path: ['type'],
        string_contains: '_UPGRADES',
      },
    });
    transactionConditions.push({
      history_type: 'SALE',
      stats: {
        path: ['action'],
        string_contains: '_upgrade',
      },
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

  if (daily === 'true') {
    transactionConditions.push({
      history_type: 'DAILY_RECRUIT',
      to_user_id: session.user.id,
    });
  }

  if (friend_transfers === 'true') {
    transactionConditions.push({
      history_type: { in: ['FRIEND_TRANSFER', 'FRIEND_REQUEST'] },
      OR: [{ from_user_id: session.user.id }, { to_user_id: session.user.id }],
    });
  }

  if (transactionConditions.length > 0) {
    conditions.push({
      OR: transactionConditions,
    });
  }

  conditions.push({
    OR: [{ from_user_id: session.user.id }, { to_user_id: session.user.id }],
  });

  // console.log('conditions: ', JSON.stringify(conditions));
  try {
    const { rows, total } = await getBankHistory(
      conditions,
      Number(limit),
      Number(page),
    );
    // We can calculate totalPages if desired, as:
    const totalPages = Math.ceil(total / Number(limit));

    return res.status(200).json({
      rows: stringifyObj(rows),
      total,
      totalPages,
      currentPage: Number(page),
      limit: Number(limit),
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

export default withAuth(historyHandler);
