import type { NextApiRequest, NextApiResponse } from 'next';

import { withAuth } from '@/middleware/auth';
import { withCors } from '@/middleware/cors';
import { GeneralService } from '@/services';
import { recordDailySeenActivity } from '@/services/LoginTelemetry.service';
import { isImpersonatedSession } from '@/utils/authorization';
import { resolveClientIp } from '@/utils/ipUtils';
import { logError } from '@/utils/logger';
import { stringifyObj } from '@/utils/numberFormatting';

const getUser = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { session } = req as any;
    const userId =
      typeof session.user.id === 'string'
        ? parseInt(session.user.id)
        : session.user.id;

    const responseDto = await GeneralService.getUserData(userId);

    // One SEEN telemetry row per user per UTC day: long-lived sessions never
    // sign in, so their network/browser hashes would otherwise never link up.
    // An impersonated session is the staff member's activity, not the
    // target's; recording it would forge a link. Best effort: never blocks
    // or fails the response.
    if (!isImpersonatedSession(session)) {
      await recordDailySeenActivity({
        userId,
        ip: resolveClientIp(req),
        userAgent: Array.isArray(req.headers['user-agent'])
          ? req.headers['user-agent'][0]
          : req.headers['user-agent'],
      });
    }

    res.status(200).json(stringifyObj(responseDto));
  } catch (error) {
    logError('Error in getUser:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export default withCors(withAuth(getUser));
