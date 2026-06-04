import type { NextApiResponse } from 'next';

import { AnnouncementService } from '@/services/Announcement.service';

async function handler(_req: any, res: NextApiResponse) {
  try {
    const banners = await AnnouncementService.getActiveBanners();
    return res.status(200).json(banners);
  } catch {
    return res.status(500).json({ error: 'Failed to fetch announcements' });
  }
}

export default handler;
