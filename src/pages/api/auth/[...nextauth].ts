import type { NextApiRequest, NextApiResponse } from 'next';
import type { NextAuthOptions } from 'next-auth';
import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { z } from 'zod';

import {
  consumeImpersonationTicket,
  IMPERSONATION_MAX_MS,
} from '@/lib/impersonationTickets';
import prisma from '@/lib/prisma';
import { isSessionAccountCurrent } from '@/lib/sessionAccount';
import { AccountService } from '@/services/Account.service';
import { cancelInactivityOnLogin } from '@/services/AccountInactivity.service';
import { recordSuccessfulLogin } from '@/services/LoginTelemetry.service';
import {
  getLoginBlockingStatus,
  getUpdatedStatus,
} from '@/services/User.service';
import type { IUserSession } from '@/types/typings';
import { logAction } from '@/utils/auditLogger';
import { getStaffRank, isAdmin, isModerator } from '@/utils/authorization';
import { applyCors, getCorsAllowlist } from '@/utils/cors';
import {
  TOO_MANY_LOGIN_ATTEMPTS,
  verifyLoginCaptcha,
  verifyStoredPassword,
  verifyTotpOnce,
  withLoginFailureBudget,
} from '@/utils/credentialGuards';
import { resolveClientIp } from '@/utils/ipUtils';
import { logError } from '@/utils/logger';
import { canAccessGame } from '@/utils/loginPolicy';
import { stringifyObj } from '@/utils/numberFormatting';
import { isPrivileged2FAEnforced } from '@/utils/securityPolicies';

const argon2 = require('argon2');

const AUTH_SECRETS = Array.from(
  new Set(
    [process.env.NEXTAUTH_SECRET, process.env.JWT_SECRET].filter(Boolean),
  ),
) as string[];
const AUTH_SECRET = AUTH_SECRETS[0];

class InvalidSessionAccountError extends Error {}

// Rely on project-wide next-auth type augmentations in `src/types/next-auth.d.ts` to avoid duplicate declaration conflicts.

const updateLastActive = async (email: string) => {
  const user = await prisma.users.update({
    where: { email },
    data: { last_active: new Date() },
  });
  await cancelInactivityOnLogin(user.id);
  return user;
};

const updatePasswordEncryption = async (email: string, password: string) => {
  const phash = await argon2.hash(password);
  return prisma.users.update({
    where: { email },
    data: { password_hash: phash },
  });
};

const buildSessionUser = (user: any) => {
  const { password_hash: _passwordHash, alliance_memberships, ...rest } = user;
  const alliances = (alliance_memberships || []).map((m) => ({
    alliance_id: m.alliance_id,
    alliance_name: m.alliance?.name || 'Unknown',
    alliance_role_id: m.role_id,
    alliance_role_name: m.role?.name || 'Member',
  }));

  return {
    ...rest,
    alliance_id: alliances.length > 0 ? alliances[0].alliance_id : null,
    alliances,
    twoFactorEnabled: !!user.twoFactorSecret,
  };
};

const INVALID_CREDENTIALS = 'Invalid username or password';

/** True for an impersonated session past its limit, or one without a limit (legacy tokens). */
export const isImpersonationExpired = (user: unknown, now = Date.now()) => {
  const session = user as
    | { impersonatedBy?: unknown; impersonationExpiresAt?: unknown }
    | null
    | undefined;
  if (!session || !(Number(session.impersonatedBy) > 0)) return false;
  const expiresAt = Number(session.impersonationExpiresAt);
  return !Number.isFinite(expiresAt) || now >= expiresAt;
};

/** Account-state refusals the login form acts on (shown only after the password matched). */
type LoginRefusalCode = 'closed' | 'vacation' | 'restricted';

type CredentialRefusal = {
  error: string;
  code?: LoginRefusalCode;
};

const STATUS_REFUSALS: Record<string, CredentialRefusal> = {
  CLOSED: { error: 'This account is closed', code: 'closed' },
  VACATION: {
    error: 'This account is currently on vacation',
    code: 'vacation',
  },
  BANNED: {
    error: 'This account is currently suspended or banned',
    code: 'restricted',
  },
  SUSPENDED: {
    error: 'This account is currently suspended or banned',
    code: 'restricted',
  },
};

