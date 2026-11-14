import type { PrismaClient } from '../../prisma/generated/prisma/client';
import { getPrismaClient } from './prismaClients';

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

// Call sites import a single `prisma` object; the proxy resolves the right
// client at access time so none of them need to change. Typed `any` as
// before — callers were written against the untyped export.
const prisma: any =
  typeof window === 'undefined'
    ? new Proxy({} as PrismaClient, {
        get(_target, property) {
          const client = getPrismaClient();
          const value = Reflect.get(client, property, client);
          return typeof value === 'function' ? value.bind(client) : value;
        },
      })
    : undefined;

export default prisma;
