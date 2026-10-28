import prisma from '@/lib/prisma';
import { invalidateRuntimeConfigCache } from '@/services/RuntimeConfig.service';

/** Empties every table in the throwaway database (keeps migration history). */
export const resetDatabase = async () => {
  await prisma.$executeRawUnsafe(`
    DO $$ DECLARE t text; BEGIN
      FOR t IN SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
      LOOP EXECUTE format('TRUNCATE TABLE %I RESTART IDENTITY CASCADE', t); END LOOP;
    END $$;`);
};

/** Upserts one boolean server setting and drops the runtime config cache. */
export const setRuntimeSwitch = async (key: string, value: boolean) => {
  await prisma.serverSetting.upsert({
    where: { key },
    create: { key, label: key, type: 'BOOLEAN', value, isPublic: true },
    update: { value },
  });
  invalidateRuntimeConfigCache();
};

/**
 * Turns the dungeon (SHOW_DUNGEON) on or off. It is off by default, and while
 * it is off battles take no captives, so capture tests switch it on.
 */
export const setShowDungeon = (value: boolean) =>
  setRuntimeSwitch('SHOW_DUNGEON', value);

/** Desertion (ENABLE_DESERTION) is off by default; desertion tests switch it on. */
export const setDesertion = (value: boolean) =>
  setRuntimeSwitch('ENABLE_DESERTION', value);
