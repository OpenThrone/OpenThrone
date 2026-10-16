import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withAuth } from '@/middleware/auth';
import { AccountService } from '@/services';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

// Define Zod enums for validation
const LocaleEnum = z.enum(['en-US', 'es-ES', 'de-DE']);
const ColorSchemeEnum = z.enum(['UNDEAD', 'HUMAN', 'GOBLIN', 'ELF']);

// Zod schema for password change
const PasswordChangeSchema = z
  .object({
    type: z.literal('password'),
    currentPassword: z.string().min(1, 'Current password is required.'),
    password: z
      .string()
      .min(8, 'New password must be at least 8 characters long.'),
    password_confirm: z.string(),
  })
  .refine((data) => data.password === data.password_confirm, {
    message: 'New passwords do not match.',
    path: ['password_confirm'],
  });

// Zod schema for game options change
const GameOptionsChangeSchema = z.object({
  type: z.literal('gameoptions'),
  locale: LocaleEnum,
  colorScheme: ColorSchemeEnum,
});

// Union schema for the request body
const SettingsRequestSchema = z.union([
  PasswordChangeSchema,
  GameOptionsChangeSchema,
]);

// Define response types
type ApiErrorResponse = { error: string; details?: any };
type ApiSuccessResponse = { message: string };

const handler = async (
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
      'Auth session missing in settings handler',
    );
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
    // Process based on validated type
    if (validatedData.type === 'password') {
      const result = await AccountService.changePassword(userId, {
        currentPassword: validatedData.currentPassword,
        newPassword: validatedData.password,
        confirmPassword: validatedData.password_confirm,
      });

      return res.status(200).json(result);
    }
    if (validatedData.type === 'gameoptions') {
      const result = await AccountService.updateGameOptions(userId, {
        locale: validatedData.locale,
        colorScheme: validatedData.colorScheme,
      });

      return res.status(200).json(result);
    }

    // Should not be reachable due to Zod validation
    return res.status(400).json({ error: 'Invalid request type.' });
  } catch (error: any) {
    const logContext = { userId, type: validatedData.type };
    logError(error, logContext, 'API Error: /api/account/settings');
    return res
      .status(500)
      .json({ error: 'An unexpected error occurred while updating settings.' });
  }
};

export default withAuth(handler);
