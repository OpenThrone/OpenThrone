// Builds a real next-auth session cookie so route tests exercise
// getServerSession and the jwt callback instead of spying on them (a spy only
// takes effect if it is installed before the route module first loads, which
// depends on test file order).
import { encode } from 'next-auth/jwt';

const SESSION_COOKIE = 'next-auth.session-token';

/** Secret getServerSession will use for `authOptions`. */
export function sessionSecret(authOptions: { secret?: string }): string {
  if (!process.env.NEXTAUTH_SECRET) {
    process.env.NEXTAUTH_SECRET = 'synthetic-session-test-secret';
  }
  return authOptions.secret ?? process.env.NEXTAUTH_SECRET;
}

/** Cookies carrying a JWT session for `user` (synthetic identities only). */
export async function sessionCookies(
  authOptions: { secret?: string },
  user: { id: number; email: string; impersonatedBy?: number } | null,
): Promise<Record<string, string>> {
  if (!user) return {};
  const token = await encode({
    token: { user, sub: String(user.id) },
    secret: sessionSecret(authOptions),
  });
  return { [SESSION_COOKIE]: token };
}

/**
 * Bun binds CommonJS named imports when a module first loads, so whether a
 * route sees a `getServerSession` spy depends on which test file loaded it
 * first. Cover both cases: requests carry a real session cookie (for the real
 * function) and `testSession` (for a spy, which `vi.spyOn` shares across files).
 */
export function installSessionSpy(vi: {
  spyOn: (target: any, key: string) => any;
}): void {
  const nextAuthNext = require('next-auth/next');
  const spy = vi.spyOn(nextAuthNext, 'getServerSession');
  spy.mockImplementation(
    async (req: { testSession?: unknown }) => req?.testSession ?? null,
  );
}

/** Request fields for a signed-in (or anonymous) caller; see installSessionSpy. */
export async function sessionRequestFields(
  authOptions: { secret?: string },
  user: { id: number; email: string } | null,
) {
  return {
    cookies: await sessionCookies(authOptions, user),
    testSession: user ? { user } : null,
  };
}
