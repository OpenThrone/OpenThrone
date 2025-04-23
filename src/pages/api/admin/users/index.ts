import { NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import { isAdmin } from '@/utils/authorization';
import { logError } from '@/utils/logger';
import type { AuthenticatedRequest } from '@/types/api'; // Import the shared type

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const session = req.session;

  // Check admin authorization (handle potentially undefined session/user/id)
  if (!session?.user?.id || !(await isAdmin(session.user.id))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    try {
      // Extract filter, pagination, and sorting parameters from query
      const {
        id,
        username,
        email,
        status,
        limit = '10', // Default limit
        offset = '0', // Default offset
        sort = 'id', // Default sort field
        order = 'asc' // Default sort order
      } = req.query;

      const take = parseInt(limit as string, 10);
      const skip = parseInt(offset as string, 10);
      const sortField = sort as string;
      const sortOrder = order as 'asc' | 'desc';
      
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

      // Define mapping for sort fields
      const sortFieldMapping: { [key: string]: string } = {
        id: 'id',
        username: 'display_name',
        email: 'email',
        lastActive: 'last_active',
        // status sorting is complex due to relation, handled separately if needed
      };

      // Build orderBy clause dynamically
      const orderByClause: any = {};
      if (sortFieldMapping[sortField]) {
        orderByClause[sortFieldMapping[sortField]] = sortOrder;
      } else {
        // Default sort if field is invalid or status
        orderByClause['id'] = 'asc';
      }

      // Query the database for users and total count in parallel
      const [users, total] = await Promise.all([
        prisma.users.findMany({
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
          orderBy: orderByClause,
          take: take,
          skip: skip,
        }),
        prisma.users.count({
          where: whereClause,
        })
      ]);

      // Format the response
      const formattedUsers = users.map(user => ({
        id: user.id.toString(),
        username: user.display_name,
        email: user.email,
        status: user.statusHistories[0]?.status || 'ACTIVE', // Default to ACTIVE if no status history
        lastActive: user.last_active,
        permissions: user.permissions.map(p => p.type)
      }));

      res.status(200).json({ users: formattedUsers, total });
    } catch (error) {
      logError('Error fetching users in admin panel:', error);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}

export default withAuth(handler);