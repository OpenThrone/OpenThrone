import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth/next';

import { authOptions } from '../auth/[...nextauth]';
import UserModel from '@/models/Users';
import { Fortifications, HouseUpgrades, OffenseiveUpgrades, SpyUpgrades } from '@/constants';

const prisma = new PrismaClient();

export default async(req, res) => {
  if (req.method === 'POST') {
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { currentPage, index } = req.body;
    const user = await prisma.users.findUnique({ where: { id: session.user.id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const userMod = new UserModel(user);
    // Implement logic based on currentPage and index
    switch (currentPage) {
      case 'fortifications':
        if (userMod.fortLevel !== index) {
          return res.status(400).json({ error: 'Invalid Fortification Index to upgrade to' });
        }
        if (userMod.gold < Fortifications[index].cost) {
          return res.status(400).json({ error: 'Not enough gold to purchase upgrade' });
        }
        await prisma.users.update({
          where: { id: session.user.id },
          data: {
            gold: userMod.gold - Fortifications[index].cost,
            fort_level: index + 1,
          },
        });
        break;
      case 'houses':
        if (userMod.fortLevel < HouseUpgrades[index].fortLevel) {
          return res.status(400).json({ error: 'Invalid Fortification Level to purchase upgrade' });
        }
        if (userMod.gold < HouseUpgrades[index].cost) {
          return res.status(400).json({ error: 'Not enough gold to purchase upgrade' });
        }
        await prisma.users.update({
          where: { id: session.user.id },
          data: {
            gold: userMod.gold - HouseUpgrades[index].cost,
            house_level: index + 1,
          },
        });
        // Logic for buying house upgrades
        break;
      // Add other cases for 'siege' and 'intel'
      default:
        return res.status(400).json({ message: 'Invalid upgrade type' });
    }

    // After processing, send a success response
    return res.status(200).json({ message: 'Upgrade purchased successfully', currentPage, index, house: HouseUpgrades[index] });
  } else {
    // Handle any non-POST requests
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}