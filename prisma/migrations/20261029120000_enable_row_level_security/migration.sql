-- Production runs on Supabase, which grants its public Data API roles (anon,
-- authenticated) full access to every table in `public`. Row level security
-- with no policies denies those roles. The app is unaffected: it connects as
-- the table owner (alpha, local) or a BYPASSRLS role (Supabase `postgres`),
-- and RLS is not FORCEd. Production was switched on by hand on 2026-10-28;
-- this records it and covers every other database.
--
-- Every later migration that creates a table must enable RLS on it too
-- (src/__tests__/migrations-row-level-security.test.ts enforces this).

DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
  END LOOP;
END $$;

-- Legacy trigger helper restored from the pre-era production dump; it exists
-- only on databases built from it. Pin its search_path (Supabase lint 0011).
DO $$
BEGIN
  IF to_regprocedure('public.update_updated_at_column()') IS NOT NULL THEN
    ALTER FUNCTION public.update_updated_at_column() SET search_path = '';
  END IF;
END $$;
