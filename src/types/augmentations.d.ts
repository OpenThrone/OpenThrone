import 'next';

declare module 'next' {
  interface NextApiRequest {
    // Optional session type — keep permissive during migration
    session?: any;
  }
}

declare global {
  interface GlobalThis {
    prisma?: import('@prisma/client').PrismaClient;
  }
}

export {};
import 'next';
import type { Session } from 'next-auth';

declare module 'next' {
  interface NextApiRequest {
    // optional session injected by auth middleware
    session?: Session | false | undefined;
  }
}

declare global {
  // allow storing prisma client on globalThis during development
  var prisma: import('@prisma/client').PrismaClient | undefined;
}

export {};
