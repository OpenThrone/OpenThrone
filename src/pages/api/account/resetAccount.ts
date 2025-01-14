// pages/api/account/resetAccount.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from "@/lib/prisma";
import { getSession } from 'next-auth/react';
import { withAuth } from '@/middleware/auth';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const session = req.session;
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized', msg: session });
  }

  const userId = session.user.id;

  const { password } = req.body;
  if (!password) {
    throw new Error('Password is required');
  }
  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.users.findUnique({ where: { id: userId } });

      if (!user) {
        throw new Error('User not found');
      }

      const argon2 = require('argon2');
      const passwordMatches = await argon2.verify(user.password_hash, password);
      if (!passwordMatches) {
        throw new Error('Invalid password');
      }
      
      const updateData = {
        gold: 25000,
        attack_turns: 50,
        gold_in_bank: 0,
        fort_level: 1,
        fort_hitpoints: 50,
        experience: 0,
        items: [
          {
            type: 'WEAPON',
            level: 1,
            quantity: 0,
            usage: 'DEFENSE'
          },
          {
            type: 'WEAPON',
            level: 1,
            quantity: 0,
            usage: 'OFFENSE'
          }
        ],
        structure_upgrades: [
          {
            type: 'ARMORY',
            level: 1
          },
          {
            type: 'SPY',
            level: 1
          },
          {
            type: 'SENTRY',
            level: 1
          },
          {
            type: 'OFFENSE',
            level: 1
          }
        ],
        colorScheme: user.colorScheme,
        economy_level: 0,
        house_level: 0,
        bonus_points: [
          {
            type: 'OFFENSE',
            level: 0
          },
          {
            type: 'DEFENSE',
            level: 0
          },
          {
            type: 'INCOME',
            level: 0
          },
          {
            type: 'INTEL',
            level: 0
          },
          {
            type: 'PRICES',
            level: 0
          }
        ],
        units: [
          {
            type: 'CITIZEN',
            level: 1,
            quantity: 100
          },
          {
            type: 'OFFENSE',
            level: 1,
            quantity: 0
          },
          {
            type: 'DEFENSE',
            level: 1,
            quantity: 0
          }
        ],
        battle_upgrades: [],
        stats:[]
      };

      await tx.users.update({
        where: { id: user.id },
        data: updateData,
      });
    });

    return res.status(200).json({ message: 'Account reset successfully' });
  } catch (error) {
    return res.status(500).json({ message: `Error resetting account: ${error.message}` });
  }
}

export default withAuth(handler);
