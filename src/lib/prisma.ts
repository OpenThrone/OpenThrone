import { PrismaClient } from '@prisma/client';

// Recursive function to convert BigInt to string in query results.
// Preserve Date objects and non-plain objects to avoid turning them into {}.
const convertBigIntToString = (obj: any): any => {
  // Primitive or null/undefined -> return as-is
  if (obj === null || typeof obj === 'undefined') return obj;

  // BigInt -> convert to string
  if (typeof obj === 'bigint') return obj.toString();

  // Preserve Date objects (important: Dates are objects but should not be iterated)
  if (obj instanceof Date) return obj;

  // Arrays -> map each element
  if (Array.isArray(obj)) return obj.map(convertBigIntToString);

  // Plain objects -> recurse over own properties
  if (typeof obj === 'object') {
    const result: any = {};
    for (const key of Object.keys(obj)) {
      result[key] = convertBigIntToString(obj[key]);
    }
    return result;
  }

  // Fallback (number, string, boolean, function, etc.) -> return as-is
  return obj;
};

const prisma =
  (globalThis as any).prisma ||
  (typeof window === 'undefined'
    ? new PrismaClient({
        log: [
          // 'query', // TODO: let's move this to .env instead or disable it in production
          'info',
          'warn',
          'error',
        ],
      })
    : undefined);

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
