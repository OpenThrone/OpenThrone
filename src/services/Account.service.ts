import argon2 from 'argon2';
import { createHash } from 'crypto';
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { z } from 'zod';

import { Fortifications } from '@/constants';
import { DefaultLevelBonus } from '@/constants/Bonuses';
import prisma from '@/lib/prisma';
import type { BonusPointsType } from '@/lib/prisma-exports';
import UserModel from '@/models/Users';
import { getAntiAbuseExpiry, getAntiAbuseHash } from '@/utils/antiAbuse';
import { logError } from '@/utils/logger';
import { generateRandomString } from '@/utils/utilities';

import {
  buildDefaultUserUpdate,
  resetUserRelations,
  resolveColorScheme,
} from './UserDefaults.service';

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
  debug: true,
};

// Type definitions
/** Describes the password change data contract. */
export interface PasswordChangeData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/** Describes the game options data contract. */
export interface GameOptionsData {
  locale: 'en-US' | 'es-ES' | 'de-DE';
  colorScheme: 'UNDEAD' | 'HUMAN' | 'GOBLIN' | 'ELF';
}

/** Describes the profile update data contract. */
export interface ProfileUpdateData {
  bio?: string;
  avatarFile?: any; // Formidable file
}

/** Describes the email change data contract. */
export interface EmailChangeData {
  email: string;
}

/** Describes the password reset data contract. */
export interface PasswordResetData {
  email: string;
  verificationCode: string;
  newPassword: string;
}

interface VacationData {
  userId: number;
}

/** Describes the repair data contract. */
export interface RepairData {
  repairPoints: number;
}

/** Describes the account reset data contract. */
export interface AccountResetData {
  password: string;
}

/** Describes the bonus points data contract. */
export interface BonusPointsData {
  changeQueue: Record<string, { change: number }>;
}

/** Describes the last active data contract. */
export interface LastActiveData {
  email?: string;
  userId?: number;
  displayName?: string;
}

// Zod schemas for validation
const PasswordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required.'),
    newPassword: z
      .string()
      .min(8, 'New password must be at least 8 characters long.'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'New passwords do not match.',
    path: ['confirmPassword'],
  });

const GameOptionsSchema = z.object({
  locale: z.enum(['en-US', 'es-ES', 'de-DE']),
  colorScheme: z.enum(['UNDEAD', 'HUMAN', 'GOBLIN', 'ELF']),
});

const EmailChangeSchema = z.object({
  email: z.string().email({ message: 'Invalid email format.' }),
});

const PasswordResetSchema = z.object({
  email: z.string().email({ message: 'Invalid email format.' }),
  verificationCode: z.string().min(1),
  newPassword: z
    .string()
    .min(8, { message: 'Password must be at least 8 characters.' }),
});

const RepairSchema = z.object({
  repairPoints: z
    .number()
    .int()
    .positive({ message: 'Repair points must be a positive integer.' }),
});

const AccountResetSchema = z.object({
  password: z.string().min(1, { message: 'Password is required.' }),
});

const DisableAccountSchema = z.object({
  password: z.string().min(1, { message: 'Password is required.' }),
});

const ForgetAccountSchema = z.object({
  password: z.string().min(1, { message: 'Password is required.' }),
  reason: z.string().optional(),
});

const _VacationStartSchema = z.object({
  userId: z.number().int(),
});

const _BonusPointsSchema = z.object({
  changeQueue: z.record(
    z.number().int({ message: 'Change must be an integer.' }),
  ),
});

const LastActiveSchema = z
  .object({
    email: z.string().email().optional(),
    userId: z.number().int().optional(),
    displayName: z.string().optional(),
  })
  .refine((data) => data.email || data.userId || data.displayName, {
    message:
      'At least one identifier (email, userId, or displayName) must be provided',
  });

const hashResetToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

