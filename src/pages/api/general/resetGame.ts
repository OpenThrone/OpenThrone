import { timingSafeEqual } from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';

import { GeneralService } from '@/services/General.service';

/** Compares the Authorization header to TASK_SECRET without leaking timing. */
const isAuthorizedResetRequest = (
  authorization: string | undefined,
): boolean => {
  const taskSecret = process.env.TASK_SECRET;
  if (!taskSecret || !authorization) {
    return false;
  }

  const provided = Buffer.from(authorization);
  const expected = Buffer.from(taskSecret);
  if (provided.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(provided, expected);
};

/** Handles general reset game API requests. */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  if (!isAuthorizedResetRequest(req.headers.authorization)) {
    return res.status(403).json({
      message: `Unauthorized: Token Invalid`,
    });
  }

  try {
    const result = await GeneralService.resetGame();
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ message: `Error: ${error.message}` });
  }
}
