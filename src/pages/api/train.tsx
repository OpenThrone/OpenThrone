'use server';

import { getServerSession } from 'next-auth';

import { trainHandler } from '@/app/actions';
import { authOptions } from '@/pages/api/auth/[...nextauth]';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (session) {
    res.status(200).json(await trainHandler(session.player.id));
  } else {
    res.status(401).json({ status: 'failed' });
  }
}
