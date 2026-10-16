import {
  isRuntimeSettingKey,
  RUNTIME_SETTING_KEYS,
  RUNTIME_SETTING_REGISTRY,
} from '@/constants/runtimeSettings';
import prisma from '@/lib/prisma';
import { invalidateRuntimeConfigCache } from '@/services/RuntimeConfig.service';

/** Encapsulates server setting data access and domain operations. */
export class ServerSettingService {
  static async list() {
    const rows = await prisma.serverSetting.findMany({
      orderBy: { key: 'asc' },
    });
    return rows.map((row) => {
      if (!isRuntimeSettingKey(row.key)) {
        const { value: _redactedValue, ...metadata } = row;
        return { ...metadata, value: undefined, editable: false };
      }
      return { ...row, editable: row.isRuntimeEditable };
    });
  }

  static async listPublic() {
    const rows = await prisma.serverSetting.findMany({
      where: { key: { in: RUNTIME_SETTING_KEYS }, isPublic: true },
    });
    return rows.filter(
      (row) =>
        isRuntimeSettingKey(row.key) &&
        RUNTIME_SETTING_REGISTRY[row.key].isPublic,
    );
  }

  static async get(key: string) {
    return prisma.serverSetting.findUnique({ where: { key } });
  }

  static async upsert(userId: number, key: string, value: unknown) {
    if (!isRuntimeSettingKey(key))
      throw new Error('Setting key is not allowlisted');
    const meta = RUNTIME_SETTING_REGISTRY[key];
    const parsed = meta.schema.parse(value);
    const updated = await prisma.serverSetting.upsert({
      where: { key },
      create: {
        key,
        label: meta.label,
        type: meta.type,
        value: parsed as object,
        isPublic: meta.isPublic,
        isRuntimeEditable: true,
        updatedByUserId: userId,
      },
      update: {
        label: meta.label,
        type: meta.type,
        value: parsed as object,
        isPublic: meta.isPublic,
        isRuntimeEditable: true,
        updatedByUserId: userId,
      },
    });
    invalidateRuntimeConfigCache();
    return updated;
  }

  static async delete(key: string) {
    if (!isRuntimeSettingKey(key))
      throw new Error('Setting key is not allowlisted');
    const deleted = await prisma.serverSetting.delete({ where: { key } });
    invalidateRuntimeConfigCache();
    return deleted;
  }
}
