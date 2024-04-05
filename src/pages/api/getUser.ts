import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';

import { authOptions } from './auth/[...nextauth]';
import { alertService } from '@/services';
import { stringifyObj } from '@/utils/numberFormatting';

export default async function getUser(req: NextApiRequest, res: NextApiResponse) {
  // Get the session on the server-side
  const session = await getServerSession(req, res, authOptions);

  // If there's no session, return an error
  if (!session) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  try {
    // Fetch the user based on the session's user ID
    const user = await prisma.users.findUnique({
      where: {
        id: typeof(session.user.id) === 'string' ? parseInt(session.user.id) : session.user.id,
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const updateLastActive = async (id: number) => {
      console.log('setting last active: ', new Date());
      return prisma.users.update({
        where: { id },
        data: { last_active: new Date() },
      });
    };
    if ((new Date() - new Date(user.last_active)) > 1000 * 30) {
      const updated = await updateLastActive(user.id);
      // Calculate the timestamp of user.last_active
      const userLastActiveTimestamp = new Date(user.last_active);
      // Check if there was an attack since user.last_active
      const attacks = await prisma.attack_log.findMany({
        where: {
          defender_id: user.id,
          timestamp: {
            gte: userLastActiveTimestamp,
          },
        },
      });

      if (attacks.length > 0) {
        user.beenAttacked = true;
      }
    }

    // Count the number of won attacks
    const wonAttacks = await prisma.attack_log.count({
      where: {
        attacker_id: user.id,
        winner: user.id,
      },
    });

    // Count the number of won defends
    const wonDefends = await prisma.attack_log.count({
      where: {
        defender_id: user.id,
        winner: user.id,
      },
    });

    const totalAttacks = await prisma.attack_log.count({
      where: {
        attacker_id: user.id,
      },
    });

    const totalDefends = await prisma.attack_log.count({
      where: {
        defender_id: user.id,
      },
    });


    // Add the counts to the user object
    user.won_attacks = wonAttacks;
    user.won_defends = wonDefends;
    user.totalAttacks = totalAttacks;
    user.totalDefends = totalDefends;
    res.status(200).json(stringifyObj(user));
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
