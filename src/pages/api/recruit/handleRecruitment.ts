import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '../auth/[...nextauth]';
import { PlayerUnit } from '@/types/typings';

function increaseCitizens(units: PlayerUnit[]) {
  const citizen = units.find((unit) => unit.type === 'CITIZEN');
  if (citizen) {
    citizen.quantity += 1;
  } else {
    units.push({ type: 'CITIZEN', level: 1, quantity: 1 });
  }
  return units;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).end(); // Method not allowed
  }

  const session = await getServerSession(req, res, authOptions);

  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { recruitedUserId, selfRecruit } = req.body;

  try {
    const newRecord = await prisma.recruit_history.create({
      data: {
        from_user: Number(recruitedUserId), // ID of the user being recruited
        to_user: Number(session.user.id),  // ID of the recruiter (current user)
        ip_addr: req.headers['cf-connecting-ip'] as string,
        timestamp: new Date(),
      },
    });

    if (newRecord) {
      let userToUpdate = await prisma.users.findUnique({
        where: { id: Number(session.user.id) },
      });

      if (selfRecruit) {
        userToUpdate = await prisma.users.findUnique({
          where: { id: Number(session.user.id) },
        });
      }

      // Update the number of citizens and gold for the user
      const updatedUnits = increaseCitizens(userToUpdate.units as PlayerUnit[]);
      await prisma.users.update({
        where: { id: userToUpdate.id },
        data: {
          units: updatedUnits,
          gold: {
            increment: 250,
          },
        },
      });

      return res.status(200).json({ success: true });
    } else {
      return res.status(400).json({ error: 'Failed to update user.' });
    }
  } catch (error) {
    console.error('Error in recruitment:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
