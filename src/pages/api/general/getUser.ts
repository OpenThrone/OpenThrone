import type { NextApiRequest, NextApiResponse } from 'next';
import { stringifyObj } from '@/utils/numberFormatting';
import { withAuth } from '@/middleware/auth';
import prisma from '@/lib/prisma';
import { getUpdatedStatus } from '@/services/user.service';
import { logError } from '@/utils/logger';
import type { UserApiResponse, PlayerRace, PlayerClass, Locales } from '@/types/typings';
import { AccountStatus } from '@prisma/client';
const getUser = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const session = (req as any).session; 
    const userId = typeof session.user.id === 'string' ? parseInt(session.user.id) : session.user.id;

    // Select only the fields needed for the DTO and calculations
    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: {
        id: true,
        display_name: true,
        race: true,
        class: true,
        experience: true,
        gold: true,
        gold_in_bank: true,
        fort_level: true,
        fort_hitpoints: true,
        house_level: true,
        attack_turns: true,
        units: true,
        items: true,
        last_active: true,
        bio: true,
        colorScheme: true,
        economy_level: true,
        avatar: true,
        structure_upgrades: true,
        battle_upgrades: true, 
        bonus_points: true, 
        locale: true,
        stats: true, 
        permissions: { select: { type: true } }, // Select only the 'type' from permissions
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update last active if over 10 minutes
    const now = new Date();
    const lastActiveDate = user.last_active ? new Date(user.last_active) : new Date(0); // Handle null case
    const timeSinceLastActive = now.getTime() - lastActiveDate.getTime();

    if (timeSinceLastActive > 10 * 60 * 1000) {
      await prisma.users.update({
        where: { id: userId },
        data: { last_active: now },
      });
      // Update the last_active in our local user object for the response
      user.last_active = now;
    }

    // Get and update user's current status
    const currentStatus = await getUpdatedStatus(user.id);

    // If user's status is not ACTIVE, handle accordingly
    if (['BANNED', 'SUSPENDED', 'CLOSED', 'TIMEOUT', 'VACATION'].includes(currentStatus)) {
      return res.status(403).json({ error: `Account is ${currentStatus.toLowerCase()}` });
    }

    // Check if the user has been attacked since last active
    const attacksSinceLastActive = await prisma.attack_log.findMany({
      where: {
        defender_id: user.id,
        timestamp: { gte: lastActiveDate },
      },
      select: {
        type: true,
        winner: true,
      }
    });

    // Calculate attack status
    const beenAttacked = attacksSinceLastActive.some(attack => attack.type === 'attack');
    const detectedSpy = attacksSinceLastActive.some(attack => attack.type !== 'attack' && attack.winner === user.id);

    // Count won attacks, won defends, total attacks, and total defends
    const [wonAttacks, wonDefends, totalAttacks, totalDefends] = await Promise.all([
      prisma.attack_log.count({ where: { attacker_id: user.id, winner: user.id } }),
      prisma.attack_log.count({ where: { defender_id: user.id, winner: user.id } }),
      prisma.attack_log.count({ where: { attacker_id: user.id } }),
      prisma.attack_log.count({ where: { defender_id: user.id } }),
    ]);

    // Construct the DTO
    // Construct the DTO with type casting
    const responseDto: UserApiResponse = {
      ...user,
      race: user.race as PlayerRace, // Cast to specific type
      class: user.class as PlayerClass, // Cast to specific type
      locale: user.locale as Locales, // Cast to specific type
      // Ensure BigInts are strings
      gold: user.gold.toString(),
      gold_in_bank: user.gold_in_bank.toString(),
      // Ensure Date is string
      last_active: user.last_active.toISOString(),
      // Add calculated fields
      beenAttacked,
      detectedSpy,
      won_attacks: wonAttacks,
      won_defends: wonDefends,
      totalAttacks: totalAttacks,
      totalDefends: totalDefends,
      currentStatus: currentStatus as AccountStatus | string,
      units: typeof user.units === 'string' ? JSON.parse(user.units) : user.units,
      items: typeof user.items === 'string' ? JSON.parse(user.items) : user.items,
      structure_upgrades: typeof user.structure_upgrades === 'string' ? JSON.parse(user.structure_upgrades) : user.structure_upgrades,
      battle_upgrades: typeof user.battle_upgrades === 'string' ? JSON.parse(user.battle_upgrades) : user.battle_upgrades,
      bonus_points: typeof user.bonus_points === 'string' ? JSON.parse(user.bonus_points) : user.bonus_points,
      stats: typeof user.stats === 'string' ? JSON.parse(user.stats) : user.stats,
    };

    res.status(200).json(stringifyObj(responseDto));
  } catch (error) {
    logError('Error in getUser:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export default withAuth(getUser);
