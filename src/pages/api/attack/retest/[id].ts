import { IdQuerySchema } from '@/lib/validation';
import { withAuth } from '@/middleware/auth';
import { BattleService } from '@/services';
import { logError } from '@/utils/logger';

const handler = async (req, res) => {
  const { session } = req;
  if (session) {
    const queryParse = IdQuerySchema.safeParse(req.query);
    if (!queryParse.success) {
      return res.status(400).json({
        status: 'failed',
        details: queryParse.error.flatten().fieldErrors,
      });
    }
    const { id: attackLogId } = queryParse.data;

    try {
      const result = await BattleService.retestBattle(attackLogId);
      return res.status(200).json(result);
    } catch (error) {
      logError('Retest battle error:', error);
      return res
        .status(500)
        .json({ status: 'failed', message: 'Internal server error' });
    }
  }
  return res.status(401).json({ status: 'failed' });
};

export default withAuth(handler);
