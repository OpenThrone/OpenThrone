import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import { AccountAnonymizationService } from '@/services/AccountAnonymization.service';
import { cancelInactivityOnLogin } from '@/services/AccountInactivity.service';
import { sendImmediate } from '@/services/Email.service';
import { recordSuccessfulLogin } from '@/services/LoginTelemetry.service';
import { getRuntimeConfig } from '@/services/RuntimeConfig.service';
import {
  beginTwoFactorSetup,
  completeTwoFactorSetup,
  disableTwoFactor,
} from '@/services/TwoFactor.service';
import {
  createUser,
  getLoginBlockingStatus,
  getUpdatedStatus,
  userExists,
} from '@/services/User.service';
import { logAction } from '@/utils/auditLogger';
import { isAdmin, isModerator } from '@/utils/authorization';
import { verifyTotpOnce } from '@/utils/credentialGuards';
import { missingEmailSecrets } from '@/utils/emailSecrets';
import { logError } from '@/utils/logger';
import { canAccessGame } from '@/utils/loginPolicy';
import { isPrivileged2FAEnforced } from '@/utils/securityPolicies';

const argon2 = require('argon2');

/** Malformed stored hashes make the libraries throw; treat that as a failed match. */
const comparePassword = async (
  check: () => Promise<boolean>,
): Promise<boolean> => {
  try {
    return (await check()) === true;
  } catch {
    return false;
  }
};

const hashResetToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

const generateSecureResetToken = () => randomBytes(32).toString('hex');

/** Describes the register data contract. */
export interface RegisterData {
  email: string;
  password: string;
  display_name: string;
  race: string;
  class: string;
  ip?: string;
}

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  display_name: z.string().min(3),
  race: z.string(),
  class: z.string(),
  ip: z.string().optional(),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  totpToken: z.string().optional(),
  ip: z.string().optional(),
});

/** Encapsulates auth data access and domain operations. */
export class AuthService {
  /**
   * Updates the password encryption for a user to the latest algorithm (Argon2).
   */
  static async updatePasswordEncryption(email: string, password: string) {
    const phash = await argon2.hash(password);
    return prisma.users.update({
      where: { email },
      data: { password_hash: phash },
    });
  }

  /**
   * Updates the last active timestamp for a user by email.
   */
  static async updateLastActive(email: string) {
    const user = await prisma.users.update({
      where: { email },
      data: { last_active: new Date() },
    });
    await cancelInactivityOnLogin(user.id);
    return user;
  }

  /**
   * Validates user credentials during login.
   * Handles password verification (bcrypt/argon2), 2FA checks, and status checks.
   */
  static async validateCredentials(
    email: string,
    password: string,
    totpToken?: string,
    ip?: string,
    userAgent?: string,
  ) {
    const validatedData = LoginSchema.parse({ email, password, totpToken, ip });

    const user = await prisma.users.findUnique({
      where: {
        email: validatedData.email.toLowerCase(),
      },
    });

    if (!user || !user.password_hash) {
      return { error: 'Invalid username or password' };
    }

    // Verify password. A malformed stored hash makes the library throw; that
    // is reported as invalid credentials, not a server error.
    const storedHash = user.password_hash;
    let passwordMatches = false;
    if (storedHash.startsWith('$2b$')) {
      passwordMatches = await comparePassword(() =>
        bcrypt.compare(validatedData.password, storedHash),
      );
    } else {
      passwordMatches = await comparePassword(() =>
        argon2.verify(storedHash, validatedData.password),
      );
    }

    if (!passwordMatches) {
      return { error: 'Invalid username or password' };
    }

    if (!(await canAccessGame(user.id))) {
      return { error: 'Login is disabled' };
    }

    // Check the stored status before getUpdatedStatus, which can rewrite a
    // CLOSED record to INACTIVE once last_active is stale.
    const storedStatus = await getLoginBlockingStatus(user.id);
    if (storedStatus === 'CLOSED') {
      return { error: 'This account is closed' };
    }
    if (storedStatus === 'VACATION') {
      return {
        error: 'This account is currently on vacation',
        userID: user.id,
      };
    }
    if (storedStatus === 'BANNED' || storedStatus === 'SUSPENDED') {
      return {
        error: 'This account is currently suspended or banned',
        userID: user.id,
      };
    }

    const isPrivileged =
      (await isAdmin(user.id)) || (await isModerator(user.id));
    if (isPrivileged2FAEnforced() && isPrivileged && !user.twoFactorSecret) {
      return {
        error:
          '2FA is required for administrator and moderator accounts. Enable 2FA before signing in.',
      };
    }

    // Check 2FA if enabled
    if (user.twoFactorSecret && validatedData.totpToken) {
      const verified = await verifyTotpOnce(
        user.id,
        user.twoFactorSecret,
        validatedData.totpToken,
      );

      if (!verified) {
        return { error: 'Invalid 2FA token' };
      }
    } else if (user.twoFactorSecret) {
      return { error: '2FA token required' };
    }

    const currentStatus = await getUpdatedStatus(user.id);

    if (currentStatus === 'CLOSED') {
      return { error: 'This account is closed' };
    }

    if (currentStatus === 'VACATION') {
      return {
        error: 'This account is currently on vacation',
        userID: user.id,
      };
    }

    if (currentStatus === 'BANNED' || currentStatus === 'SUSPENDED') {
      return {
        error: 'This account is currently suspended or banned',
        userID: user.id,
      };
    }

    if (storedHash.startsWith('$2b$')) {
      await this.updatePasswordEncryption(
        validatedData.email,
        validatedData.password,
      );
    }

    // Update last active timestamp
    await AuthService.updateLastActive(validatedData.email);

    // Log successful login if IP is provided
    if (validatedData.ip) {
      await logAction(user.id, 'LOGIN', validatedData.ip, {
        method: 'credentials',
      });
    }
    await recordSuccessfulLogin({
      userId: user.id,
      ip: validatedData.ip,
      userAgent,
    });

    const {
      password_hash: _passwordHash,
      twoFactorSecret: _twoFactorSecret,
      ...rest
    } = user;
    return { ...rest, twoFactorEnabled: !!user.twoFactorSecret };
  }

