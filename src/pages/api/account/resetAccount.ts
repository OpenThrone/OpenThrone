import type { NextApiResponse } from 'next';
import type { AuthenticatedRequest } from '@/types/api';
import { z } from 'zod';
import prisma from "@/lib/prisma";
import { withAuth } from '@/middleware/auth';
import { logError } from '@/utils/logger'; // Added logger import
import argon2 from 'argon2'; // Import argon2 at the top
import { Prisma } from '@prisma/client'; // Import Prisma types
import { Omit } from '@prisma/client/runtime/library';
import Error from 'next/error';
import { Fortifications } from '@/constants';

// Zod schema for the request body
const ResetRequestSchema = z.object({
  password: z.string().min(1, { message: 'Password is required.' }),
});

// Define response types
type ApiErrorResponse = { error: string; details?: any };
type ApiSuccessResponse = { message: string };

// Define the default state for account reset
// Use Prisma.JsonValue for JSON fields if necessary, or define specific types
const DEFAULT_RESET_STATE: Omit<Prisma.usersUpdateInput, 'colorScheme'> = {
  gold: 25000,
  attack_turns: 50,
  gold_in_bank: 0,
  fort_level: 1,
  fort_hitpoints: Fortifications[0].hitpoints, 
  experience: 0,
  economy_level: 0,
  house_level: 0,  
};


const handler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiSuccessResponse | ApiErrorResponse>
) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  if (!req.session?.user?.id) {
    logError(null, { requestPath: req.url }, 'Auth session missing in resetAccount handler');
    return res.status(401).json({ error: 'Authentication required.' });
  }

  // Validate request body
  const parseResult = ResetRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body.',
      details: parseResult.error.flatten().fieldErrors,
    });
  }

  const { password } = parseResult.data;
  const userId = req.session.user.id;

  try {
    await prisma.$transaction(async (tx) => {
      // Fetch user within transaction
      const user = await tx.users.findUnique({
          where: { id: userId },
          select: { password_hash: true, colorScheme: true } // Select only needed fields
      });

      if (!user || !user.password_hash) {
        // Added check for password_hash existence
        // Throw a plain object here to avoid project-specific Error constructor typing during triage
        throw { message: 'User not found or password hash missing.' };
      }

      // Verify password
      const passwordMatches = await argon2.verify(user.password_hash, password);
      if (!passwordMatches) {
        // Throw a plain object here to avoid project-specific Error constructor typing during triage
        throw { message: 'Invalid password.' };
      }

      // Prepare update data, preserving colorScheme
      const updateData: Prisma.usersUpdateInput = {
          ...DEFAULT_RESET_STATE,
          colorScheme: user.colorScheme, // Preserve existing color scheme
      };

      // Update user with default state
      await tx.users.update({
        where: { id: userId },
        data: updateData,
      });

      await tx.userUnits.deleteMany({ where: { userId: userId } });
      await tx.userBattleUpgrades.deleteMany({ where: { userId: userId } });
      await tx.userStructureUpgrades.deleteMany({ where: { userId: userId } });
      await tx.userBonusPoints.deleteMany({ where: { userId: userId } });
      await tx.userItems.deleteMany({ where: { userId: userId } });
       await tx.accountResetHistory.create({ data: { userId: userId, resetAt: new Date() } });
    });

    return res.status(200).json({ message: 'Account reset successfully.' });

  } catch (error: any) {
    const logContext = { userId }; // Don't log password
    logError(error, logContext, 'API Error: /api/account/resetAccount');

    // Handle specific errors
    if (error.message === 'Invalid password.') {
      return res.status(401).json({ error: error.message }); // Use 401 for invalid password
    }
    if (error.message === 'User not found or password hash missing.') {
       return res.status(404).json({ error: 'User not found or account issue.' });
    }
    // Generic error
    return res.status(500).json({ error: 'An unexpected error occurred while resetting the account.' });
  }
}

export default withAuth(handler);
