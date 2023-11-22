'use server';

import { getServerSession } from 'next-auth';

import { attackHandler } from '@/app/actions';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import UserModel from '@/models/Users';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (session) {
    const { id } = req.query;
    const user = await prisma?.users.findUnique({
      where: { id: Number(id) },
    });
    const userMod = new UserModel(user,true);
    return res.status(200).json({ status: 'success', player: userMod.displayName, level: userMod.level, offense: userMod.offense, defense: userMod.defense, units: userMod.units, items: userMod.items });
  }
  // console.log('failed: ', session);
  return res.status(401).json({ status: 'Not logged in' });
}
