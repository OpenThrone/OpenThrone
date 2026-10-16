import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../prisma/generated/prisma/client';

// Recursive function to convert BigInt to string in query results.
// Preserve Date objects and non-plain objects to avoid turning them into {}.
const _convertBigIntToString = (obj: any): any => {
  // Primitive or null/undefined -> return as-is
  if (obj === null || typeof obj === 'undefined') return obj;

  // BigInt -> convert to string
  if (typeof obj === 'bigint') return obj.toString();

  // Preserve Date objects (important: Dates are objects but should not be iterated)
  if (obj instanceof Date) return obj;

  // Arrays -> map each element
  if (Array.isArray(obj)) return obj.map(_convertBigIntToString);

  // Plain objects -> recurse over own properties
  if (typeof obj === 'object') {
    const result: any = {};
    for (const key of Object.keys(obj)) {
      result[key] = _convertBigIntToString(obj[key]);
    }
    return result;
  }

  // Fallback (number, string, boolean, function, etc.) -> return as-is
  return obj;
};

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.POSTGRES_PRISMA_URL,
  });

  return new PrismaClient({
    adapter,
    log: [
      // 'query', // TODO: let's move this to .env instead or disable it in production
      'info',
      'warn',
      'error',
    ],
  });
}

const prisma =
  (globalThis as any).prisma ||
  (typeof window === 'undefined' ? createPrismaClient() : undefined);

if (prisma && typeof window === 'undefined') {
  // Add middleware to handle BigInt in all queries
  // Temporarily commented out to fix build error
  // prisma.$use(async (params, next) => {
  //   const result = await next(params);
  //   return convertBigIntToString(result);
  // });

  if (process.env.NODE_ENV === 'development')
    (globalThis as any).prisma = prisma;
}

export default prisma;
