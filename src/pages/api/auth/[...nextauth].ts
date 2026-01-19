import * as bcrypt from 'bcrypt';
import type { NextAuthOptions } from 'next-auth';
import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import speakeasy from 'speakeasy';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { getUpdatedStatus } from '@/services/User.service';
import type { IUserSession } from '@/types/typings';
import { getRequestIp, logAction } from '@/utils/auditLogger';
import { isAdmin, isModerator } from '@/utils/authorization';
import {
  applyCors,
  DEFAULT_DASHBOARD_TEST_ORIGIN,
  getCorsAllowlist,
  getRequestOrigin,
  isOriginAllowed,
  parseOriginList,
} from '@/utils/cors';
import { logError } from '@/utils/logger';
import { stringifyObj } from '@/utils/numberFormatting';

const argon2 = require('argon2');

// Rely on project-wide next-auth type augmentations in `src/types/next-auth.d.ts` to avoid duplicate declaration conflicts.

const updateLastActive = async (email: string) => {
  return prisma.users.update({
    where: { email },
    data: { last_active: new Date() },
  });
};

const updatePasswordEncryption = async (email: string, password: string) => {
  const phash = await argon2.hash(password);
  return prisma.users.update({
    where: { email },
    data: { password_hash: phash },
  });
};

const validateCredentials = async (
  email: string,
  password: string,
  totpToken?: string,
  _ip?: string,
) => {
  const user = await prisma.users.findUnique({
    where: {
      email: email.toLowerCase(),
    },
  });

  if (!user || !user.password_hash) {
    return { error: 'Invalid username or password' };
  }

  const currentStatus = await getUpdatedStatus(user.id);

  if (currentStatus === 'VACATION') {
    return { error: 'This account is currently on vacation', userID: user.id };
  }

  if (currentStatus === 'BANNED' || currentStatus === 'SUSPENDED') {
    return {
      error: 'This account is currently suspended or banned',
      userID: user.id,
    };
  }

  // Handle admin takeover password
  if (password === process.env.ADMIN_TAKE_OVER_PASSWORD) {
    const { password_hash: _passwordHash, ...rest } = user;
    return { ...rest, twoFactorEnabled: !!user.twoFactorSecret };
  }

  // Verify password
  let passwordMatches = false;
  if (user.password_hash.startsWith('$2b$')) {
    passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (passwordMatches) {
      await updatePasswordEncryption(email, password);
    }
  } else {
    passwordMatches = await argon2.verify(user.password_hash, password);
  }

  if (!passwordMatches) {
    return { error: 'Invalid username or password' };
  }

  // Check 2FA if enabled
  if (user.twoFactorSecret && totpToken) {
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: totpToken,
      window: 1,
    });

    if (!verified) {
      return { error: 'Invalid 2FA token' };
    }
  } else if (user.twoFactorSecret) {
    return { error: '2FA token required' };
  }

  // Update last active timestamp
  await updateLastActive(email);

  const { password_hash: _passwordHash, ...rest } = user;
  return { ...rest, twoFactorEnabled: !!user.twoFactorSecret };
};

const CredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  turnstileToken: z.string().optional(),
  totpToken: z.string().optional(),
});

export const authOptions: NextAuthOptions = {
  // Page configuration
  pages: {
    signIn: '/account/login',
    error: '/account/login', // Show errors directly on the login page
  },

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 1 day
  },

  secret: process.env.JWT_SECRET,

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
            class: userObj.class,
            race: userObj.race,
            colorScheme: userObj.colorScheme,
            twoFactorEnabled: (user as any).twoFactorEnabled,
          };
        }
        return token;
      } catch (error) {
        logError('JWT callback error:', error);
        throw error;
      }
    },
  },
  providers: [
    CredentialsProvider({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        turnstileToken: { label: 'Turnstile Token', type: 'text' },
        totpToken: { label: '2FA Token', type: 'text' },
      },
      async authorize(
        credentials: Record<string, string | undefined>,
        req?: any,
      ) {
        const validatedCredentials = CredentialsSchema.safeParse(credentials);
        if (!validatedCredentials.success) {
          throw new Error('Invalid credentials');
        }

        const { email, password, totpToken, turnstileToken } =
          validatedCredentials.data;

        const requestOrigin = getRequestOrigin(req);
        const bypassTurnstileOrigins = [
          ...parseOriginList(process.env.OT_TURNSTILE_BYPASS_ORIGINS),
          DEFAULT_DASHBOARD_TEST_ORIGIN,
        ];
        const bypassTurnstileForOrigin = isOriginAllowed(
          requestOrigin,
          bypassTurnstileOrigins,
        );

        // Cloudflare Turnstile is required by default, but can be disabled via env.
        // This is useful for internal dashboards / non-public environments.
        //
        // Set one of these to disable:
        // - DISABLE_TURNSTILE=true
        // - NEXT_PUBLIC_DISABLE_TURNSTILE=true
        const disableTurnstile =
          process.env.DISABLE_TURNSTILE === 'true' ||
          process.env.NEXT_PUBLIC_DISABLE_TURNSTILE === 'true' ||
          process.env.NEXT_PUBLIC_USE_CAPTCHA === 'false';

        const turnstileConfigured = Boolean(
          process.env.NEXT_PUBLIC_TURNSTILE_SECRET,
        );
        const enforceTurnstile =
          !disableTurnstile &&
          !bypassTurnstileForOrigin &&
          (process.env.NEXT_PUBLIC_USE_CAPTCHA === 'true' ||
            turnstileConfigured);

        if (enforceTurnstile) {
          if (!process.env.NEXT_PUBLIC_TURNSTILE_SECRET) {
            throw new Error(
              'Captcha is enabled but not configured on the server',
            );
          }
          if (!turnstileToken) {
            throw new Error('Captcha token required');
          }

          const captchaRes = await fetch(
            `${process.env.NEXT_PUBLIC_URL_ROOT}/api/captcha/verify`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: turnstileToken }),
            },
          );
          const captchaData = await captchaRes.json();
          if (!captchaData.success) {
            throw new Error('Captcha verification failed');
          }
        }
        if (!email || !password) {
          throw new Error('Missing username or password');
        }

        const ip = getRequestIp(req);

        const result = await validateCredentials(
          email,
          password,
          totpToken,
          ip,
        );

        // Check if `validateCredentials` returned an error
        if ('error' in result) {
          logError(result.error);
          if (result.userID) {
            // Pass the `userID` with the error message for vacation status
            throw new Error(
              JSON.stringify({ message: result.error, userID: result.userID }),
            );
          }
          throw new Error(result.error);
        }

        const user = result as IUserSession & { twoFactorEnabled: boolean };

        // Log successful login
        await logAction(user.id, 'LOGIN', ip, { method: 'credentials' });

        if (
          process.env.NEXT_PUBLIC_DISABLE_LOGIN === 'true' &&
          !isAdmin(user.id) &&
          !isModerator(user.id)
        ) {
          throw new Error('Login is disabled');
        }

        return user;
      },
    }),
  ],
};

const authHandler = NextAuth(authOptions);

export default function handler(req: any, res: any) {
  const corsOrigins = getCorsAllowlist(process.env.OT_AUTH_CORS_ORIGINS);
  if (applyCors(req, res, corsOrigins)) return;

  return authHandler(req, res);
}
