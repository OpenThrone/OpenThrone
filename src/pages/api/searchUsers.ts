import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';

import { stringifyObj } from '@/utils/numberFormatting';
import { withAuth } from '@/middleware/auth';

const getSearchResults = async (req: NextApiRequest, res: NextApiResponse) => {
  // Get the session on the server-side
  const session = req.session;

  // If there's no session, return an error
  if (!session) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const searchTerm = req.body.name;
  if (!searchTerm) {
    res.status(400).json({ error: 'No search term provided' });
    return;
  }

  try {
    // Fetch the user based on the session's user ID
    const users = await prisma.users.findMany({
      where: {
        // Use contains for a "LIKE" search, adjust for case sensitivity if needed
        display_name: {
          contains: searchTerm,
          mode: 'insensitive', // Remove or change to 'sensitive' for case-sensitive
        },
      },
      // Selecting specific fields to return
      select: {
        id: true,
        display_name: true,
        class: true,
        race: true,
        avatar: true,
        experience:true
      },
    });

    if (!users) {
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