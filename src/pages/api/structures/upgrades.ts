import type { NextApiResponse } from 'next';
import type { AuthenticatedRequest } from '@/types/api';
import { z } from 'zod';
import { ArmoryUpgrades, EconomyUpgrades, Fortifications, HouseUpgrades, OffensiveUpgrades, SpyUpgrades } from '@/constants';
import { withAuth } from "@/middleware/auth";
import { logError } from "@/utils/logger";
import { StructureService } from '@/services';

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
    upgradeType: string;
    newLevel: number;
    newGold: string; // Return gold as string
  };
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
    const result = await StructureService.upgradeStructure(userId, {
      upgradeType,
      index: requestedIndex,
    });

    return res.status(200).json(result);

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
