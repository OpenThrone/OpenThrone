// middleware/auth.ts
import { NextApiRequest, NextApiResponse, NextApiHandler } from 'next';
import { getServerSession, Session } from 'next-auth'; // Import Session type
import { authOptions } from '../pages/api/auth/[...nextauth]';
import type { AuthenticatedRequest } from '@/types/api'; // Import the shared type

export const withAuth = (handler: NextApiHandler, override: boolean = false) => async (req: NextApiRequest, res: NextApiResponse) => {
  const session: Session | null = await getServerSession(req, res, authOptions); // Explicitly type session
  
  if (!session) {
    if(!override) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    // If overriding, allow handler to run even without session, but req.session will be null/undefined
  }
  
  // Cast req to AuthenticatedRequest before assigning the session property
  (req as AuthenticatedRequest).session = session ?? undefined; // Assign session or undefined
  
  // Pass the modified request (now conforming to AuthenticatedRequest) to the handler
  return handler(req, res);
};
