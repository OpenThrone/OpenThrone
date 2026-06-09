import { z } from 'zod';

import prisma from '@/lib/prisma';
import { GameEventStatus } from '@/lib/prisma-exports';

const CreateEventSchema = z.object({
  key: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  type: z.string(),
  startsAt: z.string().transform((v) => new Date(v)),
  endsAt: z.string().transform((v) => new Date(v)),
  config: z.record(z.unknown()).default({}),
});

/** Encapsulates game event data access and domain operations. */
export class GameEventService {
  static async list(filters?: { status?: GameEventStatus }) {
    return prisma.gameEvent.findMany({
      where: filters?.status ? { status: filters.status } : undefined,
      include: {
        createdBy: { select: { id: true, display_name: true } },
        updatedBy: { select: { id: true, display_name: true } },
      },
      orderBy: { startsAt: 'desc' },
    });
  }

  static async create(userId: number, data: z.infer<typeof CreateEventSchema>) {
    const validated = CreateEventSchema.parse(data);
    return prisma.gameEvent.create({
      data: {
        ...validated,
        status: 'DRAFT',
        createdByUserId: userId,
      },
    });
  }

  static async update(
    userId: number,
    id: number,
    data: Record<string, unknown>,
  ) {
    return prisma.gameEvent.update({
      where: { id },
      data: { ...data, updatedByUserId: userId },
    });
  }

  static async activate(userId: number, id: number) {
    return prisma.gameEvent.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        activatedAt: new Date(),
        updatedByUserId: userId,
      },
    });
  }

  static async deactivate(userId: number, id: number) {
    return prisma.gameEvent.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        deactivatedAt: new Date(),
        updatedByUserId: userId,
      },
    });
  }

  static async delete(id: number) {
    return prisma.gameEvent.delete({ where: { id } });
  }
}
