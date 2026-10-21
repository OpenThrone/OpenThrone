import prisma from '@/lib/prisma';

/** Empties every table in the throwaway database (keeps migration history). */
export const resetDatabase = async () => {
  await prisma.$executeRawUnsafe(`
    DO $$ DECLARE t text; BEGIN
      FOR t IN SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
      LOOP EXECUTE format('TRUNCATE TABLE %I RESTART IDENTITY CASCADE', t); END LOOP;
    END $$;`);
};
