import prisma from "@/lib/prisma";
import { withAuth } from "@/middleware/auth";
import { NextApiResponse } from "next";
import { stringifyObj } from "@/utils/jsonHelpers";
import type { AuthenticatedRequest } from "@/types/api";

const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = req.session;
  if (!session) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const count = await prisma.bank_history.count({
      where: {
        to_user_id: session.user.id,
        history_type: 'FRIEND_REQUEST',
        stats: {
          path: ['transferType'],
          equals: 'FRIEND_REQUEST'
        },
        date_time: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
        }
      },
    });

    return res.status(200).json(stringifyObj({ count }));
  } catch (error) {
    console.error("Error fetching gold request count:", error);
    return res.status(500).json({ error: "Failed to get gold request count" });
  }
};

export default withAuth(handler);