/** Encapsulates account data access and domain operations. */
export class AccountService {
  /**
   * Changes user password with current password verification
   */
  static async changePassword(userId: number, data: PasswordChangeData) {
    const validatedData = PasswordChangeSchema.parse(data);

    try {
      // Fetch user's current password hash
      const user = await prisma.users.findUnique({
        where: { id: userId },
        select: { password_hash: true },
      });

      if (!user || !user.password_hash) {
        throw new Error('User not found or password hash missing.');
      }

      // Verify current password
      const passwordMatches = await argon2.verify(
        user.password_hash,
        validatedData.currentPassword,
      );
      if (!passwordMatches) {
        throw new Error('Incorrect current password.');
      }

      // Hash and update new password
      const newPasswordHash = await argon2.hash(validatedData.newPassword);
      await prisma.users.update({
        where: { id: userId },
        data: { password_hash: newPasswordHash },
      });

      return { message: 'Password updated successfully.' };
    } catch (error: any) {
      logError(error, { userId }, 'Error changing password');
      throw error;
    }
  }

  /**
   * Updates game options (locale and color scheme)
   */
  static async updateGameOptions(userId: number, data: GameOptionsData) {
    const validatedData = GameOptionsSchema.parse(data);

    try {
      await prisma.users.update({
        where: { id: userId },
        data: {
          locale: validatedData.locale,
          colorScheme: validatedData.colorScheme,
        },
      });

      return { message: 'Game options updated successfully.' };
    } catch (error: any) {
      logError(
        error,
        { userId, data: validatedData },
        'Error updating game options',
      );
      throw error;
    }
  }

  /**
   * Updates user profile (bio and avatar)
   */
  static async updateProfile(userId: number, data: ProfileUpdateData) {
    try {
      const updateData: any = {};

      if (typeof data.bio === 'string') {
        updateData.bio = data.bio;
      }

      if (data.avatarFile && typeof data.avatarFile === 'string') {
        updateData.avatar = data.avatarFile;
      }

      if (Object.keys(updateData).length === 0) {
        throw new Error('No data to update');
      }

      const updated = await prisma.users.update({
        where: { id: userId },
        data: updateData,
      });

      return { message: 'Profile updated successfully.', user: updated };
    } catch (error: any) {
      logError(error, { userId }, 'Error updating profile');
      throw error;
    }
  }

  /**
   * Updates user bio
   */
  static async updateBio(userId: number, bio: string) {
    try {
      const updated = await prisma.users.update({
        where: { id: userId },
        data: { bio },
      });

      return { message: 'Bio updated successfully.', user: updated };
    } catch (error: any) {
      logError(error, { userId }, 'Error updating bio');
      throw error;
    }
  }

  /**
   * Initiates email change process with verification token
   */
  static async requestEmailChange(data: EmailChangeData) {
    const validatedData = EmailChangeSchema.parse(data);

    try {
      const user = await prisma.users.findUnique({
        where: { email: validatedData.email },
      });

      if (!user) {
        throw new Error('User not found');
      }

      const resetToken = generateRandomString(6);

      // Invalidate existing email change requests
      await prisma.passwordReset.updateMany({
        where: {
          userId: user.id,
          status: 0,
          type: 'EMAIL',
        },
        data: {
          status: 1,
        },
      });

      // Save reset token
      const resetReq = await prisma.passwordReset.create({
        data: {
          userId: user.id,
          verificationCode: resetToken,
          type: 'EMAIL',
        },
      });

      // Send email
      try {
        const transporter = nodemailer.createTransport(smtpConfig);
        const info = await transporter.sendMail({
          from: `<OpenThrone> ${process.env.SMTP_FROM_EMAIL}`,
          to: user.email,
          subject: 'Email Change',
          text: `Your email change token is: ${resetToken}\n 
      Please use this token to reset your email here: ${process.env.NEXT_PUBLIC_URL_ROOT}/account/email-verify?token=${resetToken}\n
      If you were not expecting this email, please ignore it.`,
          html: `
        <p>Your email change token is: <strong>${resetToken}</strong></p>
        <p>Please use this token to reset your email <a href="${process.env.NEXT_PUBLIC_URL_ROOT}/account/email-verify?token=${resetToken}">here</a>.</p>
        <p>If you were not expecting this email, please ignore it.</p>
      `,
        });

        return {
          status: true,
          message: 'Email change request sent',
          id: resetReq.id,
          userId: user.id,
          info,
        };
      } catch (emailError) {
        logError('Failed to send email change email', emailError);
        throw new Error('Failed to send email change email');
      }
    } catch (error: any) {
      logError(
        error,
        { email: validatedData.email },
        'Error requesting email change',
      );
      throw error;
    }
  }

