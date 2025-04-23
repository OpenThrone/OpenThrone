import type { NextApiResponse } from 'next';
import type { AuthenticatedRequest } from '@/types/api';
import { z } from 'zod';
import prisma from "@/lib/prisma";
// Removed UserModel import as direct user object properties will be used
import { ArmoryUpgrades, EconomyUpgrades, Fortifications, HouseUpgrades, OffensiveUpgrades, SpyUpgrades } from '@/constants';
import { withAuth } from "@/middleware/auth";
import { logError } from "@/utils/logger";
import { Prisma } from '@prisma/client';

// Define allowed upgrade types
const UpgradeTypeEnum = z.enum([
  "fortifications",
  "houses",
  "economy",
  "offense",
  "armory",
  "spy"
]);

// Zod schema for the request body
const UpgradeRequestSchema = z.object({
  currentPage: UpgradeTypeEnum,
  index: z.preprocess(
    (val) => (typeof val === 'string' ? parseInt(val, 10) : val),
    z.number().int().nonnegative({ message: 'Index must be a non-negative integer.' })
  ),
});

// Define response types
type ApiErrorResponse = { error: string; details?: any };
type ApiSuccessResponse = {
  message: string;
  data: {
    upgradeType: z.infer<typeof UpgradeTypeEnum>;
    newLevel: number;
    newGold: string; // Return gold as string
  };
};

// Define type for structure upgrades array (adjust based on actual Prisma schema if needed)
type StructureUpgrade = {
    type: 'OFFENSE' | 'ARMORY' | 'SPY'; // Add other types if they exist
    level: number;
};

