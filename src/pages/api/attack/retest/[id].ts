import { BattleService } from '@/services';
import { withAuth } from '@/middleware/auth';

const handler = async (req, res) => {
  const session = req.session;
  if (session) {

    if (!req.query.id){
      return res.status(400).json({ status: 'failed' });
    }

    const attackLogId = parseInt(req.query.id);

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