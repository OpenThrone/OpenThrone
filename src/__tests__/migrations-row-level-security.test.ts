import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'bun:test';

const MIGRATIONS_DIR = path.join(process.cwd(), 'prisma/migrations');
const RLS_MIGRATION = '20261029120000_enable_row_level_security';

const CREATE_TABLE =
  /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:"?public"?\.)?"?([A-Za-z0-9_]+)"?/gi;
const ENABLE_RLS =
  /ALTER TABLE\s+(?:ONLY\s+)?(?:"?public"?\.)?"?([A-Za-z0-9_]+)"?\s+ENABLE ROW LEVEL SECURITY/gi;

const namesIn = (sql: string, pattern: RegExp) =>
  [...sql.matchAll(pattern)].map((match) => match[1]);

describe('migrations keep row level security on every table', () => {
  const migrations = readdirSync(MIGRATIONS_DIR)
    .filter((name) => /^\d{14}_/.test(name))
    .sort();

  it('includes the migration that enables RLS on existing tables', () => {
    expect(migrations).toContain(RLS_MIGRATION);
  });

  it('enables RLS on each table created after that migration', () => {
    const later = migrations.filter((name) => name > RLS_MIGRATION);
    const created = new Set<string>();
    const enabled = new Set<string>();
    for (const name of later) {
      const sql = readFileSync(
        path.join(MIGRATIONS_DIR, name, 'migration.sql'),
        'utf8',
      );
      namesIn(sql, CREATE_TABLE).forEach((table) => created.add(table));
      namesIn(sql, ENABLE_RLS).forEach((table) => enabled.add(table));
    }
    const missing = [...created].filter((table) => !enabled.has(table));
    expect(missing).toEqual([]);
  });

  it('recognises the statements Prisma generates', () => {
    const sql = `CREATE TABLE "NewThing" ("id" SERIAL NOT NULL);
ALTER TABLE "NewThing" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.other_thing (id int);`;
    expect(namesIn(sql, CREATE_TABLE)).toEqual(['NewThing', 'other_thing']);
    expect(namesIn(sql, ENABLE_RLS)).toEqual(['NewThing']);
  });

  it('the LoginEvent kind migration adds no table, so none needs RLS', () => {
    const name = '20261112130000_login_event_kind';
    expect(migrations).toContain(name);
    const sql = readFileSync(
      path.join(MIGRATIONS_DIR, name, 'migration.sql'),
      'utf8',
    );
    expect(namesIn(sql, CREATE_TABLE)).toEqual([]);
  });
});
