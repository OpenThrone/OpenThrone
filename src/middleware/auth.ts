// middleware/auth.ts
import type { NextApiHandler, NextApiRequest, NextApiResponse } from 'next';
import type { Session } from 'next-auth';
import { getServerSession } from 'next-auth'; // Import Session type

import { rateLimiter } from '@/lib/rate-limiter';
import { isSessionAccountStatusAllowed } from '@/lib/sessionAccount';
import { getLoginBlockingStatus } from '@/services/User.service';
import type { AuthenticatedRequest } from '@/types/api'; // Import the shared type
import { isImpersonatedSession } from '@/utils/authorization';
import { resolveClientIp } from '@/utils/ipUtils';
import {
  getMaintenanceBlock,
  getRuntimeFeatureBlock,
} from '@/utils/runtimeAccess';

import { authOptions } from '../pages/api/auth/[...nextauth]';

/** With auth. */
export const withAuth =
  (
    handler: NextApiHandler,
    options:
      | boolean
      | {
          allowAnonymous?: boolean;
          allowVacation?: boolean;
          rateLimitProfile?: 'game_write';
        } = false,
  ) =>
  async (req: NextApiRequest, res: NextApiResponse) => {
    const override =
      typeof options === 'boolean' ? options : options.allowAnonymous;
    const session: Session | null = await getServerSession(
      req,
      res,
      authOptions,
    ); // Explicitly type session

    try {
      const disabledFeature = await getRuntimeFeatureBlock(req.url, req.body);
      if (disabledFeature)
        return res
          .status(503)
          .json({ message: disabledFeature, code: 'FEATURE_DISABLED' });
      const maintenance = await getMaintenanceBlock(
        req.url,
        session?.user?.id ? Number(session.user.id) : undefined,
        isImpersonatedSession(session),
      );
      if (maintenance) {
        res.setHeader('Retry-After', '5');
        return res
          .status(503)
          .json({ error: maintenance, code: 'MAINTENANCE' });
      }
    } catch {
      return res.status(503).json({
        error: 'Runtime configuration unavailable',
        code: 'CONFIG_UNAVAILABLE',
      });
    }

    if (!session) {
      if (!override) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      // If overriding, allow handler to run even without session, but req.session will be null/undefined
    }

    // Cast req to AuthenticatedRequest before assigning the session property
    // Normalize session.user.id to a number when the provider returns a string ID
    if (session) {
      const userId = Number(session.user?.id);
      if (!Number.isSafeInteger(userId) || userId <= 0) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      if (!(await isSessionAccountStatusAllowed(userId))) {
        const allowVacation =
          typeof options === 'object' && options.allowVacation;
        if (
          !allowVacation ||
          (await getLoginBlockingStatus(userId)) !== 'VACATION'
        ) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
      }
      session.user.id = userId;
    }

    if (typeof options === 'object' && options.rateLimitProfile) {
      // One budget for these mutations: changing URLs, query strings or the
      // client's network cannot reset a signed-in account's allowance.
      const actor = session
        ? `user:${session.user.id}`
        : `ip:${resolveClientIp(req) ?? 'unknown'}`;
      const allowed = await rateLimiter(`game_write:${actor}`, {
        windowMs: 60_000,
        max: 30,
      });
      if (!allowed) return res.status(429).json({ error: 'Too many requests' });
    }

    (req as AuthenticatedRequest).session = session ?? undefined; // Assign session or undefined

    // Pass the modified request (now conforming to AuthenticatedRequest) to the handler
    return handler(req, res);
  };
