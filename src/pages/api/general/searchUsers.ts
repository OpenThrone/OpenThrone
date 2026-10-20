import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { PermissionType } from '@/lib/prisma-exports';
import { withAuth } from '@/middleware/auth';
import { GeneralService } from '@/services';
import { hasAnyPermission, isImpersonatedSession } from '@/utils/authorization';
import { logError } from '@/utils/logger';
import { stringifyObj } from '@/utils/numberFormatting';

const SearchUsersSchema = z.object({ name: z.string().trim().min(1).max(50) });

/**
 * Player search by display name. Accepts the term as a POST body field or a
 * GET query parameter (callers use both; GET used to fail with 400).
 * Permission grants are staff data: only user managers receive them (the
 * admin Grant permissions form needs them).
 */
const getSearchResults = async (req: NextApiRequest, res: NextApiResponse) => {
  const { session } = req as NextApiRequest & { session?: any };
  if (!session) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const raw =
    req.method === 'GET'
      ? {
          name: Array.isArray(req.query.name)
            ? req.query.name[0]
            : req.query.name,
        }
      : req.body;
  const parseResult = SearchUsersSchema.safeParse(raw);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Invalid or missing search term',
      details: parseResult.error.flatten().fieldErrors,
    });
    return;
  }
  const { name: searchTerm } = parseResult.data;

  try {
    const users = await GeneralService.searchUsers(searchTerm);

    if (!users || users.length === 0) {
      res.status(404).json({ error: 'No users found' });
      return;
    }

    const viewerId = Number(session.user?.id);
    const canSeeGrants =
      !isImpersonatedSession(session) &&
      (await hasAnyPermission(viewerId, [PermissionType.MANAGE_USERS]));
    const visible = canSeeGrants
      ? users
      : users.map(({ permissions: _permissions, ...user }) => user);

    res.status(200).json(stringifyObj(visible));
  } catch (error) {
    logError(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export default withAuth(getSearchResults);
