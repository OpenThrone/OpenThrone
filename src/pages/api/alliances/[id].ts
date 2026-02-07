import { withAuth } from '@/middleware/auth';
import { AllianceService } from '@/services';

const getAllianceHandler = async (req: any, res: any) => {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const { id } = req.query;

  if (!id || Array.isArray(id)) {
      return res.status(400).json({ error: 'Invalid alliance ID' });
  }

  try {
    const alliance = await AllianceService.getAllianceById(Number(id));
    return res.status(200).json(alliance);
  } catch (error: any) {
    // If it's a 404-like error
    if (error.message.includes('not found')) {
         return res.status(404).json({ error: 'Alliance not found' });
    }
    return res.status(400).json({ error: error.message });
  }
};

export default withAuth(getAllianceHandler);
