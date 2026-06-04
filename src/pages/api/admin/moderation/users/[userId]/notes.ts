import { PermissionType } from '@prisma/client';
import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { ModerationService } from '@/services/Moderation.service';
import type { AuthenticatedRequest } from '@/types/api';

const Schema = z.object({
  note: z.string().min(1).max(2000).optional(),
  visibility: z.string().optional(),
  noteId: z.number().int().optional(),
});

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
  const userId = Number((context.query as { userId: string }).userId);
  if (Number.isNaN(userId)) return res.status(400).json({ error: 'Invalid user ID' });

  if (req.method === 'GET') {
    const notes = await ModerationService.getModeratorNotes(userId);
    return res.status(200).json(notes);
  }

  if (req.method === 'POST') {
    const staffUserId = req.session?.user?.id;
    if (!staffUserId) return res.status(401).json({ error: 'Unauthorized' });
    if (!context.body?.note) return res.status(400).json({ error: 'Note is required' });

    const note = await ModerationService.addModeratorNote(Number(staffUserId), userId, {
      note: context.body.note,
      visibility: context.body.visibility,
    });
    return res.status(201).json(note);
  }

  if (req.method === 'DELETE') {
    const noteId = context.body?.noteId;
    if (!noteId) return res.status(400).json({ error: 'Note ID is required' });

    await ModerationService.deleteModeratorNote(noteId);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ message: 'Method not allowed' });
}

export default guardedHandler(handler);
