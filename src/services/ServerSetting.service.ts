import { z } from 'zod';

import prisma from '@/lib/prisma';

const SettingSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(['STRING', 'NUMBER', 'BOOLEAN', 'JSON']),
  value: z.unknown(),
  isPublic: z.boolean().default(false),
  isRuntimeEditable: z.boolean().default(true),
});

/** Encapsulates server setting data access and domain operations. */
export class ServerSettingService {
  static async list(publicOnly = false) {
    return prisma.serverSetting.findMany({
      where: publicOnly ? { isPublic: true } : undefined,
      orderBy: { key: 'asc' },
    });
  }

  static async get(key: string) {
    return prisma.serverSetting.findUnique({ where: { key } });
  }

  static async upsert(userId: number, data: z.infer<typeof SettingSchema>) {
    const validated = SettingSchema.parse(data);
    return prisma.serverSetting.upsert({
      where: { key: validated.key },
      create: {
        ...validated,
        value: validated.value as object,
        updatedByUserId: userId,
      },
      update: {
        ...validated,
        value: validated.value as object,
        updatedByUserId: userId,
      },
    });
  }

  static async delete(key: string) {
    return prisma.serverSetting.delete({ where: { key } });
  }
}
