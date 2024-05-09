'use server';

import { getServerSession } from 'next-auth';

import { attackHandler } from '@/app/actions';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import UserModel from '@/models/Users';

export default async function handler(req, res) {
    const { id, token } = req.query;
    const user = await prisma?.users.findUnique({
      where: { id: Number(id) },
    });
    return res.status(200).json(
      {
        status: 'success',
        results: {
          player: user.display_name,
          xp: user.experience,
          units: user.units,
          items: user.items,
          battle_upgrades: user.battle_upgrades,
          structure_upgrades: user.structure_upgrades,
          fort: user.fort_level,
          proficiencies: user.bonus_points
        }
      });
  // console.log('failed: ', session);
  return res.status(401).json({ status: 'Not logged in' });
}
