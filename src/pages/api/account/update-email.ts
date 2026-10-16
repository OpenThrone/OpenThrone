import { createHash } from 'crypto';
import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { rateLimiter } from '@/lib/rate-limiter';
import { withAuth } from '@/middleware/auth';
import { AccountAnonymizationService } from '@/services/AccountAnonymization.service';
import type { AuthenticatedRequest } from '@/types/api';
import { verifyStoredPassword } from '@/utils/credentialGuards';
import { logError } from '@/utils/logger';
// Removed getSession and stringifyObj imports

// Zod schema for the request body
const UpdateEmailSchema = z.object({
  newEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email({ message: 'Invalid email address format.' }),
  password: z.string().min(1, { message: 'Password is required.' }),
  verify: z.string().min(1, { message: 'Verification code is required.' }), // Add length validation if applicable
});

// Define response types
type ApiErrorResponse = { error: string; details?: any };
type ApiSuccessResponse = { message: string };

export const handler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiSuccessResponse | ApiErrorResponse>,
) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  if (!req.session?.user?.id) {
    logError(
      null,
      { requestPath: req.url },
      'Auth session missing in update-email handler',
    );
    return res.status(401).json({ error: 'Authentication required.' });
  }

  // Validate request body
  const parseResult = UpdateEmailSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body.',
      details: parseResult.error.flatten().fieldErrors,
    });
  }

  const { newEmail, password, verify } = parseResult.data;
  const userId = Number(req.session.user.id);

  try {
    if (
      !(await rateLimiter(`email-change-verify:${userId}`, {
        windowMs: 3 * 60 * 60_000,
        max: 5,
      }))
    ) {
      return res
        .status(429)
        .json({ error: 'Too many verification attempts. Try again later.' });
    }
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      // 2. Find the valid verification code for this user
      const verificationRecord = await tx.passwordReset.findFirst({
        where: {
          userId, // Ensure the code belongs to the logged-in user
          verificationCode: createHash('sha256').update(verify).digest('hex'),
          status: 0, // Status 0 likely means 'pending' or 'unused'
          type: 'EMAIL', // Ensure it's an email verification code
          createdAt: { gt: new Date(Date.now() - 3 * 60 * 60_000) },
        },
      });

      if (!verificationRecord) {
        throw new Error('Invalid or expired verification code.');
      }

      // 3. Verify the user's current password
      const currentUser = await tx.users.findUnique({
        where: { id: userId },
        select: { password_hash: true },
      });

      if (!currentUser || !currentUser.password_hash) {
        // Should not happen if session is valid, but safety check
        throw new Error('User account not found or password hash missing.');
      }

      const passwordMatch = await verifyStoredPassword(
        currentUser.password_hash,
        password,
      );
      if (!passwordMatch) {
        throw new Error('Invalid password.');
      }

      // 1. Check if the new email is already in use by another user
      const existingUserWithNewEmail = await tx.users.findFirst({
        where: { email: { equals: newEmail, mode: 'insensitive' } },
        select: { id: true }, // Only need ID to check existence
      });

      if (existingUserWithNewEmail && existingUserWithNewEmail.id !== userId) {
        throw new Error('Email is already in use by another account.'); // Use Error for flow control
      }

      // Identity retention: refuse addresses held by a deletion cooldown or
      // sanction with a generic message (no disclosure).
      const identityBlocks =
        await AccountAnonymizationService.isIdentityBlocked({
          email: newEmail,
        });
      if (identityBlocks.emailBlocked) {
        throw new Error('Email is already in use by another account.');
      }

      // Claim the pending token atomically before changing the account.
      const consumed = await tx.passwordReset.updateMany({
        where: { id: verificationRecord.id, userId, status: 0, type: 'EMAIL' },
        data: { status: 1 },
      });
      if (consumed.count !== 1) {
        throw new Error('Invalid or expired verification code.');
      }
      await tx.users.update({
        where: { id: userId },
        data: { email: newEmail },
      });

      // Optionally: Invalidate other pending email verification codes for this user
      // await tx.passwordReset.updateMany({
      //   where: { userId: userId, type: 'EMAIL', status: 0 },
      //   data: { status: 2 }, // Status 2 for 'invalidated'
      // });
    });

    return res.status(200).json({ message: 'Email updated successfully.' });
  } catch (error: any) {
    // Don't log password or verification code
    const logContext = { userId, newEmail };
    logError(error, logContext, 'API Error: /api/account/update-email');

    // Handle specific errors
    if (error.message === 'Email is already in use by another account.') {
      return res.status(409).json({ error: error.message }); // 409 Conflict
    }
    if (error.message === 'Invalid or expired verification code.') {
      return res.status(400).json({ error: error.message });
    }
    if (error.message === 'Invalid password.') {
      return res.status(401).json({ error: error.message }); // 401 Unauthorized
    }
    if (error.message === 'User account not found or password hash missing.') {
      return res.status(404).json({ error: 'User account issue.' });
    }
    // Generic error
    return res.status(500).json({
      error: 'An unexpected error occurred while updating the email address.',
    });
  }
};

// Removed validateEmail function

export default withAuth(handler);
