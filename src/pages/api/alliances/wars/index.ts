import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import { AllianceWarService } from '@/services';
import { publicErrorMessage } from '@/utils/publicError';

const listWarsHandler = async (req: any, res: any) => {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const { allianceId } = req.query;

  if (!allianceId) {
    return res.status(400).json({ error: 'allianceId is required' });
  }

  try {
    // Wars are alliance business: members only, like the other alliance tabs.
    const membership = await prisma.alliance_memberships.findFirst({
      where: {
        alliance_id: Number(allianceId),
        user_id: Number(req.session?.user?.id),
      },
      select: { id: true },
    });
    if (!membership) {
      return res
        .status(403)
        .json({ error: 'You are not a member of this alliance' });
    }
    const wars = await AllianceWarService.getActiveWars(Number(allianceId));
    return res.status(200).json(wars);
  } catch (error: any) {
    return res.status(400).json({ error: publicErrorMessage(error) });
  }
};

export default withAuth(listWarsHandler);
