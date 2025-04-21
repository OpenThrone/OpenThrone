import type { NextApiResponse } from 'next';
import type { AuthenticatedRequest } from '@/types/api';
import { z } from 'zod';
import prisma from "@/lib/prisma";
import { withAuth } from "@/middleware/auth";
import argon2 from 'argon2'; // Import argon2 at the top
import { logError } from '@/utils/logger'; // Added logger import
// Removed getSession and stringifyObj imports

// Zod schema for the request body
const UpdateEmailSchema = z.object({
  newEmail: z.string().email({ message: "Invalid email address format." }),
  password: z.string().min(1, { message: "Password is required." }),
  verify: z.string().min(1, { message: "Verification code is required." }), // Add length validation if applicable
});

// Define response types
type ApiErrorResponse = { error: string; details?: any };
type ApiSuccessResponse = { message: string };

const handler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiSuccessResponse | ApiErrorResponse>
) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  if (!req.session?.user?.id) {
    logError(null, { requestPath: req.url }, 'Auth session missing in update-email handler');
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
  const userId = req.session.user.id;

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Check if the new email is already in use by another user
      const existingUserWithNewEmail = await tx.users.findUnique({
        where: { email: newEmail },
        select: { id: true } // Only need ID to check existence
      });

      if (existingUserWithNewEmail && existingUserWithNewEmail.id !== userId) {
        throw new Error('Email is already in use by another account.'); // Use Error for flow control
      }

      // 2. Find the valid verification code for this user
      const verificationRecord = await tx.passwordReset.findFirst({
        where: {
          userId: userId, // Ensure the code belongs to the logged-in user
          verificationCode: verify,
          status: 0, // Status 0 likely means 'pending' or 'unused'
          type: 'EMAIL', // Ensure it's an email verification code
          // Optional: Add expiry check: expiresAt: { gte: new Date() }
        },
      });

      if (!verificationRecord) {
        throw new Error('Invalid or expired verification code.');
      }

      // 3. Verify the user's current password
      const currentUser = await tx.users.findUnique({
        where: { id: userId },
        select: { password_hash: true }
      });

      if (!currentUser || !currentUser.password_hash) {
        // Should not happen if session is valid, but safety check
        throw new Error('User account not found or password hash missing.');
      }

      const passwordMatch = await argon2.verify(currentUser.password_hash, password);
      if (!passwordMatch) {
        throw new Error('Invalid password.');
      }

      // 4. Update the user's email
      await tx.users.update({
        where: { id: userId },
        data: { email: newEmail },
      });

      // 5. Mark the verification code as used (update status to 1)
      await tx.passwordReset.update({
        where: { id: verificationRecord.id }, // Use the specific record ID
        data: { status: 1 },
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
    return res.status(500).json({ error: 'An unexpected error occurred while updating the email address.' });
  }
}

// Removed validateEmail function

export default withAuth(handler);
