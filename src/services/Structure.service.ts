import { z } from 'zod';

import {
  ArmoryUpgrades,
  EconomyUpgrades,
  Fortifications,
  HouseUpgrades,
  OffensiveUpgrades,
  SpyUpgrades,
} from '@/constants';
import prisma from '@/lib/prisma';
import UserModel from '@/models/Users';
import { getUserById } from '@/services';
import { logError } from '@/utils/logger';

// Type definitions for structure operations
export interface StructureUpgradeData {
  upgradeType:
    | 'fortifications'
    | 'houses'
    | 'economy'
    | 'offense'
    | 'armory'
    | 'spy';
  index: number;
}

export interface StructureUpgradeResult {
  message: string;
  data: {
    upgradeType: string;
    newLevel: number;
    newGold: string;
  };
}

// Zod schemas for validation
const StructureUpgradeSchema = z.object({
  upgradeType: z.enum([
    'fortifications',
    'houses',
    'economy',
    'offense',
    'armory',
    'spy',
  ]),
  index: z
    .number()
    .int()
    .nonnegative({ message: 'Index must be a non-negative integer.' }),
});

export class StructureService {
  /**
   * Upgrades a structure for a user
   */
  static async upgradeStructure(
    userId: number,
    data: StructureUpgradeData,
  ): Promise<StructureUpgradeResult> {
    const validatedData = StructureUpgradeSchema.parse(data);
    const { upgradeType, index: requestedIndex } = validatedData;

    try {
      const result = await prisma.$transaction(async (tx) => {
        // Fetch user data within the transaction
        const user = new UserModel(await getUserById(userId, tx));

        if (!user) {
          throw new Error('User not found within transaction');
        }

        let upgradeData: any;
        let upgradeCost: bigint;
        let currentLevel: number;
        let newLevel: number;

        // Validate structure_upgrades format
        let structureUpgrades: any[] = [];
        if (Array.isArray((user as any).structure_upgrades)) {
          structureUpgrades = (user as any).structure_upgrades.filter(
            (upg: any) =>
              typeof upg === 'object' &&
              upg !== null &&
              typeof upg.type === 'string' &&
              typeof upg.level === 'number',
          );
        }

        // Determine upgrade details based on type
        switch (upgradeType) {
          case 'fortifications':
            currentLevel =
              (user as any).fortLevel ?? (user as any).fort_level ?? 0;
            if (requestedIndex >= Fortifications.length)
              throw new Error('Upgrade index out of bounds.');
            if (requestedIndex !== currentLevel)
              throw new Error(
                `Cannot purchase level ${requestedIndex + 1}. Current level is ${currentLevel}. Purchase level ${currentLevel + 1}.`,
              );
            upgradeData = Fortifications[requestedIndex];
            upgradeCost = BigInt(upgradeData.cost);
            newLevel = requestedIndex + 1;
            break;

          case 'houses':
            currentLevel =
              (user as any).houseLevel ?? (user as any).house_level ?? 0;
            if (!(requestedIndex in HouseUpgrades))
              throw new Error('Upgrade index out of bounds.');
            if (requestedIndex !== currentLevel + 1)
              throw new Error(
                `Cannot purchase level ${requestedIndex}. Current level is ${currentLevel}. Purchase level ${currentLevel + 1}.`,
              );
            upgradeData =
              HouseUpgrades[requestedIndex as keyof typeof HouseUpgrades];
            upgradeCost = BigInt(upgradeData.cost);
            newLevel = requestedIndex;
            break;

          case 'economy':
            currentLevel =
              (user as any).economyLevel ?? (user as any).economy_level ?? 0;
            if (requestedIndex >= EconomyUpgrades.length)
              throw new Error('Upgrade index out of bounds.');
            if (requestedIndex !== currentLevel + 1)
              throw new Error(
                `Cannot purchase level ${requestedIndex}. Current level is ${currentLevel}. Purchase level ${currentLevel + 1}.`,
              );
            upgradeData = EconomyUpgrades[requestedIndex];
            upgradeCost = BigInt(upgradeData.cost);
            newLevel = requestedIndex;
            break;

          case 'offense':
          case 'armory':
          case 'spy':
            const structureType = upgradeType.toUpperCase();
            const upgradesArray =
              upgradeType === 'offense'
                ? OffensiveUpgrades
                : upgradeType === 'armory'
                  ? ArmoryUpgrades
                  : SpyUpgrades;
            const currentStructure = structureUpgrades.find(
              (s) => s.type === structureType,
            );
            currentLevel = currentStructure ? currentStructure.level : 1;

            if (requestedIndex >= upgradesArray.length)
              throw new Error('Upgrade index out of bounds.');
            if (requestedIndex !== currentLevel)
              throw new Error(
                `Cannot purchase level ${requestedIndex + 1}. Current level is ${currentLevel}. Purchase level ${currentLevel + 1}.`,
              );

            upgradeData = upgradesArray[requestedIndex];
            upgradeCost = BigInt(upgradeData.cost);
            newLevel = requestedIndex + 1;

            // Update the specific structure level within the array
            const updatedStructures = structureUpgrades.filter(
              (s) => s.type !== structureType,
            );
            updatedStructures.push({
              type: structureType,
              level: newLevel,
              userId,
            });
            structureUpgrades = updatedStructures;
            break;
        }

        // Check gold
        if (user.gold < upgradeCost) {
          throw new Error(
            `Not enough gold. Required: ${upgradeCost}, Available: ${user.gold}`,
          );
        }

        // Update user
        const updatedUser = await tx.users.update({
          where: { id: userId },
          data: {
            gold: user.gold - upgradeCost,
            ...(upgradeType === 'fortifications' && {
              fort_level: newLevel,
              fort_hitpoints: upgradeData.hitpoints,
            }),
            ...(upgradeType === 'houses' && { house_level: newLevel }),
            ...(upgradeType === 'economy' && { economy_level: newLevel }),
          },
          select: { gold: true },
        });

        // Update structure upgrades if needed (persist per-type rows)
        if (['offense', 'armory', 'spy'].includes(upgradeType)) {
          for (const s of structureUpgrades) {
            await tx.userStructureUpgrade.upsert({
              where: {
                userId_type: {
                  userId,
                  type: s.type,
                },
              },
              create: {
                userId,
                type: s.type,
                level: s.level,
              },
              update: {
                level: s.level,
              },
            });
          }
        }

        // Create bank history
        await tx.bank_history.create({
          data: {
            gold_amount: upgradeCost,
            from_user_id: userId,
            from_user_account_type: 'HAND',
            to_user_id: 0,
            to_user_account_type: 'BANK',
            date_time: new Date(),
            history_type: 'SALE',
            stats: {
              type: `${upgradeType.toUpperCase()}_UPGRADE`,
              new_level: newLevel,
              cost: upgradeCost.toString(),
            },
          },
        });

        return {
          newLevel,
          newGold: updatedUser.gold.toString(),
        };
      });

      return {
        message: `${upgradeType} upgrade purchased successfully to level ${result.newLevel}`,
        data: {
          upgradeType,
          newLevel: result.newLevel,
          newGold: result.newGold,
        },
      };
    } catch (error: any) {
      logError('Error upgrading structure', {
        userId,
        upgradeType,
        requestedIndex,
        error,
      });
      throw error;
    }
  }
}

export default StructureService;
