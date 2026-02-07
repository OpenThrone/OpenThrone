import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { withApiGuard } from '@/middleware/apiGuard';
import type { AuthenticatedRequest } from '@/types/api'; // Import the shared type
import { logError } from '@/utils/logger';

const AdminUsersQuerySchema = z.object({
  id: z.string().optional(),
  username: z.string().optional(),
  email: z.string().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional().default(10),
  offset: z.coerce.number().int().nonnegative().optional().default(0),
  sort: z.string().optional().default('id'),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
});

const guardedHandler = withApiGuard({
  methods: ['GET'],
  authMode: 'admin',
  rateLimitProfile: 'admin',
  querySchema: AdminUsersQuerySchema,
});

async function handler(
  _req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { query: z.infer<typeof AdminUsersQuerySchema> },
) {
  try {
    // Extract filter, pagination, and sorting parameters from query
    const { id, username, email, status, limit, offset, sort, order } =
      context.query;

    const take = limit;
    const skip = offset;
    const sortField = sort;
    const sortOrder = order;

    // Build where clause based on provided filters
    const whereClause: any = {};

    if (id) whereClause.id = parseInt(id, 10);
    if (username)
      whereClause.display_name = {
        contains: username,
        mode: 'insensitive',
      };
    if (email) whereClause.email = { contains: email, mode: 'insensitive' };

    // Handle status filter if provided
    if (status) {
      whereClause.statusHistories = {
        some: {
          status,
          end_date: null, // Current status has no end date
        },
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
      orderByClause.id = 'asc';
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
              status: true,
            },
          },
          permissions: {
            select: {
              type: true,
            },
          },
        },
        orderBy: orderByClause,
        take,
        skip,
      }),
      prisma.users.count({
        where: whereClause,
      }),
    ]);

    // Format the response
    const formattedUsers = users.map((user) => ({
      id: user.id.toString(),
      username: user.display_name,
      email: user.email,
      status: user.statusHistories[0]?.status || 'ACTIVE', // Default to ACTIVE if no status history
      lastActive: user.last_active,
      permissions: user.permissions.map((p) => p.type),
    }));

    res.status(200).json({ users: formattedUsers, total });
  } catch (error) {
    logError('Error fetching users in admin panel:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
}

export default guardedHandler(handler);
