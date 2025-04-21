import type { NextApiResponse } from 'next';
import type { AuthenticatedRequest } from '@/types/api';
import { z } from 'zod';
import prisma from "@/lib/prisma";
// Removed Locales, PlayerRace imports as they will be defined in Zod schema
import { withAuth } from '@/middleware/auth';
import argon2 from 'argon2'; // Import argon2 at the top
import { logError } from '@/utils/logger'; // Added logger import

// Define Zod enums for validation
const LocaleEnum = z.enum(['en-US', 'es-ES']); // Add other supported locales
const ColorSchemeEnum = z.enum(['UNDEAD', 'HUMAN', 'GOBLIN', 'ELF']); // Add other supported schemes

// Zod schema for password change
const PasswordChangeSchema = z.object({
  type: z.literal('password'),
  currentPassword: z.string().min(1, "Current password is required."),
  password: z.string().min(8, "New password must be at least 8 characters long."), // Example minimum length
  password_confirm: z.string(),
}).refine(data => data.password === data.password_confirm, {
  message: "New passwords do not match.",
  path: ["password_confirm"], // Attach error to the confirmation field
});

// Zod schema for game options change
const GameOptionsChangeSchema = z.object({
  type: z.literal('gameoptions'),
  locale: LocaleEnum,
  colorScheme: ColorSchemeEnum,
});

// Union schema for the request body (use union instead of discriminatedUnion due to refine)
const SettingsRequestSchema = z.union([
  PasswordChangeSchema,
  GameOptionsChangeSchema,
]);

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
    logError(null, { requestPath: req.url }, 'Auth session missing in settings handler');
    return res.status(401).json({ error: 'Authentication required.' });
  }

  // Validate request body
  const parseResult = SettingsRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body.',
      details: parseResult.error.flatten().fieldErrors,
    });
  }

  const userId = req.session.user.id;
  const validatedData = parseResult.data;

  try {
    // Fetch user data needed for validation/update
    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { password_hash: true }, // Only select password hash if needed
    });

    if (!user) {
      // Should not happen if session is valid, but good practice
      return res.status(404).json({ error: 'User not found.' });
    }

    // Process based on validated type
    if (validatedData.type === 'password') {
      if (!user.password_hash) {
          logError(null, { userId }, 'User password hash missing in DB');
          return res.status(500).json({ error: 'Account configuration error.' });
      }
      // Verify current password
      const passwordMatches = await argon2.verify(user.password_hash, validatedData.currentPassword);
      if (!passwordMatches) {
        return res.status(401).json({ error: 'Incorrect current password.' }); // Use 401 for auth failure
      }

      // Hash new password and update
      const newPasswordHash = await argon2.hash(validatedData.password);
      await prisma.users.update({
        where: { id: userId },
        data: { password_hash: newPasswordHash },
      });

      return res.status(200).json({ message: 'Password updated successfully.' });

    } else if (validatedData.type === 'gameoptions') {
      // Update locale and color scheme
      await prisma.users.update({
        where: { id: userId },
        data: {
          locale: validatedData.locale,
          colorScheme: validatedData.colorScheme,
        },
      });

      return res.status(200).json({ message: 'Game options updated successfully.' });
    }
    // Should not be reachable due to Zod validation, but satisfies TypeScript
    return res.status(400).json({ error: 'Invalid request type.' });

  } catch (error: any) {
    // Don't log sensitive data like passwords from validatedData if logging context
    const logContext = { userId, type: validatedData.type };
    logError(error, logContext, 'API Error: /api/account/settings');
    return res.status(500).json({ error: 'An unexpected error occurred while updating settings.' });
  }
};

export default withAuth(handler);