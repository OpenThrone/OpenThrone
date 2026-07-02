import type { NextApiRequest, NextApiResponse } from 'next';

import { GeneralService } from '@/services';

/** Handles general reset game API requests. */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const token = req.headers.authorization;
  if (token !== process.env.TASK_SECRET) {
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
