import { Client } from 'pg';

import {
  buildDefaultUserUpdate,
  ERA_DEFAULT_BATTLE_UPGRADES,
  ERA_DEFAULT_BONUS_POINTS,
  ERA_DEFAULT_ITEMS,
  ERA_DEFAULT_STRUCTURE_UPGRADES,
  ERA_DEFAULT_UNITS,
} from '@/services/UserDefaults.service';
import { logInfo } from '@/utils/logger';
import { getLevelFromXP } from '@/utils/utilities';

export type LegacyRow = Record<string, unknown>;

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
const GAMEPLAY_FIELDS = [
  'experience',
  'gold',
  'gold_in_bank',
  'rank',
  'offense',
  'defense',
  'spy',
  'sentry',
  'fort_level',
  'fort_hitpoints',
  'house_level',
  'economy_level',
  'attack_turns',
  'stats',
  'units',
  'mercenaries',
  'items',
  'battle_upgrades',
  'structure_upgrades',
  'bonus_points',
  'killing_str',
  'defense_str',
  'spying_str',
  'sentry_str',
];

/** Keep the original gameplay values, including exact bigint strings. */
export function buildLegacySnapshot(user: LegacyRow) {
  return Object.fromEntries(
    GAMEPLAY_FIELDS.filter((key) => key in user).map((key) => [key, user[key]]),
  );
}

export function validateImportTarget(source: string, target: string) {
  const from = new URL(source);
  const to = new URL(target);
  if (
    to.hostname.includes('supabase') ||
    !/^\/otdev_(era_candidate_\d+|stage)$/.test(to.pathname)
  ) {
    throw new Error(
      'Target must be otdev_stage or a named otdev_era_candidate rehearsal database.',
    );
  }
  if (
    from.hostname === to.hostname &&
    from.port === to.port &&
    from.pathname === to.pathname
  ) {
    throw new Error('Source and target must be different databases.');
  }
}

async function columns(client: Client) {
  return (
    await client.query(`SELECT table_name, column_name, data_type
    FROM information_schema.columns WHERE table_schema='public'
    ORDER BY table_name, ordinal_position`)
  ).rows as {
    table_name: string;
    column_name: string;
    data_type: string;
  }[];
}

async function insertRows(
  client: Client,
  table: string,
  names: string[],
  rows: LegacyRow[],
) {
  for (let offset = 0; offset < rows.length; offset += 500) {
    const fields = names.map(quote).join(', ');
    await client.query(
      `INSERT INTO public.${quote(table)} (${fields})
      SELECT ${fields} FROM json_populate_recordset(NULL::public.${quote(table)}, $1::json)`,
      [JSON.stringify(rows.slice(offset, offset + 500))],
    );
  }
}

