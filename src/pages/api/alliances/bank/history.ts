import { withAuth } from '@/middleware/auth';
import { AllianceBankService } from '@/services';
import { stringifyObj } from '@/utils/numberFormatting';

const historyHandler = async (req: any, res: any) => {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const { allianceId } = req.query;

  if (!allianceId) {
    return res.status(400).json({ error: 'allianceId is required' });
  }

  try {
    const history = await AllianceBankService.getHistory(Number(allianceId));
    return res.status(200).json(stringifyObj(history));
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
};

export default withAuth(historyHandler);