  /**
   * Registers a new user.
   */
  static async registerUser(data: RegisterData) {
    const runtime = await getRuntimeConfig();
    if (runtime.disableRegistration || runtime.maintenance.enabled) {
      throw new Error('Registration is currently disabled');
    }
    const missing = missingEmailSecrets();
    if (missing.length) {
      logError(`Registration configuration missing: ${missing.join(', ')}`);
      throw new Error('Registration is currently disabled');
    }
    const validatedData = RegisterSchema.parse(data);
    const {
      email,
      password,
      display_name,
      race,
      class: userClass,
      ip,
    } = validatedData;

    const exists = await userExists(email, display_name);
    if (exists) {
      throw new Error('User already exists');
    }

    // Identity retention: emails under a deletion cooldown or sanction, and
    // reserved display names, are refused with generic messages (no
    // disclosure of which retention reason applies). Covers IdentityBlock
    // rows under both hash schemes plus leftover legacy shadow rows.
    const identityBlocks = await AccountAnonymizationService.isIdentityBlocked({
      email,
      displayName: display_name,
    });
    if (identityBlocks.emailBlocked) {
      throw new Error('Account creation is temporarily restricted.');
    }
    if (identityBlocks.displayNameBlocked) {
      throw new Error('That display name is unavailable.');
    }

    const phash = await argon2.hash(password);

    // Create user using the existing service method
    const user = await createUser(
      email,
      phash,
      display_name,
      race,
      userClass,
      'en-US',
    );

    // Log creation if IP is provided (optional, not in original route but good practice)
    if (ip) {
      // Note: logAction might require a numeric ID, createUser returns the user object
    }

    return user;
  }

  /**
   * Verifies a password reset code.
   */
  static async verifyPasswordResetCode(email: string, code: string) {
    const user = await prisma.users.findUnique({ where: { email } });
    if (!user) {
      throw new Error('User not found');
    }

    const hashedCode = hashResetToken(code);
    const existingReset = await prisma.passwordReset.findMany({
      where: {
        userId: user.id,
        verificationCode: hashedCode,
        status: 0,
        type: 'PASSWORD',
        createdAt: {
          gt: new Date(new Date().getTime() - 1000 * 60 * 60 * 3), // 3 hours validity
        },
      },
    });

    if (existingReset.length === 0) {
      throw new Error('Invalid verification code');
    }

    return { verified: true, user };
  }

  /**
   * Initiates a password reset request.
   */
  static async requestPasswordReset(
    identifier: string | number,
    options: {
      beforeCommit?: (
        tx: Prisma.TransactionClient,
        reset: { id: number; userId: number },
      ) => Promise<void>;
    } = {},
  ) {
    const resetToken = generateSecureResetToken();
    const hashedToken = hashResetToken(resetToken);

    const { user, resetReq } = await prisma.$transaction(async (tx) => {
      const user = await tx.users.findUnique({
        where:
          typeof identifier === 'number'
            ? { id: identifier }
            : { email: identifier },
        select: { id: true, email: true },
      });
      if (!user?.email) throw new Error('User not found');

      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
      const lockedUser = await tx.users.findUnique({
        where: { id: user.id },
        select: { id: true, email: true },
      });
      if (!lockedUser?.email || lockedUser.email !== user.email) {
        throw new Error('Account identity changed');
      }

      await tx.passwordReset.updateMany({
        where: { userId: user.id, status: 0, type: 'PASSWORD' },
        data: { status: 1 },
      });
      const resetReq = await tx.passwordReset.create({
        data: {
          userId: user.id,
          verificationCode: hashedToken,
          type: 'PASSWORD',
        },
      });
      // A required admin audit must commit before an email can be sent.
      await options.beforeCommit?.(tx, { id: resetReq.id, userId: user.id });
      return { user, resetReq };
    });

    try {
      const verifyUrl = new URL(
        '/account/password-reset/verify',
        process.env.NEXT_PUBLIC_URL_ROOT || 'https://openthrone.dev',
      ).toString();
      const info = await sendImmediate({
        to: user.email,
        subject: 'Password Reset',
        text: `Your password reset token is: ${resetToken}\nPlease use this token to reset your password here: ${verifyUrl}`,
      });
      return {
        status: true,
        message: 'Password reset email sent',
        id: resetReq.id,
        info,
      };
    } catch {
      // Do not leave an undelivered token active or log SMTP details/tokens.
      await prisma.passwordReset.updateMany({
        where: { id: resetReq.id, status: 0 },
        data: { status: 1 },
      });
      logError('Failed to send password reset email', { resetId: resetReq.id });
      throw new Error('Failed to send password reset email');
    }
  }

  /**
   * Generates a secret for 2FA setup.
   */
  static async enable2FA(userId: number, _displayName: string) {
    return beginTwoFactorSetup(userId);
  }

  /**
   * Verifies a 2FA token.
   */
  static async verify2FA(userId: number, token: string, setupToken: string) {
    return completeTwoFactorSetup(userId, token, setupToken);
  }

  /**
   * Disables 2FA for a user.
   */
  static async disable2FA(userId: number) {
    return disableTwoFactor(userId);
  }
}
