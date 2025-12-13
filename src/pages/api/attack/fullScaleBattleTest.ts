import { withAuth } from '@/middleware/auth';
import { BattleService } from '@/services';
import { result } from 'node_modules/cypress/types/lodash';

const handler = async (req, res) => {
  const session = req.session;
  if (session) {

    if (session.user.id !== 1 && session.user.id !== 2) {
      return res.status(401).json({ status: 'failed', msg: 'Unauthorized', session });
    }

    let attackerId;
    if ((session.user.id === 1 || session.user.id === 2) && req.query.aId !== undefined) {
      attackerId = parseInt(req.query.aId);
    }

    try {
      const result = await BattleService.fullScaleBattleTest(attackerId);
      return res.status(200).json(result);
    } catch (error) {
      console.error('Full scale battle test error:', error);
      return res.status(500).json({ status: 'failed', message: 'Internal server error' });
    }
  }
  return res.status(401).json({ status: 'failed', message: 'Unauthorized' });
}
 export default withAuth(handler);