const handler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiSuccessResponse | ApiErrorResponse>
) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  if (!req.session?.user?.id) {
    logError(null, { requestPath: req.url }, 'Auth session missing in upgrades handler');
    return res.status(401).json({ error: 'Authentication required.' });
  }

  // Validate request body
  const parseResult = UpgradeRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body.',
      details: parseResult.error.flatten().fieldErrors,
    });
  }

  const { currentPage: upgradeType, index: requestedIndex } = parseResult.data;
  const userId = req.session.user.id;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Fetch user data within the transaction
      const user = await tx.users.findUnique({
        where: { id: userId },
        // Select all fields needed for validation and updates for any upgrade type
        select: {
            gold: true,
            fort_level: true,
            house_level: true,
            economy_level: true,
            structure_upgrades: true
        },
      });

      if (!user) {
        throw new Error('User not found within transaction');
      }

      let upgradeData: any; // Holds the specific upgrade details from constants
      let upgradeCost: bigint;
      let currentLevel: number;
      let updatePayload: Prisma.usersUpdateInput = {}; // Correct Prisma type casing
      let newLevel: number;

      // Validate structure_upgrades format if necessary
      let structureUpgrades: StructureUpgrade[] = [];
      if (Array.isArray(user.structure_upgrades)) {
          // Basic validation, refine based on actual structure
          structureUpgrades = user.structure_upgrades.filter(
              (upg): upg is StructureUpgrade => typeof upg === 'object' && upg !== null && typeof upg.type === 'string' && typeof upg.level === 'number'
          );
      } else {
          // Handle case where it might be null or invalid JSON
          logError(null, { userId, structure_upgrades: user.structure_upgrades }, 'Invalid structure_upgrades format in DB');
          // Initialize as empty array or throw error depending on requirements
      }


      // Determine upgrade details based on type
      switch (upgradeType) {
        case "fortifications":
          currentLevel = user.fort_level;
          if (requestedIndex >= Fortifications.length) throw new Error("Upgrade index out of bounds.");
          if (requestedIndex !== currentLevel) throw new Error(`Cannot purchase level ${requestedIndex + 1}. Current level is ${currentLevel}. Purchase level ${currentLevel + 1}.`);
          upgradeData = Fortifications[requestedIndex];
          upgradeCost = BigInt(upgradeData.cost);
          newLevel = requestedIndex + 1; // Fort level seems 1-based in constants? Check logic. Assuming index = target level - 1
          updatePayload = { fort_level: newLevel, fort_hitpoints: upgradeData.hitpoints };
          break;

        case "houses":
          currentLevel = user.house_level;
           // Check if the requested index exists as a key in the HouseUpgrades object
           if (!(requestedIndex in HouseUpgrades)) throw new Error("Upgrade index out of bounds.");
           
           if (requestedIndex !== currentLevel + 1) throw new Error(`Cannot purchase level ${requestedIndex}. Current level is ${currentLevel}. Purchase level ${currentLevel + 1}.`);
          upgradeData = HouseUpgrades[requestedIndex as keyof typeof HouseUpgrades];
          upgradeCost = BigInt(upgradeData.cost);
          newLevel = requestedIndex; // newLevel represents the index here
          updatePayload = { house_level: newLevel };
          break;

        case "economy":
          currentLevel = user.economy_level;
           if (requestedIndex >= EconomyUpgrades.length) throw new Error("Upgrade index out of bounds.");
          
           if (requestedIndex !== currentLevel + 1) throw new Error(`Cannot purchase level ${requestedIndex}. Current level is ${currentLevel}. Purchase level ${currentLevel + 1}.`);
          upgradeData = EconomyUpgrades[requestedIndex];
          upgradeCost = BigInt(upgradeData.cost);
          newLevel = requestedIndex;
          updatePayload = { economy_level: newLevel };
          break;

        case "offense":
        case "armory":
        case "spy":
          const structureType = upgradeType.toUpperCase() as StructureUpgrade['type'];
          const upgradesArray = upgradeType === "offense" ? OffensiveUpgrades : upgradeType === "armory" ? ArmoryUpgrades : SpyUpgrades;
          const currentStructure = structureUpgrades.find(s => s.type === structureType);
          currentLevel = currentStructure ? currentStructure.level : 0; // Default to 0 if not found

          if (requestedIndex >= upgradesArray.length) throw new Error("Upgrade index out of bounds.");
          // Check if the requested index exists as a key in the upgradesArray
          if (requestedIndex !== currentLevel) throw new Error(`Cannot purchase level ${requestedIndex + 1}. Current level is ${currentLevel}. Purchase level ${currentLevel + 1}.`);

          upgradeData = upgradesArray[requestedIndex];
          upgradeCost = BigInt(upgradeData.cost);
          newLevel = requestedIndex + 1;

          // Update the specific structure level within the array
          const updatedStructures = structureUpgrades.filter(s => s.type !== structureType); // Remove old entry
          updatedStructures.push({ type: structureType, level: newLevel }); // Add new entry
          // Ensure the payload is valid JSON for Prisma
          updatePayload = { structure_upgrades: updatedStructures as any }; // Cast needed if Prisma type isn't precise
          break;

        // No default needed due to Zod enum validation
      }

      // Check gold
      if (user.gold < upgradeCost) {
        throw new Error(`Not enough gold. Required: ${upgradeCost}, Available: ${user.gold}`);
      }

      // Update user
      const updatedUser = await tx.users.update({
        where: { id: userId },
        data: {
          gold: user.gold - upgradeCost,
          ...updatePayload,
        },
        select: { gold: true } // Select only needed updated value
      });

      // Create bank history
      await tx.bank_history.create({
        data: {
          gold_amount: upgradeCost,
          from_user_id: userId,
          from_user_account_type: 'HAND',
          to_user_id: 0, // Bank/System
          to_user_account_type: 'BANK',
          date_time: new Date(),
          history_type: 'SALE', // Or 'UPGRADE'?
          stats: {
            type: `${upgradeType.toUpperCase()}_UPGRADE`, // Consistent naming
            new_level: newLevel,
            cost: upgradeCost.toString(),
            // Optionally include upgradeData details if needed for history
          },
        },
      });

      return {
          newLevel: newLevel,
          newGold: updatedUser.gold.toString(),
      };
    });

    // Return success response
    return res.status(200).json({
      message: `${upgradeType} upgrade purchased successfully to level ${result.newLevel}`,
      data: {
        upgradeType: upgradeType,
        newLevel: result.newLevel,
        newGold: result.newGold,
      },
    });

  } catch (error: any) {
    const logContext = parseResult.success ? { userId, ...parseResult.data } : { userId, body: req.body };
    logError(error, logContext, 'API Error: /api/structures/upgrades');

    // Handle specific errors
    if (error.message?.includes("index out of bounds") || error.message?.startsWith("Cannot purchase level") || error.message?.startsWith("Not enough gold") || error.message?.startsWith("Invalid structure_upgrades format")) {
      return res.status(400).json({ error: error.message });
    }
     if (error.message === 'User not found within transaction') {
       return res.status(404).json({ error: 'User data inconsistency during transaction.' });
    }
    // Generic error
    return res.status(500).json({ error: 'An unexpected error occurred while processing the upgrade.' });
  }
};

export default withAuth(handler); // Correct export name
