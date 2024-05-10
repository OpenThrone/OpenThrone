'use server';

import { getServerSession } from 'next-auth';

import { authOptions } from '@/pages/api/auth/[...nextauth]';
import UserModel from '@/models/Users';
import { withAuth } from '@/middleware/auth';

const handler = async(req, res) => {
  const session = req.session;
  if (session) {
    const { id } = req.query;
    if (session.user.id !== 1 && session.user.id !== 2 && session.user.id !== id) {
      return res.status(401).json({ status: 'Not authorized' });
    }
    const user = await prisma?.users.findUnique({
      where: { id: Number(id) },
    });
    const userMod = new UserModel(user,true);
    return res.status(200).json(
      {
        status: 'success',
        player: userMod.displayName,
        level: userMod.level,
        offense: userMod.offense,
        defense: userMod.defense,
        units: userMod.units,
        items: userMod.items,

      });
  }
  // console.log('failed: ', session);
  return res.status(401).json({ status: 'Not logged in' });
}

export default withAuth(handler);