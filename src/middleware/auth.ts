// middleware/auth.ts
import { NextApiRequest, NextApiResponse, NextApiHandler } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '../pages/api/auth/[...nextauth]';

export const withAuth = (handler: NextApiHandler, override: boolean = false) => async (req: NextApiRequest, res: NextApiResponse) => {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    if(!override)
      return res.status(401).json({ error: 'Unauthorized' });
  }
  req.session = session;
  return handler(req, res);
};
