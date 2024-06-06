import prisma from "@/lib/prisma";
import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '@/middleware/auth';

const getAll = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const Alliances = await prisma.alliances.findMany({
    include: {
      leader: {
        select: {
          display_name: true,
        },
      },
      _count: {
        select: {
          members: true,
        },
      },
      members: {
        include: {
          user: {
            select: {
              display_name: true,
            },
          },
          role: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });
  

  return res.status(200).json(Alliances);
};
export default withAuth(getAll);