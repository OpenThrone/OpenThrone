// pages/api/armory/convert.ts
import type { NextApiResponse } from "next"; // Removed NextApiRequest
import { withAuth } from "@/middleware/auth";
import type { AuthenticatedRequest } from '@/types/api'; // Import AuthenticatedRequest
import { ArmoryService } from "@/services";
import { logError } from "@/utils/logger";
import { error } from "console";



const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => { // Use AuthenticatedRequest
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, fromItem, toItem, conversionAmount } = req.body;

  if (!userId || !fromItem || !toItem || !conversionAmount) {
    return res.status(400).json({ error: 'Invalid input data' });
  }

  if (userId !== req.session.user.id) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const result = await ArmoryService.convertItems({
      userId: Number(userId),
      fromItem,
      toItem,
      conversionAmount: Number(conversionAmount),
    });

    return res.status(200).json({
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    logError(error);
    return res.status(500).json({ error: 'Failed to perform conversion' });
  }
};

export default withAuth(handler);
