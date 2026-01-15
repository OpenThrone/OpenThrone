import type { NextApiRequest, NextApiResponse } from 'next';

import { getRandomAutoRecruitUser } from '@/services/Recruitment.service';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).end(); // Method not allowed
  }

  const randomUser = await getRandomAutoRecruitUser();

  if (!randomUser) {
    return res
      .status(404)
      .json({ error: 'No valid users available for recruitment.' });
  }

  return res.status(200).json({ recruit_link: randomUser.recruit_link });
}