  /**
   * Resets password using verification code
   */
  static async resetPasswordWithCode(data: PasswordResetData) {
    const validatedData = PasswordResetSchema.parse(data);

    try {
      const user = await prisma.users.findUnique({
        where: { email: validatedData.email },
      });

      if (!user) {
        throw new Error('User not found');
      }

      const hashedCode = hashResetToken(validatedData.verificationCode);
      const passwordHash = await argon2.hash(validatedData.newPassword);
      await prisma.$transaction(async (tx) => {
        const consumeResult = await tx.passwordReset.updateMany({
          where: {
            userId: user.id,
            verificationCode: hashedCode,
            status: 0,
            createdAt: {
              gt: new Date(new Date().getTime() - 1000 * 60 * 60 * 3), // 3 hours
            },
            type: 'PASSWORD',
          },
          data: {
            status: 1,
          },
        });

        if (consumeResult.count === 0) {
          throw new Error('Invalid verification code');
        }

        await tx.users.update({
          where: { id: user.id },
          data: { password_hash: passwordHash },
        });
      });

      return { status: true, passwordChanged: true };
    } catch (error: any) {
      logError(
        error,
        { email: validatedData.email },
        'Error resetting password',
      );
      throw error;
    }
  }

  /**
   * Starts vacation mode for user (with yearly limits)
   */
  static async startVacation(userId: number) {
    try {
      const now = new Date();
      const yearStart = new Date(now.getFullYear(), 0, 1);

      // Count vacations this year
      const vacationCount = await prisma.accountStatusHistory.count({
        where: {
          user_id: userId,
          status: 'VACATION',
          start_date: {
            gte: yearStart,
          },
        },
      });

      if (vacationCount >= 4) {
        throw new Error('Vacation limit reached for this year');
      }

      // Create vacation status
      const vacationStartDate = now;
      const vacationEndDate = new Date();
      vacationEndDate.setDate(vacationStartDate.getDate() + 14); // 2 weeks

      await prisma.accountStatusHistory.create({
        data: {
          user_id: userId,
          status: 'VACATION',
          start_date: vacationStartDate,
          end_date: vacationEndDate,
          reason: 'User initiated vacation mode',
        },
      });

      return { message: 'Vacation mode started', vacationEndDate };
    } catch (error: any) {
      logError(error, { userId }, 'Error starting vacation mode');
      throw error;
    }
  }

  /**
   * Ends vacation mode for user
   */
  static async endVacation(userId: number) {
    try {
      await prisma.$transaction(async (tx) => {
        // End current vacation status
        await tx.accountStatusHistory.updateMany({
          where: {
            user_id: userId,
            status: 'VACATION',
            end_date: null,
          },
          data: {
            end_date: new Date(),
          },
        });

        // Create active status
        await tx.accountStatusHistory.create({
          data: {
            user_id: userId,
            status: 'ACTIVE',
            start_date: new Date(),
            reason: 'Vacation mode ended by user',
          },
        });
      });

      return { message: 'Vacation mode ended' };
    } catch (error: any) {
      logError(error, { userId }, 'Error ending vacation mode');
      throw error;
    }
  }

