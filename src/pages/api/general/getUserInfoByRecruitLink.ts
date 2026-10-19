import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import UserModel from '@/models/Users';
import { GeneralService } from '@/services';

/** Handles general get user info by recruit link API requests. */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const RecruitLinkSchema = z.object({
    recruit_link: z.string().min(1).max(100),
  });
  const parseResult = RecruitLinkSchema.safeParse(req.query);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid or missing recruit_link',
      details: parseResult.error.flatten().fieldErrors,
    });
  }
  const { recruit_link } = parseResult.data;

  if (req.method === 'GET') {
    const user = await GeneralService.getUserInfoByRecruitLink(recruit_link);

    if (!user) {
      return res.status(400).json({ error: 'User not found.' });
    }

    // Create a new UserModel instance to calculate and access the user's level.
    const userModelInstance = new UserModel(user);

    // Links are guessable (md5 of the id), so expose only what the recruit page
    // renders: no id, avatar, experience or other account fields.
    res.setHeader('Cache-Control', 'no-store');
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

export default withApiGuard({
  methods: ['GET'],
  authMode: 'none',
  rateLimitProfile: 'public_read',
})(handler);
