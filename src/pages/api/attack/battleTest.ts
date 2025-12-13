import { BattleService } from '@/services';
import { withAuth } from '@/middleware/auth';

const handler = async (req, res) => {
  const session = req.session;
  if (session) {

    const sessionUserId = parseInt(session.user.id.toString());
    let attackerId = sessionUserId;

    // Allow admins to specify different attacker
    if ((sessionUserId === 1 || sessionUserId === 2) && req.query.aId !== undefined) {
      attackerId = parseInt(req.query.aId);
    }

    if (req.query.dId === undefined) {
      return res.status(400).json({ status: 'failed', msg: 'Defender ID "dId" not set' });
    }

    const defenderId = parseInt(req.query.dId);

    try {
      const result = await BattleService.simulateBattle({
        attackerId,
        defenderId,
        turns: 10
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error('Battle test error:', error);
      return res.status(500).json({ status: 'failed', message: 'Internal server error' });
    }
  }
  return res.status(401).json({ status: 'failed', message: 'Unauthorized' });
};

export default withAuth(handler);