  /**
   * Repairs user's fortification with cost calculation
   */
  static async repairFortification(userId: number, data: RepairData) {
    const validatedData = RepairSchema.parse(data);

    try {
      const result = await prisma.$transaction(async (tx) => {
        // Fetch user data
        const user = await tx.users.findUnique({
          where: { id: userId },
          select: { gold: true, fort_level: true, fort_hitpoints: true },
        });

        if (!user) {
          throw new Error('User not found');
        }

        // Get fortification details
        const fortification = Fortifications.find(
          (f) => f.level === user.fort_level,
        );
        if (!fortification) {
          throw new Error(
            `Invalid fortification level found for user: ${user.fort_level}`,
          );
        }

        // Check if already at full health
        if (user.fort_hitpoints >= fortification.hitpoints) {
          throw new Error('Fortification is already at full health or above.');
        }

        // Calculate cost
        const totalCost =
          BigInt(validatedData.repairPoints) *
          BigInt(fortification.costPerRepairPoint);
        if (user.gold < totalCost) {
          throw new Error(
            `Not enough gold. Required: ${totalCost}, Available: ${user.gold}`,
          );
        }

        // Calculate new hitpoints
        const currentHp = user.fort_hitpoints;
        let newFortHitpoints = user.fort_hitpoints + validatedData.repairPoints;
        if (newFortHitpoints > fortification.hitpoints) {
          newFortHitpoints = fortification.hitpoints;
        }
        const actualRepairAmount = newFortHitpoints - currentHp;

        if (actualRepairAmount <= 0) {
          throw new Error(
            'Calculated repair amount is zero or negative, cannot proceed.',
          );
        }

        // Recalculate cost based on actual repair amount
        const finalCost =
          BigInt(actualRepairAmount) * BigInt(fortification.costPerRepairPoint);
        if (user.gold < finalCost) {
          throw new Error(
            `Not enough gold for actual repair. Required: ${finalCost}, Available: ${user.gold}`,
          );
        }

        // Create bank history entry
        await tx.bank_history.create({
          data: {
            from_user_id: userId,
            to_user_id: 0, // Bank/System
            from_user_account_type: 'HAND',
            to_user_account_type: 'BANK',
            date_time: new Date(),
            gold_amount: finalCost,
            history_type: 'FORT_REPAIR',
            stats: {
              currentFortHP: currentHp,
              requestedRepairPoints: validatedData.repairPoints,
              actualRepairAmount,
              newFortHP: newFortHitpoints,
              cost: finalCost.toString(),
            },
          },
        });

        // Update user
        const updatedUser = await tx.users.update({
          where: { id: userId },
          data: {
            gold: user.gold - finalCost,
            fort_hitpoints: newFortHitpoints,
          },
          select: { gold: true, fort_hitpoints: true },
        });

        return {
          newGold: updatedUser.gold.toString(),
          newFortHitpoints: updatedUser.fort_hitpoints,
        };
      });

      return {
        message: 'Fortification repaired successfully',
        data: result,
      };
    } catch (error: any) {
      logError(
        error,
        { userId, repairPoints: validatedData.repairPoints },
        'Error repairing fortification',
      );
      throw error;
    }
  }

  /**
   * Resets account to default state (requires password verification)
   */
  static async resetAccount(userId: number, data: AccountResetData) {
    const validatedData = AccountResetSchema.parse(data);

    try {
      await prisma.$transaction(async (tx) => {
        // Fetch user
        const user = await tx.users.findUnique({
          where: { id: userId },
          select: { password_hash: true, colorScheme: true, race: true },
        });

        if (!user || !user.password_hash) {
          throw new Error('User not found or password hash missing.');
        }

        // Verify password
        const passwordMatches = await argon2.verify(
          user.password_hash,
          validatedData.password,
        );
        if (!passwordMatches) {
          throw new Error('Invalid password.');
        }

        // Prepare default reset state
        // Update user with default state
        await tx.users.update({
          where: { id: userId },
          data: {
            ...buildDefaultUserUpdate(),
            fort_hitpoints: Fortifications[0].hitpoints,
            colorScheme: resolveColorScheme(user.colorScheme, user.race),
          },
        });

        await resetUserRelations(tx, userId);
        await tx.accountResetHistory.create({
          data: { userId, resetDate: new Date() },
        });
      });

      return { message: 'Account reset successfully.' };
    } catch (error: any) {
      logError(error, { userId }, 'Error resetting account');
      throw error;
    }
  }

