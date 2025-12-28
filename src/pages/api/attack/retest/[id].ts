import { BattleService } from '@/services';
import { withAuth } from '@/middleware/auth';
import { IdQuerySchema } from '@/lib/validation';

const handler = async (req, res) => {
  const session = req.session;
  if (session) {

    const queryParse = IdQuerySchema.safeParse(req.query);
    if (!queryParse.success) {
      return res.status(400).json({ status: 'failed', details: queryParse.error.flatten().fieldErrors });
    }
    const { id: attackLogId } = queryParse.data;

    try {
      const result = await BattleService.retestBattle(attackLogId);
      return res.status(200).json(result);
    } catch (error) {
      console.error('Retest battle error:', error);
      return res.status(500).json({ status: 'failed', message: 'Internal server error' });
    }
  }
  return res.status(401).json({ status: 'failed' });
};

export default withAuth(handler);