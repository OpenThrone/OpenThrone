import { NextApiResponse } from 'next';
import { withAuth } from '@/middleware/auth';
import { highRiskLimiter, runExpressMiddleware } from '@/middleware/rateLimit';
import { z } from 'zod';
import { respondToGoldRequest } from '@/services/friendTransfer.service';
import { stringifyObj } from '@/utils/jsonHelpers';
import type { AuthenticatedRequest } from '@/types/api';

const ResponseSchema = z.object({
  action: z.enum(['accept', 'decline']),
  message: z.string().optional(),
});

const respondHandler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  if (req.method !== 'PUT') {
    return res.status(405).end();
  }

  const session = req.session;
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { requestId } = req.query;
  const requestIdNum = Number(requestId);

  if (isNaN(requestIdNum)) {
    return res.status(400).json({ error: 'Invalid request ID' });
  }

  const parseResult = ResponseSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid request body', details: parseResult.error.flatten().fieldErrors });
  }

  const { action, message } = parseResult.data;
  const userId = session.user.id;

  try {
    const result = await respondToGoldRequest({
      requestId: requestIdNum,
      action,
      message,
    });

    return res.status(200).json(stringifyObj({
      message: `Request ${action}ed successfully`,
      action,
      requestId: requestIdNum,
    }));
  } catch (error) {
    console.error('Error responding to gold request:', error);
    return res.status(400).json({ error: error.message });
  }
};

const wrapped = async (req: any, res: any) => {
  await runExpressMiddleware(req, res, highRiskLimiter);
  return respondHandler(req, res);
};

export default withAuth(wrapped);