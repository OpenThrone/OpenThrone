import prisma from "@/lib/prisma";
import { withAuth } from '@/middleware/auth';

const createAlliance = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const { allianceName } = req.body;
  const { user } = req.session;

  if (user.level < 10) {
    return res.status(400).json({ error: 'User level must be at least 10.' });
  }

  if (user.gold < 100000000) {
    return res.status(400).json({ error: 'Insufficient gold.' });
  }

  const alliance = await prisma.alliances.create({
    data: {
      name: allianceName,
      leader_id: user.id,
      users: {
        update: {
          gold: user.gold - 100000000,
        },
      },
    },
  });

  return res.status(200).json(alliance);
};

export default withAuth(createAlliance);