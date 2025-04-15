import type { NextApiRequest } from 'next';
import type { Session } from 'next-auth'; // Assuming next-auth structure

/**
 * Represents an authenticated Next.js API request.
 * Includes the session object added by authentication middleware.
 */
export interface AuthenticatedRequest extends NextApiRequest {
  session?: Session & {
    user?: {
      id?: string; // Ensure user and id are potentially included
      // Add other expected user properties if known
    };
    // Add other potential session properties if known
  };
}