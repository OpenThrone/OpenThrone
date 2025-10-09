import prisma from "@/lib/prisma";
import { withAuth } from "@/middleware/auth";
import { NextApiResponse } from "next";
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
    const count = await prisma.social.count({
      where: {
        friendId: session.user.id,
        status: "requested",
      },
    });

    return res.status(200).json({ count });
  } catch (error) {
    console.error("Error fetching friend request count:", error);
    return res.status(500).json({ error: "Failed to get friend request count" });
  }
};

export default withAuth(handler);