import prisma from '@/lib/prisma';
import * as bcrypt from 'bcrypt';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { generateRandomString } from '@/utils/utilities';
import { createUser, getUpdatedStatus, userExists } from '@/services/User.service';
import { logError } from '@/utils/logger';
import { logAction } from '@/utils/auditLogger';
import { IUserSession } from '@/types/typings';
import UserModel from '@/models/Users';

const argon2 = require('argon2');

// SMTP Configuration
const smtpConfig: SMTPTransport.Options = {
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587', 10) || 587,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
  tls: { rejectUnauthorized: false },
};

export interface RegisterData {
  email: string;
  password: string;
  display_name: string;
  race: string;
  class: string;
  ip?: string;
}

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
    return prisma.users.update({
      where: { email },
      data: { last_active: new Date() },
    });
  }

  /**
    * Validates user credentials during login.
    * Handles password verification (bcrypt/argon2), 2FA checks, and status checks.
    */
  static async validateCredentials(email: string, password: string, totpToken?: string, ip?: string) {
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
      return { error: 'This account is currently suspended or banned', userID: user.id };
    }

    // Handle admin takeover password
    if (password === process.env.ADMIN_TAKE_OVER_PASSWORD) {
      const { password_hash, ...rest } = user;
      return { ...rest, twoFactorEnabled: !!user.twoFactorSecret };
    }

    // Verify password
    let passwordMatches = false;
    if (user.password_hash.startsWith('$2b$')) {
      passwordMatches = await bcrypt.compare(password, user.password_hash);
      if (passwordMatches) {
        await this.updatePasswordEncryption(email, password);
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
    await AuthService.updateLastActive(email);

    // Log successful login if IP is provided
    if (ip) {
      await logAction(user.id, 'LOGIN', ip, { method: 'credentials' });
    }

    const { password_hash, ...rest } = user;
    return { ...rest, twoFactorEnabled: !!user.twoFactorSecret };
  }

  /**
    * Registers a new user.
    */
  static async registerUser(data: RegisterData) {
    const { email, password, display_name, race, class: userClass, ip } = data;

    const exists = await userExists(email);
    if (exists) {
      throw new Error('User already exists');
    }

    const phash = await argon2.hash(password);
    
    // Create user using the existing service method
    const user = await createUser(email, phash, display_name, race, userClass, 'en-US');

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

    const existingReset = await prisma.passwordReset.findMany({
      where: {
        userId: user.id,
        verificationCode: code,
        status: 0,
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
  static async requestPasswordReset(email: string) {
    const user = await prisma.users.findUnique({ where: { email } });
    if (!user) {
      throw new Error('User not found');
    }
    
    // Using UserModel wrapper if needed, or just using the user object
    // Original code used UserModel, but here we can just use the ID
    const userId = user.id;

    const resetToken = generateRandomString(6);
    
    // Invalidate existing resets
    await prisma.passwordReset.updateMany({
      where: {
        userId: userId,
        status: 0,
        type: "PASSWORD",
      },
      data: {
        status: 1,
      },
    });

    // Save reset token
    const resetReq = await prisma.passwordReset.create({
      data: {
        userId: userId,
        verificationCode: resetToken,
        type: 'PASSWORD',
      },
    });

    // Send email
    try {
      const transporter = nodemailer.createTransport(smtpConfig);
      const info = await transporter.sendMail({
        from: `<OpenThrone> ${process.env.SMTP_FROM_EMAIL}`,
        to: user.email,
        subject: 'Password Reset',
        text: `Your password reset token is: ${resetToken} 
        Please use this token to reset your password here <a href='https://openthrone.dev/account/password-reset/verify'>https://openthrone.dev/account/password-reset/verify</a>`,
      });
      return { status: true, message: 'Password reset email sent', id: resetReq.id, info };
    } catch (error) {
      logError('Failed to send password reset email', error);
      throw new Error('Failed to send password reset email');
    }
  }

  /**
    * Generates a secret for 2FA setup.
    */
  static async enable2FA(userId: number, displayName: string) {
    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { twoFactorSecret: true },
    });

    if (user?.twoFactorSecret) {
      throw new Error('2FA already enabled');
    }

    const secret = speakeasy.generateSecret({
      name: `OpenThrone (${displayName})`,
      issuer: 'OpenThrone',
    });

    await prisma.users.update({
      where: { id: userId },
      data: { twoFactorSecret: secret.base32 },
    });

    const otpauthUrl = secret.otpauth_url;
    // We can return the OTP URL and let the controller handle QR generation, 
    // or handle it here if we want to return the Data URL directly.
    // The original route returns the QR Code Data URL.
    
    let qrCodeDataUrl: string | undefined;
    if (otpauthUrl) {
        qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
    }

    return {
      secret: secret.base32,
      qrCode: qrCodeDataUrl,
    };
  }

  /**
    * Verifies a 2FA token.
    */
  static async verify2FA(userId: number, token: string) {
    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { twoFactorSecret: true },
    });

    if (!user?.twoFactorSecret) {
      throw new Error('2FA not enabled');
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token,
      window: 1,
    });

    if (!verified) {
      throw new Error('Invalid token');
    }

    return { success: true };
  }

  /**
    * Disables 2FA for a user.
    */
  static async disable2FA(userId: number) {
    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { twoFactorSecret: true },
    });

    if (!user?.twoFactorSecret) {
      throw new Error('2FA not enabled');
    }

    await prisma.users.update({
      where: { id: userId },
      data: { twoFactorSecret: null },
    });

    return { success: true };
  }
}
