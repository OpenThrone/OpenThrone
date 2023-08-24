import type { NextApiRequest, NextApiResponse } from 'next';

import prisma from '@/lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query;

  if (req.method === 'GET') {
    // Check if the user has clicked on this link in the last 24 hours
    const history = await prisma.recruit_history.findFirst({
      where: {
        from_user: Number(id),
        timestamp: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
        },
      },
    });

    if (history) {
      return res
        .status(400)
        .json({ error: 'You can only Recruit once in 24 hours.' });
    }
    return res.status(200).json({ showCaptcha: true });
  }
  if (req.method === 'POST') {
    // Handle captcha success and recruitment logic here
    // ... (similar to the previous example)
    return res.status(200).json({ success: true });
  }

  return res.status(405).end(); // Method not allowed
}
