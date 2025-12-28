import { withAuth } from "@/middleware/auth";
import { NextApiResponse } from "next";
import { SocialService } from '@/services/Social.service';
import { stringifyObj } from "@/utils/jsonHelpers";
import type { AuthenticatedRequest } from "@/types/api";
import { z } from 'zod';

const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = req.session;
  if (!session) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Get both friend requests and gold requests counts
    const [friendRequests, goldRequests] = await Promise.all([
      SocialService.countPendingRequests(session.user.id),
      SocialService.countPendingGoldRequests(session.user.id)
    ]);

    // Combine the counts
    const totalCount = (friendRequests.count || 0) + (goldRequests.count || 0);

    return res.status(200).json(stringifyObj({ count: totalCount }));
  } catch (error: any) {
    console.error("Error fetching combined social notifications count:", error);
    return res.status(500).json({ error: error.message });
  }
};

export default withAuth(handler);