/**
 * Checks a credential login. Order matters:
 * 1. Password. A mismatch is a counted failure and reveals nothing else.
 * 2. Account state (login policy, closed/banned/vacation). Only revealed to a
 *    caller who knows the password, and checked before TOTP so that a code is
 *    not spent on a refused attempt (the player can retry with it, e.g. to
 *    end vacation).
 * 3. TOTP. A wrong code is a counted failure; a missing one is not.
 * Writes (vacation end, status refresh, rehash, last_active) happen only once
 * every check has passed.
 */
const validateCredentials = async (
  email: string,
  password: string,
  totpToken: string | undefined,
  options: { endVacation: boolean },
): Promise<{ failed: boolean; result: CredentialRefusal | any }> => {
  const user = await prisma.users.findUnique({
    where: {
      email: email.toLowerCase(),
    },
    include: {
      alliance_memberships: {
        include: {
          alliance: { select: { name: true } },
          role: { select: { name: true } },
        },
      },
    },
  });

  if (!user || !user.password_hash) {
    return { failed: true, result: { error: INVALID_CREDENTIALS } };
  }

  const storedHash = user.password_hash;
  if (!(await verifyStoredPassword(storedHash, password))) {
    return { failed: true, result: { error: INVALID_CREDENTIALS } };
  }

  const refuse = (refusal: CredentialRefusal) => ({
    failed: false,
    result: refusal,
  });

  if (!(await canAccessGame(user.id))) {
    return refuse({ error: 'Login is disabled' });
  }

  // Check the stored status before getUpdatedStatus, which can rewrite a
  // CLOSED record to INACTIVE once last_active is stale.
  const storedStatus = await getLoginBlockingStatus(user.id);
  const endingVacation = storedStatus === 'VACATION' && options.endVacation;
  if (storedStatus && !endingVacation) {
    return refuse(STATUS_REFUSALS[storedStatus]);
  }

  const isPrivileged = (await isAdmin(user.id)) || (await isModerator(user.id));
  if (isPrivileged2FAEnforced() && isPrivileged && !user.twoFactorSecret) {
    return refuse({
      error:
        '2FA is required for administrator and moderator accounts. Enable 2FA before signing in.',
    });
  }

  if (user.twoFactorSecret) {
    // First step of a 2FA login: the password matched, so this is no failure.
    if (!totpToken) return refuse({ error: '2FA token required' });
    if (!(await verifyTotpOnce(user.id, user.twoFactorSecret, totpToken))) {
      return { failed: true, result: { error: 'Invalid 2FA token' } };
    }
  }

  // The player re-proved password and TOTP, so they may end their own vacation.
  if (endingVacation) {
    await AccountService.endVacation(user.id);
  }

  const currentStatus = await getUpdatedStatus(user.id);
  if (STATUS_REFUSALS[currentStatus]) {
    return refuse(STATUS_REFUSALS[currentStatus]);
  }

  if (storedHash.startsWith('$2b$')) {
    await updatePasswordEncryption(email, password);
  }
  await updateLastActive(email);

  return {
    failed: false,
    result: {
      ...buildSessionUser(user),
      twoFactorSetupRecommended: isPrivileged && !user.twoFactorSecret,
    },
  };
};

const CredentialsSchema = z
  .object({
    email: z.string().email().optional(),
    password: z.string().optional(),
    turnstileToken: z.string().optional(),
    totpToken: z.string().optional(),
    impersonateUserId: z.coerce.number().int().positive().optional(),
    impersonationTicket: z.string().min(1).optional(),
    // Ends an impersonation by switching back to the admin (#92).
    returnToAdmin: z.enum(['true']).optional(),
    // Set by the login form after a vacation refusal; honoured only once the
    // password (and TOTP when enabled) verify.
    endVacation: z.enum(['true', 'false']).optional(),
  })
  .superRefine((data, ctx) => {
    const isImpersonation =
      typeof data.impersonateUserId === 'number' ||
      data.returnToAdmin === 'true';
    if (isImpersonation) {
      if (!data.impersonationTicket) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Impersonation ticket is required',
          path: ['impersonationTicket'],
        });
      }
      return;
    }

    if (!data.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Email is required',
        path: ['email'],
      });
    }
    if (!data.password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Password is required',
        path: ['password'],
      });
    }
  });

/**
 * Credentials provider bound to the request's client IP. next-auth passes
 * `authorize` only headers/body (no socket), so the API handler resolves the
 * IP from the real request and closes over it here; a client cannot set it.
 */
