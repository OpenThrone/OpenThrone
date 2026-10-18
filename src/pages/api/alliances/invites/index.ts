import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withAuth } from '@/middleware/auth';
import { AllianceService } from '@/services';
import type { AuthenticatedRequest } from '@/types/api';
import { stringifyObj } from '@/utils/numberFormatting';
import { publicErrorMessage } from '@/utils/publicError';

const InviteSchema = z.object({
  allianceId: z.coerce.number().int().positive(),
  displayName: z.string().trim().min(1).max(50),
});

/**
 * Alliance invitations.
 * GET ?allianceId=N: that alliance's pending invitations (invite_member).
 * GET: invitations waiting for the signed-in player.
 * POST { allianceId, displayName }: invite a player (invite_member).
 * DELETE ?inviteId=N: withdraw an invitation (invite_member).
 */
const invitesHandler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
) => {
  const userId = Number(req.session.user.id);
  try {
    if (req.method === 'GET') {
      const allianceId = Number(req.query.allianceId);
      const invites = allianceId
        ? await AllianceService.getAllianceInvites(allianceId, userId)
        : await AllianceService.getMyInvites(userId);
      return res.status(200).json(stringifyObj(invites));
    }
    if (req.method === 'POST') {
      const parsed = InviteSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Enter a player name' });
      }
      const result = await AllianceService.invitePlayer(
        userId,
        parsed.data.allianceId,
        parsed.data.displayName,
      );
      return res.status(200).json(result);
    }
    if (req.method === 'DELETE') {
      const inviteId = Number(req.query.inviteId);
      if (!Number.isSafeInteger(inviteId) || inviteId <= 0) {
        return res.status(400).json({ error: 'inviteId is required' });
      }
      return res
        .status(200)
        .json(await AllianceService.cancelInvite(inviteId, userId));
    }
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).end();
  } catch (error) {
    return res.status(400).json({ error: publicErrorMessage(error) });
  }
};

export default withAuth(invitesHandler);
