import { AllianceService } from '@/services';
import { withAuth } from '@/middleware/auth';

const createAlliance = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const { allianceName } = req.body;
  const { user } = req.session;

  try {
    const alliance = await AllianceService.createAlliance(user.id, { name: allianceName });
    return res.status(200).json(alliance);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

export default withAuth(createAlliance);