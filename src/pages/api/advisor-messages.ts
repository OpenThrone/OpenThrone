import type { NextApiRequest, NextApiResponse } from 'next';

import prisma from '@/lib/prisma';

/** Handles advisor messages API requests. */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const messages = await prisma.advisor_messages.findMany({
      where: { is_active: true },
      orderBy: { sort_order: 'asc' },
      select: { id: true, message: true, sort_order: true },
    });
    return res.status(200).json({ messages });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch advisor messages' });
  }
}

export default handler;
