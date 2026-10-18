import { withAuth } from '@/middleware/auth';
import { AllianceService } from '@/services';
import { logError } from '@/utils/logger';

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
    // Only the known refusal is shown; database errors stay in the log.
    const known = error?.message === 'No permission';
    if (!known) logError('Failed to list alliance join requests', error);
    return res
      .status(known ? 403 : 500)
      .json({ error: known ? error.message : 'Could not load join requests' });
  }
};

export default withAuth(listRequestsHandler);