  /**
   * Disables an account (soft close) with password verification.
   */
  static async disableAccount(userId: number, data: AccountResetData) {
    const validatedData = DisableAccountSchema.parse(data);

    try {
      const user = await prisma.users.findUnique({
        where: { id: userId },
        select: { password_hash: true },
      });

      if (!user || !user.password_hash) {
        throw new Error('User not found or password hash missing.');
      }

      const passwordMatches = await argon2.verify(
        user.password_hash,
        validatedData.password,
      );
      if (!passwordMatches) {
        throw new Error('Invalid password.');
      }

      await prisma.accountStatusHistory.create({
        data: {
          user_id: userId,
          status: 'CLOSED',
          start_date: new Date(),
          reason: 'User disabled account',
        },
      });

      return { message: 'Account disabled successfully.' };
    } catch (error: any) {
      logError(error, { userId }, 'Error disabling account');
      throw error;
    }
  }

  /**
   * Pseudonymizes account data and stores an anti-abuse hash.
   */
  static async forgetAccount(
    userId: number,
    data: { password: string; reason?: string },
  ) {
    const validatedData = ForgetAccountSchema.parse(data);

    try {
      await prisma.$transaction(async (tx) => {
        const user = await tx.users.findUnique({
          where: { id: userId },
          select: {
            email: true,
            display_name: true,
            password_hash: true,
            twoFactorSecret: true,
            avatar: true,
            bio: true,
            race: true,
            colorScheme: true,
          },
        });

        if (!user || !user.password_hash) {
          throw new Error('User not found or password hash missing.');
        }

        const passwordMatches = await argon2.verify(
          user.password_hash,
          validatedData.password,
        );
        if (!passwordMatches) {
          throw new Error('Invalid password.');
        }

        const hash = getAntiAbuseHash(user.email ?? '');
        const expiresAt = getAntiAbuseExpiry();

        await tx.antiAbuseShadow.upsert({
          where: { hash },
          update: {
            reason: validatedData.reason ?? 'User requested deletion',
            expiresAt,
          },
          create: {
            hash,
            reason: validatedData.reason ?? 'User requested deletion',
            expiresAt,
          },
        });

        const anonymizedEmail = `${userId}-deleted@deleted.local`;
        const anonymizedDisplayName = `deleted-user-${userId}`;
        const newPasswordHash = await argon2.hash(generateRandomString(24));

        await tx.users.update({
          where: { id: userId },
          data: {
            email: anonymizedEmail,
            display_name: anonymizedDisplayName,
            avatar: null,
            bio: '',
            twoFactorSecret: null,
            password_hash: newPasswordHash,
            colorScheme: resolveColorScheme(user.colorScheme, user.race),
          },
        });

        await tx.accountStatusHistory.create({
          data: {
            user_id: userId,
            status: 'CLOSED',
            start_date: new Date(),
            reason: validatedData.reason ?? 'User requested deletion',
          },
        });
      });

      return { message: 'Account data removed successfully.' };
    } catch (error: any) {
      logError(error, { userId }, 'Error forgetting account');
      throw error;
    }
  }

