import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import type { AuthenticatedRequest } from '@/types/api'; // Import the shared type
import { deriveAdminUserStatus } from '@/utils/adminStatus';
import { getRequestIp, logActionStrict } from '@/utils/auditLogger';
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
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.MANAGE_USERS],
  rateLimitProfile: 'admin',
  querySchema: AdminUsersQuerySchema,
});

async function handler(
  req: AuthenticatedRequest,
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

    if (id) {
      // A non-numeric id matches nobody instead of failing the query.
      const parsedId = Number.parseInt(String(id), 10);
      whereClause.id = Number.isSafeInteger(parsedId) ? parsedId : -1;
    }
    if (username)
      whereClause.display_name = {
        contains: username,
        mode: 'insensitive',
      };
    if (email) whereClause.email = { contains: email, mode: 'insensitive' };

    const activeEra = await prisma.era.findFirst({
      where: { endDate: null },
      orderBy: { startDate: 'desc' },
      select: { id: true },
    });
    const activeEraId = activeEra?.id ?? null;

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

    const selectClause = {
      id: true,
      display_name: true,
      email: true,
      last_active: true,
      currentEraId: true,
      statusHistories: {
        where: { end_date: null },
        orderBy: { start_date: 'desc' as const },
        take: 1,
        select: {
          status: true,
        },
      },
      permissions: {
        where: { revokedAt: null },
        select: {
          type: true,
        },
      },
      staffRoleAssignments: {
        where: { revokedAt: null },
        select: { role: true },
      },
    };

    const users = await prisma.users.findMany({
      where: whereClause,
      select: selectClause,
      orderBy: orderByClause,
      ...(status ? {} : { take, skip }),
    });

    const formattedUsers = users
      .map((user) => ({
        id: user.id.toString(),
        username: user.display_name,
        email: user.email,
        status: deriveAdminUserStatus({
          latestStatus: user.statusHistories?.[0]?.status,
          lastActive: user.last_active,
          currentEraId: user.currentEraId,
          activeEraId,
        }),
        lastActive: user.last_active,
        permissions: user.permissions.map((p) => p.type),
        staffRoles: user.staffRoleAssignments.map((a) => a.role),
      }))
      .filter((user) => !status || user.status === status);

    const pageUsers = status
      ? formattedUsers.slice(skip, skip + take)
      : formattedUsers;
    const total = status
      ? formattedUsers.length
      : await prisma.users.count({ where: whereClause });

    // The list carries account emails, so it is never returned off the record.
    // The email search term itself is not copied into the audit log.
    await logActionStrict({
      userId: Number(req.session?.user?.id),
      action: 'ADMIN_USERS_LIST_READ',
      ip: getRequestIp(req),
      details: {
        filters: {
          id: id ?? null,
          username: username ?? null,
          emailFilter: Boolean(email),
          status: status ?? null,
        },
        limit: take,
        offset: skip,
        sort: sortField,
        order: sortOrder,
        resultCount: pageUsers.length,
        total,
        userIds: pageUsers.map((user) => Number(user.id)),
      },
    });

    res.status(200).json({ users: pageUsers, total });
  } catch (error) {
    logError('Error fetching users in admin panel:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
}

export default guardedHandler(handler);
