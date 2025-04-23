import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import UserModel from '@/models/Users';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const RecruitLinkSchema = z.object({ recruit_link: z.string().min(1) });
  const parseResult = RecruitLinkSchema.safeParse(req.query);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid or missing recruit_link', details: parseResult.error.flatten().fieldErrors });
  }
  const { recruit_link } = parseResult.data;

  if (req.method === 'GET') {
    const user = await prisma.users.findUnique({
      where: {
        recruit_link: recruit_link as string,
      },
    });

    if (!user) {
      return res.status(400).json({ error: 'User not found.' });
    }

    // Create a new UserModel instance to calculate and access the user's level.
    const userModelInstance = new UserModel(user);

    // Respond with the required data
    return res.status(200).json({
      display_name: user.display_name,
      race: user.race,
      level: userModelInstance.level, // Access the level from the UserModel instance
      class: userModelInstance.class,
    });
  }

  res.status(405).json({ error: 'Method not allowed' }); // Send a proper response for unsupported methods
  return null;
}
