'use server';

import { getServerSession } from 'next-auth';

import { attackHandler } from '@/app/actions';
import { authOptions } from '@/pages/api/auth/[...nextauth]';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (session) {
    if (req.body.turns <= 0) {
      return res.status(400).json({ status: 'failed' });
    }

    if (req.body.turns > 10) {
      return res.status(400).json({ status: 'failed' });
    }

    const myUser = await prisma?.users.findUnique({
      where: { id: session.player.id },
    });

    if (!myUser) {
      return res.status(400).json({ status: 'failed' });
    }

    if (req.body.turns > myUser.turns) {
      return res.status(400).json({ status: 'failed' });
    }

    return res
      .status(200)
      .json(
        await attackHandler(
          session.player.id,
          parseInt(req.query.id),
          parseInt(req.body.turns)
        )
      );
  }
  // console.log('failed: ', session);
  return res.status(401).json({ status: 'failed' });
}
