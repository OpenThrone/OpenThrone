import type { NextApiRequest, NextApiResponse } from 'next';
import { stringifyObj } from '@/utils/numberFormatting';
import { withAuth } from '@/middleware/auth';
import prisma from '@/lib/prisma';
import { getUpdatedStatus } from '@/services/user.service';

const getUser = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const session = req.session;
    const userId = typeof session.user.id === 'string' ? parseInt(session.user.id) : session.user.id;

    const user = await prisma.users.findUnique({
      where: { id: userId },
      include: { permissions: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update last active if over 10 minutes
    const now = new Date();
    const timeSinceLastActive = now.getTime() - new Date(user.last_active).getTime();
    if (timeSinceLastActive > 10 * 60 * 1000) {
      console.log('Updating last active for user:', userId);
      await prisma.users.update({
        where: { id: userId },
        data: { last_active: now },
      });
    }

    // Get and update user's current status
    const currentStatus = await getUpdatedStatus(user.id);

    // If user's status is not ACTIVE, handle accordingly
    if (['BANNED', 'SUSPENDED', 'CLOSED', 'TIMEOUT', 'VACATION'].includes(currentStatus)) {
      return res.status(403).json({ error: `Account is ${currentStatus.toLowerCase()}` });
    }

    // Check if the user has been attacked since last active
    const lastActiveTimestamp = new Date(user.last_active);
    const attacks = await prisma.attack_log.findMany({
      where: {
        defender_id: user.id,
        timestamp: { gte: lastActiveTimestamp },
      },
    });

    // Attach attack status to user object
    const userData = {
      ...user,
      beenAttacked: attacks.some(attack => attack.type === 'attack'),
      detectedSpy: attacks.some(attack => attack.type !== 'attack' && attack.winner === user.id),
    };

    // Count won attacks, won defends, total attacks, and total defends
    const [wonAttacks, wonDefends, totalAttacks, totalDefends] = await Promise.all([
      prisma.attack_log.count({ where: { attacker_id: user.id, winner: user.id } }),
      prisma.attack_log.count({ where: { defender_id: user.id, winner: user.id } }),
      prisma.attack_log.count({ where: { attacker_id: user.id } }),
      prisma.attack_log.count({ where: { defender_id: user.id } }),
    ]);

    // Attach counts to userData object
    userData.won_attacks = wonAttacks;
    userData.won_defends = wonDefends;
    userData.totalAttacks = totalAttacks;
    userData.totalDefends = totalDefends;

    // Attach current status to userData
    userData.currentStatus = currentStatus;

    res.status(200).json(stringifyObj(userData));
  } catch (error) {
    console.error('Error in getUser:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export default withAuth(getUser);
