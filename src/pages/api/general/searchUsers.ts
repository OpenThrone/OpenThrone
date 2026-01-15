import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { withAuth } from '@/middleware/auth';
import { GeneralService } from '@/services';
import { stringifyObj } from '@/utils/numberFormatting';

const SearchUsersSchema = z.object({ name: z.string().min(1) });

const getSearchResults = async (req: NextApiRequest, res: NextApiResponse) => {
  // Get the session on the server-side
  const { session } = req;

  // If there's no session, return an error
  if (!session) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const parseResult = SearchUsersSchema.safeParse(req.body);
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

    res.status(200).json(stringifyObj(users));
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export default withAuth(getSearchResults);
