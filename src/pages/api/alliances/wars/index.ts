import { withAuth } from '@/middleware/auth';
import { AllianceWarService } from '@/services';

const listWarsHandler = async (req: any, res: any) => {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const { allianceId } = req.query;

  if (!allianceId) {
    return res.status(400).json({ error: 'allianceId is required' });
  }

  try {
    const wars = await AllianceWarService.getActiveWars(Number(allianceId));
    return res.status(200).json(wars);
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
};

export default withAuth(listWarsHandler);
