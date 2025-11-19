import type { NextApiRequest } from 'next';

/**
 * Represents an authenticated Next.js API request.
 * Includes the session object added by authentication middleware.
 */
export interface AuthenticatedRequest extends NextApiRequest {
  // Keep session loosely typed here to avoid importing conflicting library types.
  session?: any & {
    user?: {
      id?: string | number;
      [key: string]: any;
    };
    [key: string]: any;
  };
}