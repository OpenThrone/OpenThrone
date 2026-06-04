import { withAuth } from '@/middleware/auth';
import { AllianceService } from '@/services';

const listRequestsHandler = async (req: any, res: any) => {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const { allianceId } = req.query;

  if (!allianceId) {
    return res.status(400).json({ error: 'allianceId is required' });
  }

  const { user } = req.session;

  try {
    const requests = await AllianceService.getJoinRequests(
      Number(allianceId),
      user.id,
    );
    return res.status(200).json(requests);
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
};

export default withAuth(listRequestsHandler);
