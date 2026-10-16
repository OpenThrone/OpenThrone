import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import { ModerationService } from '@/services/Moderation.service';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logAction } from '@/utils/auditLogger';
import { isAdmin } from '@/utils/authorization';

const Schema = z
  .object({
    note: z.string().trim().min(1).max(2000).optional(),
    visibility: z.enum(['STAFF', 'ADMINS_ONLY']).optional(),
    noteId: z.number().int().positive().optional(),
  })
  .strict();

const guardedHandler = withApiGuard({
  methods: ['GET', 'POST', 'DELETE'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.MANAGE_MODERATOR_NOTES],
  rateLimitProfile: 'admin',
  bodySchema: Schema,
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { query: unknown; body: z.infer<typeof Schema> },
) {
  const parsedUserId = z.coerce
    .number()
    .int()
    .positive()
    .safeParse((context.query as { userId?: unknown }).userId);
  if (!parsedUserId.success)
    return res.status(400).json({ error: 'Invalid user ID' });
  const userId = parsedUserId.data;
  const actorId = Number(req.session?.user?.id);
  const admin = await isAdmin(actorId);
  const parsedBody = Schema.safeParse(req.body);

  if (req.method === 'GET') {
    const notes = await ModerationService.getModeratorNotes(userId, admin);
    return res.status(200).json(notes);
  }

  if (req.method === 'POST') {
    const staffUserId = req.session?.user?.id;
    if (!staffUserId) return res.status(401).json({ error: 'Unauthorized' });
    if (!parsedBody.success || !parsedBody.data.note)
      return res.status(400).json({ error: 'Note is required' });
    if (parsedBody.data.visibility === 'ADMINS_ONLY' && !admin)
      return res.status(403).json({ error: 'Forbidden' });

    const note = await ModerationService.addModeratorNote(
      Number(staffUserId),
      userId,
      {
        note: parsedBody.data.note,
        visibility: parsedBody.data.visibility,
      },
    );
    await logAction(Number(staffUserId), 'MOD_NOTE_ADD', getRequestIp(req), {
      targetUserId: userId,
      noteId: note?.id ?? null,
    });
    return res.status(201).json(note);
  }

  if (req.method === 'DELETE') {
    if (!parsedBody.success)
      return res.status(400).json({ error: 'Invalid request body' });
    const { noteId } = parsedBody.data;
    if (!noteId) return res.status(400).json({ error: 'Note ID is required' });

    const deleted = await ModerationService.deleteModeratorNote(
      noteId,
      userId,
      admin,
    );
    if (!deleted.count)
      return res.status(404).json({ error: 'Note not found' });
    await logAction(
      Number(req.session?.user?.id),
      'MOD_NOTE_DELETE',
      getRequestIp(req),
      { targetUserId: userId, noteId },
    );
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ message: 'Method not allowed' });
}

export default guardedHandler(handler);