/** Import into an EMPTY, migrated target. Schema reset and backups are separate operations. */
export async function importLegacyEra(
  sourceUrl: string,
  targetUrl: string,
  keepAllianceGold = false,
) {
  validateImportTarget(sourceUrl, targetUrl);
  const source = new Client({ connectionString: sourceUrl });
  const target = new Client({ connectionString: targetUrl });
  await source.connect();
  try {
    await target.connect();
    await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await target.query('BEGIN');
    await target.query('SELECT pg_advisory_xact_lock(76319003)');
    const targetColumns = await columns(target);
    const targetTables = [...new Set(targetColumns.map((c) => c.table_name))];
    for (const table of targetTables.filter(
      (t) => t !== '_prisma_migrations',
    )) {
      if (
        (await target.query(`SELECT 1 FROM public.${quote(table)} LIMIT 1`))
          .rowCount
      ) {
        throw new Error(`Target is not empty: ${table}`);
      }
    }
    // Defer FK checks for circular/self-referencing historical records, then restore constraints.
    const constraints = (
      await target.query(`SELECT conname, conrelid::regclass::text AS relation,
      condeferrable, condeferred FROM pg_constraint
      WHERE contype='f' AND connamespace='public'::regnamespace`)
    ).rows;
    for (const fk of constraints) {
      await target.query(
        `ALTER TABLE ${fk.relation} ALTER CONSTRAINT ${quote(fk.conname)} DEFERRABLE INITIALLY DEFERRED`,
      );
    }
    const sourceColumns = await columns(source);
    const sourceTables = [...new Set(sourceColumns.map((c) => c.table_name))];
    const data: Record<string, LegacyRow[]> = {};
    for (const table of sourceTables) {
      // PostgreSQL JSON bigint numbers otherwise lose precision during JSON.parse.
      const bigints = sourceColumns.filter(
        (c) => c.table_name === table && c.data_type === 'bigint',
      );
      const overrides = bigints.length
        ? ` || jsonb_build_object(${bigints
            .map((c) => `'${c.column_name}', t.${quote(c.column_name)}::text`)
            .join(',')})`
        : '';
      data[table] = (
        await source.query(
          `SELECT (to_jsonb(t)${overrides})::text AS row FROM public.${quote(table)} t`,
        )
      ).rows.map((r) => JSON.parse(r.row));
    }
    if (!data.users?.length || data.Era?.length)
      throw new Error('Expected a populated pre-era source.');
    const boundary = (
      await source.query('SELECT transaction_timestamp() AS date')
    ).rows[0].date;
    const dates = [
      ...data.users.map((u) => u.created_at),
      ...(data.attack_log ?? []).map((r) => r.timestamp),
      ...(data.recruit_history ?? []).map((r) => r.timestamp),
    ]
      .filter(Boolean)
      .map((d) => new Date(String(d)).getTime());
    const start = new Date(Math.min(...dates));
    const legacyEra = (
      await target.query(
        `INSERT INTO "Era" (name,"startDate","endDate")
      VALUES ('Era 1: Legacy Production',$1,$2) RETURNING id`,
        [start, boundary],
      )
    ).rows[0].id;
    const newEra = (
      await target.query(
        `INSERT INTO "Era" (name,"startDate")
      VALUES ('Era 2: A New Age',$1) RETURNING id`,
        [boundary],
      )
    ).rows[0].id;
    const counts: Record<string, number> = {};
    const skipped = ['_prisma_migrations', 'PermissionGrant'];
    for (const table of sourceTables.filter(
      (t) => targetTables.includes(t) && !skipped.includes(t),
    )) {
      const names = sourceColumns
        .filter(
          (c) =>
            c.table_name === table &&
            targetColumns.some(
              (tc) =>
                tc.table_name === table && tc.column_name === c.column_name,
            ),
        )
        .map((c) => c.column_name);
      await insertRows(target, table, names, data[table]);
      counts[table] = data[table].length;
      logInfo(`Imported ${table}: ${counts[table]}`);
    }
    // Preserve the one-off old normalized rows too, without mixing them into the new era army.
    for (const user of data.users) {
      const oldLevel = getLevelFromXP(Number(user.experience ?? 0));
      const logs = (data.attack_log ?? []).filter((r) => r.type === 'attack');
      const achievements = {
        maxLevelReached: oldLevel,
        totalAttacksWon: logs.filter(
          (r) => r.attacker_id === user.id && r.winner === user.id,
        ).length,
        totalDefendsWon: logs.filter(
          (r) => r.defender_id === user.id && r.winner === user.id,
        ).length,
      };
      const snapshot = {
        ...buildLegacySnapshot(user),
        legacyNormalized: Object.fromEntries(
          [
            'user_units',
            'user_items',
            'user_battle_upgrades',
            'user_structure_upgrades',
          ].map((t) => [
            t,
            (data[t] ?? []).filter((r) => r.userId === user.id),
          ]),
        ),
      };
      await insertRows(
        target,
        'UserEra',
        [
          'userId',
          'eraId',
          'levelAtStart',
          'levelAtEnd',
          'unitsAtStart',
          'achievements',
          'rankAtEnd',
          'goldAtEnd',
          'goldInBankAtEnd',
          'offenseAtEnd',
          'defenseAtEnd',
          'spyAtEnd',
          'sentryAtEnd',
          'fortLevelAtEnd',
          'houseLevelAtEnd',
          'economyLevelAtEnd',
          'snapshotAtEnd',
        ],
        [
          {
            userId: user.id,
            eraId: legacyEra,
            levelAtStart: 1,
            levelAtEnd: oldLevel,
            unitsAtStart: [],
            achievements,
            rankAtEnd: user.rank,
            goldAtEnd: user.gold,
            goldInBankAtEnd: user.gold_in_bank,
            offenseAtEnd: user.offense,
            defenseAtEnd: user.defense,
            spyAtEnd: user.spy,
            sentryAtEnd: user.sentry,
            fortLevelAtEnd: user.fort_level,
            houseLevelAtEnd: user.house_level,
            economyLevelAtEnd: user.economy_level,
            snapshotAtEnd: snapshot,
          },
        ],
      );
      const defaults = {
        ...buildDefaultUserUpdate(),
        currentEraId: newEra,
        achievements,
        rank: 0,
        stats: {},
        killing_str: 1,
        defense_str: 1,
        spying_str: 1,
        sentry_str: 1,
        units: null,
        items: null,
        battle_upgrades: null,
        structure_upgrades: null,
        bonus_points: null,
        colorScheme: user.colorScheme ?? user.race,
      };
      const names = Object.keys(defaults);
      await target.query(
        `UPDATE users SET ${names.map((n, i) => `${quote(n)}=$${i + 1}`).join(',')}
        WHERE id=$${names.length + 1}`,
        [
          ...Object.values(defaults).map((v) =>
            v !== null && typeof v === 'object' ? JSON.stringify(v) : v,
          ),
          user.id,
        ],
      );
      for (const [table, rows] of [
        ['UserUnit', ERA_DEFAULT_UNITS],
        ['UserItem', ERA_DEFAULT_ITEMS],
        ['UserStructureUpgrade', ERA_DEFAULT_STRUCTURE_UPGRADES],
        ['UserBattleUpgrade', ERA_DEFAULT_BATTLE_UPGRADES],
        ['UserBonusPoints', ERA_DEFAULT_BONUS_POINTS],
      ] as const) {
        await insertRows(
          target,
          table,
          ['userId', ...Object.keys(rows[0])],
          rows.map((r) => ({ ...r, userId: user.id })),
        );
      }
    }
    for (const grant of data.PermissionGrant ?? []) {
      if (!['ADMINISTRATOR', 'MODERATOR'].includes(String(grant.type))) {
        throw new Error(`Unmapped legacy permission: ${grant.type}`);
      }
      await insertRows(
        target,
        'StaffRoleAssignment',
        ['userId', 'role', 'createdAt', 'note'],
        [
          {
            userId: grant.user_id,
            role: grant.type,
            createdAt: grant.created_at,
            note: 'Preserved from legacy production PermissionGrant',
          },
        ],
      );
    }
    if (!keepAllianceGold)
      await target.query('UPDATE alliances SET gold_in_bank=0');
    // Validate every copied table and every snapshot before committing.
    for (const [table, count] of Object.entries(counts)) {
      const actual = Number(
        (await target.query(`SELECT count(*) FROM ${quote(table)}`)).rows[0]
          .count,
      );
      if (actual !== count) throw new Error(`Count mismatch: ${table}`);
    }
    const archived = Number(
      (await target.query('SELECT count(*) FROM "UserEra"')).rows[0].count,
    );
    if (archived !== data.users.length)
      throw new Error('Incomplete era archive');
    await target.query('SET CONSTRAINTS ALL IMMEDIATE');
    for (const fk of constraints) {
      await target.query(
        `ALTER TABLE ${fk.relation} ALTER CONSTRAINT ${quote(fk.conname)} ${
          fk.condeferrable
            ? `DEFERRABLE INITIALLY ${fk.condeferred ? 'DEFERRED' : 'IMMEDIATE'}`
            : 'NOT DEFERRABLE'
        }`,
      );
    }
    for (const c of targetColumns) {
      const seq = (
        await target.query('SELECT pg_get_serial_sequence($1,$2) AS name', [
          `public.${quote(c.table_name)}`,
          c.column_name,
        ])
      ).rows[0].name;
      if (seq)
        await target.query(
          `SELECT setval($1, COALESCE((SELECT max(${quote(c.column_name)})
        FROM ${quote(c.table_name)}),1), EXISTS(SELECT 1 FROM ${quote(c.table_name)}))`,
          [seq],
        );
    }
    await target.query('COMMIT');
    logInfo(
      JSON.stringify(
        { users: archived, legacyEra, newEra, start, boundary, counts },
        null,
        2,
      ),
    );
    return { users: archived, legacyEra, newEra };
  } catch (error) {
    await target.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await source.query('ROLLBACK').catch(() => {});
    await Promise.all([source.end(), target.end()]);
  }
}

if (import.meta.main) {
  const source = process.env.LEGACY_SOURCE_URL;
  const target = process.env.LEGACY_TARGET_URL;
  if (!source || !target)
    throw new Error('Set LEGACY_SOURCE_URL and LEGACY_TARGET_URL explicitly.');
  await importLegacyEra(
    source,
    target,
    process.argv.includes('--keep-alliance-gold'),
  );
}
