import { z } from 'zod';

import { ALLIANCE_PERMISSION_KEYS } from '@/constants/alliancePermissions';
import { withApiGuard } from '@/middleware/apiGuard';
import { withAuth } from '@/middleware/auth';
import { AllianceService } from '@/services';
import type { AuthenticatedRequest } from '@/types/api';
import { stringifyObj } from '@/utils/numberFormatting';
import { publicErrorMessage } from '@/utils/publicError';

const PermissionsSchema = z.object(
  Object.fromEntries(
    ALLIANCE_PERMISSION_KEYS.map((key) => [key, z.boolean().optional()]),
  ),
);

const CreateSchema = z.object({
  allianceId: z.number().int().positive(),
  name: z.string().trim().min(1).max(50),
  permissions: PermissionsSchema.default({}),
});

const UpdateSchema = z.object({
  allianceId: z.number().int().positive(),
  roleId: z.number().int().positive(),
  name: z.string().trim().min(1).max(50).optional(),
  permissions: PermissionsSchema.optional(),
});

const DeleteSchema = z.object({
  allianceId: z.number().int().positive(),
  roleId: z.number().int().positive(),
});

const guardedHandler = withApiGuard({
  methods: ['POST', 'PATCH', 'PUT', 'DELETE'],
  authMode: 'required',
});

/**
 * Alliance ranks (edit_ranks permission). POST creates, PATCH/PUT renames or
 * changes permissions, DELETE removes an unused rank.
 */
const handler = async (req: AuthenticatedRequest, res: any) => {
  const sessionUserId = Number(req.session?.user?.id);
  const method = (req.method || '').toUpperCase();
  const schema =
    method === 'POST'
      ? CreateSchema
      : method === 'DELETE'
        ? DeleteSchema
        : UpdateSchema;
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    if (method === 'POST') {
      const body = parsed.data as z.infer<typeof CreateSchema>;
      const role = await AllianceService.createRole(
        body.allianceId,
        sessionUserId,
        {
          allianceId: body.allianceId,
          name: body.name,
          permissions: body.permissions ?? {},
        },
      );
      return res.status(200).json(role);
    }
    if (method === 'DELETE') {
      const body = parsed.data as z.infer<typeof DeleteSchema>;
      const result = await AllianceService.deleteRole(
        body.allianceId,
        body.roleId,
        sessionUserId,
      );
      return res.status(200).json(stringifyObj(result));
    }
    const { allianceId, roleId, ...updates } = parsed.data as z.infer<
      typeof UpdateSchema
    >;
    const role = await AllianceService.updateRole(
      allianceId,
      roleId,
      sessionUserId,
      updates,
    );
    return res.status(200).json(role);
  } catch (error: any) {
    return res.status(400).json({ error: publicErrorMessage(error) });
  }
};

// Per-account game_write budget and account-status check, like other game writes.
export default withAuth(guardedHandler(handler), {
  rateLimitProfile: 'game_write',
});