const buildCredentialsProvider = (clientIp?: string, userAgent?: string) =>
  CredentialsProvider({
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Password', type: 'password' },
      turnstileToken: { label: 'Turnstile Token', type: 'text' },
      totpToken: { label: '2FA Token', type: 'text' },
    },
    async authorize(credentials: Record<string, string | undefined>) {
      const validatedCredentials = CredentialsSchema.safeParse(credentials);
      if (!validatedCredentials.success) {
        throw new Error('Invalid credentials');
      }

      const {
        email,
        password,
        totpToken,
        turnstileToken,
        impersonateUserId,
        impersonationTicket,
        returnToAdmin,
        endVacation,
      } = validatedCredentials.data;
      const isReturn = returnToAdmin === 'true';

      const ip = clientIp ?? 'No IP address detected.';

      // Cloudflare Turnstile is enforced for every credential login before any
      // throttle bookkeeping, so captcha-less requests cannot spend a victim's
      // failure budget. Only server-side env flags disable it (see
      // isLoginCaptchaEnforced); request headers (Origin/Referer) never bypass
      // it. Impersonation is admin-initiated and carries its own single-use ticket.
      if (!impersonateUserId && !isReturn) {
        await verifyLoginCaptcha(turnstileToken);
      }
      if (!impersonateUserId && !isReturn && (!email || !password)) {
        throw new Error('Missing username or password');
      }

      let result;
      if (isReturn) {
        // The ticket is only minted by /api/admin/impersonate/stop from a
        // server-verified impersonated session; the admin is re-checked here.
        const ticketRecord = impersonationTicket
          ? consumeImpersonationTicket(impersonationTicket)
          : null;
        if (
          !ticketRecord ||
          ticketRecord.kind !== 'return' ||
          !(await isAdmin(ticketRecord.adminUserId))
        ) {
          throw new Error('Unauthorized impersonation request');
        }
        const adminUser = await prisma.users.findUnique({
          where: { id: ticketRecord.adminUserId },
          include: {
            alliance_memberships: {
              include: {
                alliance: { select: { name: true } },
                role: { select: { name: true } },
              },
            },
          },
        });
        if (
          !adminUser ||
          (await getLoginBlockingStatus(adminUser.id)) ||
          !(await canAccessGame(adminUser.id))
        ) {
          throw new Error('Unauthorized impersonation request');
        }
        result = buildSessionUser(adminUser);
        await logAction(adminUser.id, 'ADMIN_IMPERSONATE_RETURN', ip, {
          targetUserId: ticketRecord.targetUserId,
        });
      } else if (impersonateUserId) {
        if (!impersonationTicket) {
          throw new Error('Missing impersonation ticket');
        }
        const ticketRecord = consumeImpersonationTicket(impersonationTicket);
        if (
          !ticketRecord ||
          ticketRecord.kind !== 'start' ||
          ticketRecord.targetUserId !== impersonateUserId ||
          !(await isAdmin(ticketRecord.adminUserId))
        ) {
          throw new Error('Unauthorized impersonation request');
        }
        const { adminUserId } = ticketRecord;

        const targetUser = await prisma.users.findUnique({
          where: { id: impersonateUserId },
          include: {
            alliance_memberships: {
              include: {
                alliance: { select: { name: true } },
                role: { select: { name: true } },
              },
            },
          },
        });
        if (!targetUser) {
          throw new Error('Target user not found');
        }
        // Re-checked at redemption: the target may have gained staff access
        // since the ticket was issued.
        if ((await getStaffRank(targetUser.id)) > 0) {
          throw new Error('Unauthorized impersonation request');
        }

        if (!(await canAccessGame(targetUser.id))) {
          throw new Error('Login is disabled');
        }

        const storedTargetStatus = await getLoginBlockingStatus(targetUser.id);
        if (storedTargetStatus) {
          throw new Error('Target account is suspended or banned');
        }
        const targetStatus = await getUpdatedStatus(targetUser.id);
        if (
          targetStatus === 'BANNED' ||
          targetStatus === 'SUSPENDED' ||
          targetStatus === 'CLOSED'
        ) {
          throw new Error('Target account is suspended or banned');
        }

        result = {
          ...buildSessionUser(targetUser),
          impersonatedBy: adminUserId,
        };

        await logAction(adminUserId, 'ADMIN_IMPERSONATE_START', ip, {
          targetUserId: targetUser.id,
        });
      } else {
        // Only failed password/TOTP checks count; see withLoginFailureBudget.
        const checked = await withLoginFailureBudget(email, clientIp, () =>
          validateCredentials(email, password, totpToken, {
            endVacation: endVacation === 'true',
          }),
        );
        if (checked === null) throw new Error(TOO_MANY_LOGIN_ATTEMPTS);
        result = checked;
      }

      // Check if `validateCredentials` returned an error
      if ('error' in result) {
        logError(result.error);
        if (result.code) {
          // The form reads `code` to offer ending vacation or filing an appeal.
          throw new Error(
            JSON.stringify({ message: result.error, code: result.code }),
          );
        }
        throw new Error(result.error);
      }

      const user = result as IUserSession & { twoFactorEnabled: boolean };

      // Both credential and impersonation paths have passed the access policy.
      await logAction(user.id, 'LOGIN', ip, { method: 'credentials' });
      if (!impersonateUserId && !isReturn) {
        await recordSuccessfulLogin({
          userId: user.id,
          ip: clientIp,
          userAgent,
        });
      }

      return user;
    },
  });

