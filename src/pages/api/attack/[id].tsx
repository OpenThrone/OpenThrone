'use server';

import { getServerSession } from 'next-auth';

import { attackHandler } from '@/app/actions';
import { authOptions } from '@/pages/api/auth/[...nextauth]';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (session) {
    // console.log('success: ', session);
    res
      .status(200)
      .json(await attackHandler(session.player.id, parseInt(req.query.id)));
  } else {
    // console.log('failed: ', session);
    res.status(401).json({ status: 'failed' });
  }
}
