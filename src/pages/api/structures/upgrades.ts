import prisma from "@/lib/prisma";
import UserModel from '@/models/Users';
import { ArmoryUpgrades, EconomyUpgrades, Fortifications, HouseUpgrades, OffensiveUpgrades, SpyUpgrades } from '@/constants';
import { withAuth } from "@/middleware/auth";

const processUpgrade = async (req, res, upgradeType, upgradeData, goldCost, updateData) => {
  try {
    const session = req?.session || null;
    if (!session?.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await prisma.users.findUnique({ where: { id: session.user.id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userMod = new UserModel(user);
    const userGold = BigInt(userMod.gold.toString());
    const upgradeCost = BigInt(goldCost);

    if (userGold < upgradeCost) {
      return res.status(400).json({ error: 'Not enough gold to purchase upgrade' });
    }

    await prisma.$transaction([
      prisma.users.update({
        where: { id: session.user.id },
        data: {
          gold: userGold - upgradeCost,
          ...updateData,
        },
      }),
      prisma.bank_history.create({
        data: {
          gold_amount: upgradeCost,
          from_user_id: session.user.id,
          from_user_account_type: 'HAND',
          to_user_id: 0,
          to_user_account_type: 'BANK',
          date_time: new Date(),
          history_type: 'SALE',
          stats: {
            type: `${upgradeType}_UPGRADES`,
            new_structure: upgradeData,
          },
        },
      }),
    ]);

    return res.status(200).json({
      success: true,
      message: `${upgradeType} upgrade purchased successfully`,
      data: { upgradeType, upgradeDetails: upgradeData },
    });
  } catch (error) {
    console.error('Upgrade error:', error);
    return res.status(500).json({ error: 'An error occurred while processing your upgrade.' });
  }
};

const upgrades = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const { currentPage, index } = req.body;

  if (!Number.isInteger(index) || index < 0) {
    return res.status(400).json({ error: 'Invalid upgrade index' });
  }

  const user = await prisma.users.findUnique({ where: { id: req.session.user.id } });
  const userMod = new UserModel(user);

  switch (currentPage) {
    case "fortifications":
      return await processUpgrade(req, res, currentPage, Fortifications[index], Fortifications[index].cost, { fort_level: index + 1, fort_hitpoints: Fortifications[index].hitpoints });
    
    case "houses":
      return await processUpgrade(req, res, currentPage, HouseUpgrades[index], HouseUpgrades[index].cost, { house_level: index });

    case "economy":
      return await processUpgrade(req, res, currentPage, EconomyUpgrades[index], EconomyUpgrades[index].cost, { economy_level: index });

    case "offense":
      return await processUpgrade(req, res, currentPage, OffensiveUpgrades[index], OffensiveUpgrades[index].cost, { structure_upgrades: userMod.structure_upgrades.map(stat => stat.type === 'OFFENSE' ? { ...stat, level: index + 1 } : stat) });

    case "armory":
      return await processUpgrade(req, res, currentPage, ArmoryUpgrades[index], ArmoryUpgrades[index].cost, { structure_upgrades: userMod.structure_upgrades.map(stat => stat.type === 'ARMORY' ? { ...stat, level: index + 1 } : stat) });

    case "spy":
      return await processUpgrade(req, res, currentPage, SpyUpgrades[index], SpyUpgrades[index].cost, { structure_upgrades: userMod.structure_upgrades.map(stat => stat.type === 'SPY' ? { ...stat, level: index + 1 } : stat) });

    default:
      return res.status(400).json({ error: 'Upgrade type not implemented' });
  }
};

export default withAuth(upgrades);
