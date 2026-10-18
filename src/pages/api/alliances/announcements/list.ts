import { withAuth } from '@/middleware/auth';
import { AllianceAnnouncementsService } from '@/services/AllianceAnnouncements.service';
import { stringifyObj } from '@/utils/numberFormatting';

const toInt = (value: string | string[] | undefined): number | undefined => {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === undefined || raw === '' ? undefined : Number(raw);
};

/** Lists announcements (pinned first, then newest); alliance members only. */
const handler = async (req: any, res: any) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const sessionUserId = Number(req.session?.user?.id);

  try {
    const result = await AllianceAnnouncementsService.list(sessionUserId, {
      allianceId: toInt(req.query.allianceId),
      page: toInt(req.query.page),
      pageSize: toInt(req.query.pageSize),
    });
    return res.status(200).json(stringifyObj(result));
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
};

export default withAuth(handler);
