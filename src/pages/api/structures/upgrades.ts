import prisma from "@/lib/prisma";
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import UserModel from '@/models/Users';
import { ArmoryUpgrades, EconomyUpgrades, Fortifications, HouseUpgrades, OffenseiveUpgrades, SpyUpgrades } from '@/constants';

const upgrades = async(req, res) => {
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
    const structure_upgrades = (type: string) => {
      return userMod.structure_upgrades.map(stat => {
        if (stat.type === type) {
          return { ...stat, level: stat.level + 1 };
        }
        return stat;
      });
    };
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
            gold: userMod.gold - BigInt(Fortifications[index].cost),
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
            gold: userMod.gold - BigInt(HouseUpgrades[index].cost),
            house_level: index,
          },
        });
        // Logic for buying house upgrades
        break;
      case 'economy':
        if (userMod.fortLevel < EconomyUpgrades[index].fortLevel) {
          return res.status(400).json({ error: 'Invalid Fortification Level to purchase upgrade' });
        }
        if (userMod.gold < EconomyUpgrades[index].cost) {
          return res.status(400).json({ error: 'Not enough gold to purchase upgrade' });
        }
        await prisma.users.update({
          where: { id: session.user.id },
          data: {
            gold: userMod.gold - BigInt(EconomyUpgrades[index].cost),
            economy_level: index,
          },
        });
        break;
      case 'offense':
        if (userMod.offensiveLevel < OffenseiveUpgrades[index].fortLevel) {
          return res.status(400).json({ error: 'Invalid Offensive Upgrade Level to purchase upgrade' });
        }
        if (userMod.gold < OffenseiveUpgrades[index].cost) {
          return res.status(400).json({ error: 'Not enough gold to purchase upgrade' });
        }
        
        await prisma.users.update({
          where: { id: session.user.id },
          data: {
            gold: userMod.gold - BigInt(OffenseiveUpgrades[index].cost),
            structure_upgrades: structure_upgrades('OFFENSE'),
          },
        });
        break;
      case 'armory':
        if (userMod.armoryLevel < ArmoryUpgrades[index].level - 1) {
          return res.status(400).json({ error: 'Invalid Armory Upgrade Level to purchase upgrade' });
        }
        if (userMod.gold < ArmoryUpgrades[index].cost) {
          return res.status(400).json({ error: 'Not enough gold to purchase upgrade' });
        }
        if (userMod.fortLevel < ArmoryUpgrades[index].fortLevel) {
          return res.status(400).json({ error: 'Invalid Fortification Level to purchase upgrade' });
        }
        await prisma.users.update({
          where: { id: session.user.id },
          data: {
            gold: userMod.gold - BigInt(ArmoryUpgrades[index].cost),
            structure_upgrades: structure_upgrades('ARMORY'),
          },
        });
        break;
      case 'spy':
        if (userMod.spyLevel < SpyUpgrades[index].level - 1) {
          return res.status(400).json({ error: 'Invalid Spy Upgrade Level to purchase upgrade' });
        }
        if (userMod.gold < SpyUpgrades[index].cost) {
          return res.status(400).json({ error: 'Not enough gold to purchase upgrade' });
        }
        if (userMod.fortLevel < SpyUpgrades[index].fortLevel) {
          return res.status(400).json({ error: 'Invalid Fortification Level to purchase upgrade' });
        }
        await prisma.users.update({
          where: { id: session.user.id },
          data: {
            gold: userMod.gold - BigInt(SpyUpgrades[index].cost),
            structure_upgrades: structure_upgrades('SPY'),
          },
        });
        break;
      default:
        return res.status(400).json({ message: 'Not Implemented' });
    }

    // After processing, send a success response
    return res.status(200).json({ message: 'Upgrade purchased successfully', currentPage, index, house: HouseUpgrades[index] });
  } else {
    // Handle any non-POST requests
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

export default upgrades;