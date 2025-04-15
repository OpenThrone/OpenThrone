import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import { isAdmin } from '@/utils/authorization';
import { logError } from '@/utils/logger';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = req.session;

  // Check admin authorization
  if (!session || !session.user || !(await isAdmin(session.user.id))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    try {
      // Extract filter parameters from query
      const { id, username, email, status } = req.query;
      
      // Build where clause based on provided filters
      const whereClause: any = {};
      
      if (id) whereClause.id = parseInt(id as string, 10);
      if (username) whereClause.display_name = { contains: username as string, mode: 'insensitive' };
      if (email) whereClause.email = { contains: email as string, mode: 'insensitive' };
      
      // Handle status filter if provided
      if (status) {
        whereClause.statusHistories = {
          some: {
            status: status as string,
            end_date: null // Current status has no end date
          }
        };
      }

      // Query the database
      const users = await prisma.users.findMany({
        where: whereClause,
        select: {
          id: true,
          display_name: true,
          email: true,
          last_active: true,
          statusHistories: {
            where: { end_date: null },
            orderBy: { start_date: 'desc' },
            take: 1,
            select: {
              status: true
            }
          },
          permissions: {
            select: {
              type: true
            }
          }
        },
        orderBy: { id: 'asc' },
        take: 50 // Limit results for performance
      });

      // Format the response
      const formattedUsers = users.map(user => ({
        id: user.id.toString(),
        username: user.display_name,
        email: user.email,
        status: user.statusHistories[0]?.status || 'ACTIVE',
        lastActive: user.last_active,
        permissions: user.permissions.map(p => p.type)
      }));

      res.status(200).json({ users: formattedUsers });
    } catch (error) {
      logError('Error fetching users in admin panel:', error);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}

export default withAuth(handler);