  /**
   * Updates user's last active timestamp
   */
  static async updateLastActive(data: LastActiveData) {
    const validatedData = LastActiveSchema.parse(data);

    try {
      const updatedUser = await prisma.users.update({
        where: validatedData.email
          ? { email: validatedData.email }
          : validatedData.userId
            ? { id: validatedData.userId }
            : { display_name: validatedData.displayName },
        data: { last_active: new Date() },
      });

      return {
        message: 'Last active timestamp updated',
        userId: updatedUser.id,
      };
    } catch (error: any) {
      logError(error, { data: validatedData }, 'Error updating last active');
      throw error;
    }
  }

  /**
   * Updates bonus points with validation against available proficiency points
   */
  static async updateBonusPoints(userId: number, data: BonusPointsData) {
    // Create BonusType enum from DefaultLevelBonus
    const BonusTypeEnum = z.enum(
      DefaultLevelBonus.map((b) => b.type) as [string, ...string[]],
    );

    try {
      const updatedBonusPointsResult = await prisma.$transaction(async (tx) => {
        // Fetch user data
        const userRecord = await tx.users.findUnique({
          where: { id: userId },
          select: {
            id: true,
            experience: true,
            UserBonusPoints: true,
          },
        });

        if (!userRecord) {
          throw new Error('User not found');
        }

        // Instantiate UserModel for available proficiency points calculation
        const userModel = new UserModel(userRecord);

        // Validate total change against available points
        const totalChange = Object.values(data.changeQueue).reduce(
          (acc, item) => acc + item.change,
          0,
        );

        if (totalChange < 0) {
          throw new Error(
            'Cannot decrease bonus points below zero through this endpoint.',
          );
        }

        if (totalChange > userModel.availableProficiencyPoints) {
          throw new Error(
            `Not enough proficiency points available. Required: ${totalChange}, Available: ${userModel.availableProficiencyPoints}`,
          );
        }

        // Process bonus points update
        const currentBonusPointsMap = new Map<string, number>();
        if (Array.isArray(userRecord.UserBonusPoints)) {
          userRecord.UserBonusPoints.forEach((bp) => {
            const parseType = BonusTypeEnum.safeParse(bp.type);
            if (parseType.success && typeof bp.level === 'number') {
              currentBonusPointsMap.set(parseType.data, bp.level);
            } else {
              logError(
                null,
                { userId, bonusPoint: bp },
                'Invalid bonus point item found in user data',
              );
            }
          });
        }

        const updatedBonusPoints: Array<{ type: string; level: number }> = [];
        let pointsSpent = 0;

        for (const defaultBonus of DefaultLevelBonus) {
          const { type } = defaultBonus;
          const currentLevel = currentBonusPointsMap.get(type) ?? 0;
          const change = data.changeQueue[type]?.change ?? 0;
          const newLevel = currentLevel + change;

          if (change < 0 && newLevel < 0) {
            throw new Error(`Cannot reduce level below 0 for ${type}.`);
          }

          if (change > 0 && newLevel > 75) {
            throw new Error(
              `Cannot increase level above 75 for ${type}. Requested: ${newLevel}`,
            );
          }

          if (change > 0) {
            pointsSpent += change;
          }

          updatedBonusPoints.push({ type, level: newLevel });
        }

        if (pointsSpent !== totalChange) {
          throw new Error('Calculation error during point allocation.');
        }

        // Update bonus points in database
        await Promise.all(
          updatedBonusPoints.map((bp) =>
            tx.userBonusPoints.upsert({
              where: {
                userId_type: { userId, type: bp.type as BonusPointsType },
              },
              update: { level: bp.level },
              create: {
                userId,
                type: bp.type as BonusPointsType,
                level: bp.level,
              },
            }),
          ),
        );

        return updatedBonusPoints;
      });

      return {
        message: 'Bonus points updated successfully.',
        data: { updatedBonusPoints: updatedBonusPointsResult },
      };
    } catch (error: any) {
      logError(
        error,
        { userId, changeQueue: data.changeQueue },
        'Error updating bonus points',
      );
      throw error;
    }
  }
}