/** Handles the Auth options API request. */
export const authOptions: NextAuthOptions = {
  // Page configuration
  pages: {
    signIn: '/account/login',
    error: '/account/login', // Show errors directly on the login page
  },

  session: {
    strategy: 'jwt',
    // 30 days; impersonated sessions end after IMPERSONATION_MAX_MS (#92).
    maxAge: 30 * 24 * 60 * 60,
  },

  secret: AUTH_SECRET,

  callbacks: {
    async session({ session, token }) {
      try {
        // token.user may be a partial object at runtime; cast to any for session assignment during migration
        session.user = token.user as any;
        return session;
      } catch (error) {
        logError('Session callback error:', error);
        throw error;
      }
    },
    async jwt({ token, user }) {
      try {
        if (user) {
          const userObj = stringifyObj(user as any);
          token.user = {
            id: userObj.id,
            display_name: userObj.display_name,
            email: userObj.email,
            class: userObj.class,
            race: userObj.race,
            colorScheme: userObj.colorScheme,
            twoFactorEnabled: (user as any).twoFactorEnabled,
            twoFactorSetupRecommended: (
              user as { twoFactorSetupRecommended?: boolean }
            ).twoFactorSetupRecommended,
            // Pass alliance data
            alliance_id: (user as any).alliance_id,
            alliances: (user as any).alliances,
            impersonatedBy: (user as any).impersonatedBy,
            // Impersonated sessions end after IMPERSONATION_MAX_MS (#92).
            ...((user as any).impersonatedBy
              ? { impersonationExpiresAt: Date.now() + IMPERSONATION_MAX_MS }
              : {}),
          };
        } else if (isImpersonationExpired(token.user)) {
          throw new InvalidSessionAccountError('Impersonation has expired');
        } else if (
          !(await isSessionAccountCurrent(token.user)) ||
          (await getLoginBlockingStatus(
            Number((token.user as { id?: unknown })?.id),
          )) === 'CLOSED'
        ) {
          // NextAuth v4 clears all session-cookie chunks when JWT validation throws.
          throw new InvalidSessionAccountError(
            'Session account is no longer valid',
          );
        }
        return token;
      } catch (error) {
        if (!(error instanceof InvalidSessionAccountError)) {
          logError('JWT callback error:', error);
        }
        throw error;
      }
    },
  },
  providers: [buildCredentialsProvider()],
};

/**
 * Auth options for one request. Identical to `authOptions` except that the
 * credentials provider knows the caller's IP for the per-IP login budgets.
 */
export function createAuthOptions(context: {
  clientIp?: string;
  userAgent?: string;
}): NextAuthOptions {
  return {
    ...authOptions,
    providers: [buildCredentialsProvider(context.clientIp, context.userAgent)],
  };
}

/** Handles NextAuth API requests. */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // The dashboard test origin is only allowed outside production.
  const corsOrigins = getCorsAllowlist(
    process.env.OT_AUTH_CORS_ORIGINS,
    process.env.NODE_ENV !== 'production',
  );
  if (applyCors(req, res, corsOrigins)) return;

  // Resolved from the socket and trusted-proxy headers; unknown stays
  // undefined so the per-IP budgets are skipped instead of shared.
  return NextAuth(
    req,
    res,
    createAuthOptions({
      clientIp: resolveClientIp(req),
      userAgent: Array.isArray(req.headers['user-agent'])
        ? req.headers['user-agent'][0]
        : req.headers['user-agent'],
    }),
  );
}
