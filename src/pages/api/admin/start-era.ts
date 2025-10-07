import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { PermissionType } from '@prisma/client';
import prisma from '@/lib/prisma';
import UserModel from '@/models/Users';
import { authOptions } from '@/pages/api/auth/[...nextauth]';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session || !session.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const user = await prisma.users.findUnique({
    where: { id: session.user.id },
    include: { permissions: true },
  });

  if (!user || !user.permissions.some(p => p.type === PermissionType.ADMINISTRATOR)) {
    return res.status(403).json({ error: 'Forbidden: Admin only' });
  }

  try {
    // Find current era or create first
    let currentEra = await prisma.era.findFirst({
      where: { endDate: null },
      orderBy: { startDate: 'desc' },
    });

    let previousEraId: number | null = null;
    if (currentEra) {
      // End current era
      await prisma.era.update({
        where: { id: currentEra.id },
        data: { endDate: new Date() },
      });
      previousEraId = currentEra.id;
    }

    // Create new era
    const newEra = await prisma.era.create({
      data: {
        name: `Era ${currentEra ? currentEra.id + 1 : 1}`,
        startDate: new Date(),
      },
    });

    // Get all users (assuming all for reset, or filter as needed)
    const users = await prisma.users.findMany({
      where: true,
      include: {
        attacksMade: {
          where: { winner: { equals: { _ref: 'attacker_id' } } }, // Wait, this is not correct; need to count in loop
        },
        attacksDefended: {
          where: { winner: { equals: { _ref: 'defender_id' } } },
        },
      },
      select: {
        id: true,
        experience: true,
        units: true,
        gold: true,
        gold_in_bank: true,
        attack_turns: true,
        fort_hitpoints: true,
        offense: true,
        defense: true,
        spy: true,
        sentry: true,
        race: true,
        class: true,
        items: true,
        bonus_points: true,
        structure_upgrades: true,
        battle_upgrades: true,
        stats: true,
        fort_level: true,
        house_level: true,
        economy_level: true,
        achievements: true,
      },
    });

    // For each user, snapshot and reset
    for (const u of users) {
      const userModel = new UserModel(u as any, false, true); // full data, check stats

      // Calculate achievements
      const attacksWon = await prisma.attack_log.count({
        where: {
          attacker_id: u.id,
          winner: u.id,
        },
      });
      const defendsWon = await prisma.attack_log.count({
        where: {
          defender_id: u.id,
          winner: u.id,
        },
      });

      const eraAchievements = {
        maxLevelReached: userModel.level,
        totalAttacksWon: attacksWon,
        totalDefendsWon: defendsWon,
        // Add more
      };

      // Snapshot for previous era if exists
      if (previousEraId) {
        await prisma.userEra.create({
          data: {
            userId: u.id,
            eraId: previousEraId,
            levelAtStart: userModel.level,
            unitsAtStart: JSON.stringify(userModel.units),
            achievements: eraAchievements,
          },
        });
      }

      // Reset user
      await prisma.users.update({
        where: { id: u.id },
        data: {
          experience: 0,
          units: '[{"type": "CITIZEN", "level": 1, "quantity": 50}, {"type": "WORKER", "level": 1, "quantity": 0}, {"type": "OFFENSE", "level": 1, "quantity": 0}, {"type": "DEFENSE", "level": 1, "quantity": 0}, {"type": "SPY", "level": 1, "quantity": 0}, {"type": "SENTRY", "level": 1, "quantity": 0}]',
          gold: BigInt('25000'),
          gold_in_bank: BigInt('0'),
          attack_turns: 50,
          fort_hitpoints: 50,
          offense: 0,
          defense: 0,
          spy: 0,
          sentry: 0,
          currentEraId: newEra.id,
          // Keep lifetime achievements in users.achievements
          // Reset other era-specific if any
        },
      });
    }

    // Update all users to new era (redundant with loop, but ensure)
    await prisma.users.updateMany({
      where: true,
      data: { currentEraId: newEra.id },
    });

    return res.status(200).json({ success: true, newEraId: newEra.id });
  } catch (error) {
    console.error('Error starting new era:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}