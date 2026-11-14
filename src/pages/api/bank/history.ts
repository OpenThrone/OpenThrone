import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withAuth } from '@/middleware/auth';
import { getBankHistoryForUser } from '@/services/Bank.service';
import type { AuthenticatedRequest } from '@/types/api';
import { stringifyObj } from '@/utils/jsonHelpers';
import { publicErrorMessage } from '@/utils/publicError';

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

  try {
    // The zod schema defaults page/limit, so the fallbacks never fire; they
    // only satisfy the (optional-typed) inferred schema output.
    const { page, limit, ...filterFlags } = validatedQuery.data;
    const currentPage = page ?? 0;
    const pageSize = limit ?? 10;
    // getBankHistoryForUser takes the raw skip offset (see Bank.service);
    // master's v0.4.1 fix paginates by page * limit.
    const skip = Math.max(0, currentPage) * pageSize;
    const { rows, total } = await getBankHistoryForUser(
      Number(session.user.id),
      { ...filterFlags, page: skip, limit: pageSize },
    );
    // We can calculate totalPages if desired, as:
    const totalPages = Math.ceil(total / pageSize);

    return res.status(200).json({
      rows: stringifyObj(rows),
      total,
      totalPages,
      currentPage,
      limit: pageSize,
    });
  } catch (error) {
    return res.status(400).json({ error: publicErrorMessage(error) });
  }
};

export default withAuth(historyHandler);
