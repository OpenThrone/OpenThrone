import prisma from '@/lib/prisma';

export class AnnouncementService {
  static async list(filters?: { isActive?: boolean }) {
    return prisma.announcement.findMany({
      where: filters?.isActive ? { isActive: true } : undefined,
      include: {
        createdBy: { select: { id: true, display_name: true } },
        updatedBy: { select: { id: true, display_name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async getActiveBanners() {
    const now = new Date();
    return prisma.announcement.findMany({
      where: {
        isActive: true,
        isBanner: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async create(
    userId: number,
    data: {
      title?: string;
      body?: string;
      severity?: string;
      isBanner?: boolean;
      isActive?: boolean;
      dismissible?: boolean;
      startsAt?: Date;
      endsAt?: Date;
      linkUrl?: string;
    },
  ) {
    if (!data.title || !data.body) {
      throw new Error('Title and body are required');
    }
    return prisma.announcement.create({
      data: { ...data, createdByUserId: userId },
    });
  }

  static async update(
    userId: number,
    id: number,
    data: Record<string, unknown>,
  ) {
    return prisma.announcement.update({
      where: { id },
      data: { ...data, updatedByUserId: userId },
    });
  }

  static async delete(id: number) {
    return prisma.announcement.delete({ where: { id } });
  }
}
