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
            action: `${upgradeType}_upgrade`,
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

  const upgradeMappings = {
    fortifications: { data: Fortifications[index], cost: Fortifications[index].cost, update: { fort_level: index + 1, fort_hitpoints: Fortifications[index].hitpoints } },
    houses: { data: HouseUpgrades[index], cost: HouseUpgrades[index].cost, update: { house_level: index } },
    economy: { data: EconomyUpgrades[index], cost: EconomyUpgrades[index].cost, update: { economy_level: index } },
    offense: { data: OffensiveUpgrades[index], cost: OffensiveUpgrades[index].cost, update: { structure_upgrades: userMod.structure_upgrades.map(stat => stat.type === 'OFFENSE' ? { ...stat, level: index + 1 } : stat) } },
    armory: { data: ArmoryUpgrades[index], cost: ArmoryUpgrades[index].cost, update: { structure_upgrades: userMod.structure_upgrades.map(stat => stat.type === 'ARMORY' ? { ...stat, level: index + 1 } : stat) } },
    spy: { data: SpyUpgrades[index], cost: SpyUpgrades[index].cost, update: { structure_upgrades: userMod.structure_upgrades.map(stat => stat.type === 'SPY' ? { ...stat, level: index + 1 } : stat) } },
  };

  const upgradeData = upgradeMappings[currentPage];
  if (!upgradeData) {
    return res.status(400).json({ error: 'Upgrade type not implemented' });
  }

  return await processUpgrade(req, res, currentPage, upgradeData.data, upgradeData.cost, upgradeData.update);
};

export default withAuth(upgrades);
