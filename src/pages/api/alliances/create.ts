import { z } from 'zod';

import { withAuth } from '@/middleware/auth';
import { AllianceService } from '@/services';
import { stringifyObj } from '@/utils/numberFormatting';

const CreateAllianceSchema = z.object({
  allianceName: z.string().optional(),
  name: z.string().optional(),
  avatar: z.string().optional(),
  motto: z.string().optional(),
  comments: z.string().optional(),
  join_mode: z.enum(['OPEN', 'REQUEST_TO_JOIN', 'INVITE_ONLY']).optional(),
  roster_visibility: z.enum(['PUBLIC', 'MEMBERS_ONLY']).optional(),
});

const createAlliance = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const validatedBody = CreateAllianceSchema.safeParse(req.body);
  if (!validatedBody.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: validatedBody.error.flatten().fieldErrors,
    });
  }

  const { user } = req.session;
  const {
    allianceName,
    name,
    avatar,
    motto,
    comments,
    join_mode,
    roster_visibility,
  } = validatedBody.data;

  const resolvedName = (name ?? allianceName ?? '').toString().trim();
  if (!resolvedName) {
    return res.status(400).json({ error: 'Alliance name is required' });
  }

  try {
    const alliance = await AllianceService.createAlliance(user.id, {
      name: resolvedName,
      avatar: avatar ? String(avatar) : undefined,
      motto: motto ? String(motto) : undefined,
      comments: comments ? String(comments) : undefined,
      join_mode,
      roster_visibility,
    });
    return res.status(200).json(stringifyObj(alliance));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

export default withAuth(createAlliance);
