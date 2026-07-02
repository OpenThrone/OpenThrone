// middleware/auth.ts
import type { NextApiHandler, NextApiRequest, NextApiResponse } from 'next';
import type { Session } from 'next-auth';
import { getServerSession } from 'next-auth'; // Import Session type

import type { AuthenticatedRequest } from '@/types/api'; // Import the shared type

import { authOptions } from '../pages/api/auth/[...nextauth]';

/** With auth. */
export const withAuth =
  (handler: NextApiHandler, override: boolean = false) =>
  async (req: NextApiRequest, res: NextApiResponse) => {
    const session: Session | null = await getServerSession(
      req,
      res,
      authOptions,
    ); // Explicitly type session

    if (!session) {
      if (!override) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      // If overriding, allow handler to run even without session, but req.session will be null/undefined
    }

    // Cast req to AuthenticatedRequest before assigning the session property
    // Normalize session.user.id to a number when the provider returns a string ID
    if (session && session.user && typeof session.user.id === 'string') {
      // coerce numeric string ids to numbers for compatibility across the codebase
      const maybeNum = parseInt(session.user.id as unknown as string, 10);
      if (!isNaN(maybeNum)) {
        // @ts-ignore - intentionally widen runtime type
        session.user.id = maybeNum as any;
      }
    }

    (req as AuthenticatedRequest).session = session ?? undefined; // Assign session or undefined

    // Pass the modified request (now conforming to AuthenticatedRequest) to the handler
    return handler(req, res);
  };
