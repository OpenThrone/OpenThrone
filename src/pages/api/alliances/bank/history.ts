import { withAuth } from '@/middleware/auth';
import { AllianceBankService } from '@/services';
import { stringifyObj } from '@/utils/numberFormatting';
import { publicErrorMessage } from '@/utils/publicError';

const historyHandler = async (req: any, res: any) => {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const { allianceId } = req.query;

  if (!allianceId) {
    return res.status(400).json({ error: 'allianceId is required' });
  }

  const requesterId = Number(req.session?.user?.id);
  if (!req.session || !Number.isSafeInteger(requesterId)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const history = await AllianceBankService.getHistory(
      Number(allianceId),
      requesterId,
    );
    return res.status(200).json(stringifyObj(history));
  } catch (error: any) {
    if (error.message?.startsWith('Forbidden')) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return res.status(400).json({ error: publicErrorMessage(error) });
  }
};

export default withAuth(historyHandler);
