import { describe, expect, it } from 'bun:test';

import {
  buildChildEnv,
  ENV_REGISTRY,
  type EnvName,
  formatApplySummary,
  formatStatusSummary,
  MIGRATE_COMMANDS,
  parseArgs,
  resolveConnectionString,
  summarizeMigrateApply,
  summarizeMigrateStatus,
  usage,
} from './db-migrate';

const DEV_CONNECTION = 'postgresql://ops_user:ops-secret@127.0.0.1:5432/ot_dev';
const STAGING_CONNECTION =
  'postgresql://ops_user:staging-secret@192.0.2.10:5432/otdev_stage';
const ENV_NAMES = Object.keys(ENV_REGISTRY) as EnvName[];

describe('environment registry', () => {
  it('maps exactly the documented environments to variable names (names only)', () => {
    expect(ENV_NAMES.sort()).toEqual([
      'dev',
      'preview',
      'production',
      'staging',
    ]);
    for (const varName of Object.values(ENV_REGISTRY)) {
      expect(varName).toMatch(/^[A-Z][A-Z0-9_]*$/);
      expect(varName).not.toContain('://');
    }
    expect(ENV_REGISTRY.dev).toBe('POSTGRES_URL_NON_POOLING');
  });

  it('resolves every --env name through the registry for both subcommands', () => {
    for (const envName of ENV_NAMES) {
      for (const command of MIGRATE_COMMANDS) {
        const argv = [command, '--env', envName];
        if (envName === 'production') argv.push('--confirm-production');
        const parsed = parseArgs(argv);
        expect(parsed.ok).toBe(true);
        if (parsed.ok) {
          expect(parsed.invocation.command).toBe(command);
          expect(parsed.invocation.envName).toBe(envName);
          expect(parsed.invocation.connectionEnvVar).toBe(
            ENV_REGISTRY[envName],
          );
        }
      }
    }
  });

  it('refuses unknown environment names and names the valid ones', () => {
    const parsed = parseArgs(['apply', '--env', 'prod']);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.message).toContain('Unknown environment: prod');
      expect(parsed.message).toContain('dev, staging, preview, production');
      expect(parsed.showUsage).toBe(true);
    }
  });
});

describe('production confirmation guard', () => {
  it('refuses --env production without --confirm-production for every subcommand', () => {
    for (const command of MIGRATE_COMMANDS) {
      const parsed = parseArgs([command, '--env', 'production']);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) {
        expect(parsed.message).toContain('--confirm-production');
      }
    }
  });

  it('allows production only with --confirm-production', () => {
    const parsed = parseArgs([
      'apply',
      '--env',
      'production',
      '--confirm-production',
    ]);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.invocation.envName).toBe('production');
      expect(parsed.invocation.connectionEnvVar).toBe(
        'PRODUCTION_POSTGRES_URL_NON_POOLING',
      );
    }
  });

  it('does not require confirmation outside production', () => {
    for (const envName of ['dev', 'staging', 'preview'] as EnvName[]) {
      expect(parseArgs(['apply', '--env', envName]).ok).toBe(true);
    }
  });
});

describe('connection variable guard', () => {
  it('refuses unset and empty variables, naming the variable', () => {
    const refusals = [
      resolveConnectionString('dev', {}),
      resolveConnectionString('dev', { POSTGRES_URL_NON_POOLING: '' }),
      resolveConnectionString('dev', { POSTGRES_URL_NON_POOLING: '   ' }),
      resolveConnectionString('staging', {
        STAGING_POSTGRES_URL_NON_POOLING: undefined,
      }),
    ];
    for (const refusal of refusals) {
      expect(refusal.ok).toBe(false);
      if (!refusal.ok) {
        expect(refusal.message).toMatch(/\$\w+_URL_NON_POOLING is unset/);
        expect(refusal.message).toContain('Refusing to run');
      }
    }
  });

  it('returns the selected connection without ever echoing its value', () => {
    const resolved = resolveConnectionString('staging', {
      STAGING_POSTGRES_URL_NON_POOLING: STAGING_CONNECTION,
    });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.connectionEnvVar).toBe(
        'STAGING_POSTGRES_URL_NON_POOLING',
      );
      expect(resolved.connectionString).toBe(STAGING_CONNECTION);
    }

    const refused = resolveConnectionString('dev', {
      POSTGRES_URL_NON_POOLING: '   ',
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.message).toContain('POSTGRES_URL_NON_POOLING');
      expect(refused.message).not.toContain('ops-secret');
      expect(refused.message).not.toContain('postgresql://');
    }
  });

  it('trims accidental surrounding whitespace from the exported value', () => {
    const resolved = resolveConnectionString('dev', {
      POSTGRES_URL_NON_POOLING: `  ${DEV_CONNECTION}  `,
    });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect(resolved.connectionString).toBe(DEV_CONNECTION);
  });
});

describe('subcommand and flag handling', () => {
  it('refuses unknown subcommands with usage text', () => {
    for (const argv of [['deploy'], ['applyx'], []]) {
      const parsed = parseArgs(argv);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) {
        expect(parsed.message).toMatch(
          /Unknown subcommand|subcommand is required/,
        );
        expect(parsed.showUsage).toBe(true);
      }
    }
  });

  it('refuses a missing --env or a missing --env value', () => {
    for (const argv of [
      ['status'],
      ['apply'],
      ['status', '--env'],
      ['status', '--env', '--confirm-production'],
    ]) {
      const parsed = parseArgs(argv);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) {
        expect(parsed.message).toContain('--env');
        expect(parsed.showUsage).toBe(true);
      }
    }
  });

  it('refuses unknown options with usage text', () => {
    const parsed = parseArgs(['apply', '--env', 'dev', '--force']);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.message).toContain('Unknown option: --force');
      expect(parsed.showUsage).toBe(true);
    }
  });

  it('documents the registry, the production guard and the never-echo promise', () => {
    const help = usage();
    expect(help).toContain('status');
    expect(help).toContain('apply');
    expect(help).toContain('--confirm-production');
    for (const varName of Object.values(ENV_REGISTRY)) {
      expect(help).toContain(varName);
    }
  });
});

describe('child environment pinning', () => {
  it('pins the selected connection to the selected variable and to prisma.config.ts', () => {
    const childEnv = buildChildEnv(
      {
        PATH: '/usr/bin',
        PREVIEW_POSTGRES_URL_NON_POOLING: STAGING_CONNECTION,
      },
      {
        connectionEnvVar: 'PREVIEW_POSTGRES_URL_NON_POOLING',
        connectionString: STAGING_CONNECTION,
      },
    );
    expect(childEnv.PREVIEW_POSTGRES_URL_NON_POOLING).toBe(STAGING_CONNECTION);
    // prisma.config.ts reads POSTGRES_URL_NON_POOLING; dotenv does not
    // override inherited variables, so this pins the CLI's target database.
    expect(childEnv.POSTGRES_URL_NON_POOLING).toBe(STAGING_CONNECTION);
    expect(childEnv.PATH).toBe('/usr/bin');
  });
});

describe('prisma output summaries', () => {
  // Fixtures mirror the templates in prisma 7.8's migrate status/deploy
  // output, including this repo's irregular migration names (e.g. 0_init).
  const STATUS_BEHIND = [
    '2 migrations found in prisma/migrations',
    '',
    'Following migrations have not yet been applied:',
    '202408262159_add_stats_to_users',
    '0_init',
    '',
    'To apply migrations in production run prisma migrate deploy.',
  ].join('\n');

  const APPLY_OUTPUT = [
    '2 migrations found in prisma/migrations',
    '',
    'The following migration(s) have been applied:',
    '',
    'migrations/',
    '  └─ 202408262159_add_stats_to_users/',
    '    └─ migration.sql',
    '  └─ 0_init/',
    '    └─ migration.sql',
    '',
    'All migrations have been successfully applied.',
  ].join('\n');

  it('reports found, pending and up-to-date state from migrate status output', () => {
    const behind = summarizeMigrateStatus(STATUS_BEHIND);
    expect(behind.found).toBe(2);
    expect(behind.pending).toEqual([
      '202408262159_add_stats_to_users',
      '0_init',
    ]);
    expect(behind.upToDate).toBe(false);

    const current = summarizeMigrateStatus(
      '1 migration found in prisma/migrations\n\nDatabase schema is up to date!',
    );
    expect(current).toEqual({
      found: 1,
      pending: [],
      upToDate: true,
      diverged: false,
      notManaged: false,
    });
  });

  it('flags diverged history and unmanaged databases (stderr diagnostics)', () => {
    const diverged = summarizeMigrateStatus(
      'Your local migration history and the migrations table from your database are different:',
    );
    expect(diverged.diverged).toBe(true);
    const unmanaged = summarizeMigrateStatus(
      'The current database is not managed by Prisma Migrate.',
    );
    expect(unmanaged.notManaged).toBe(true);
    expect(summarizeMigrateStatus('total gibberish').found).toBeNull();
  });

  it('reports applied migration names from migrate deploy output', () => {
    const applied = summarizeMigrateApply(APPLY_OUTPUT);
    expect(applied.applied).toEqual([
      '202408262159_add_stats_to_users',
      '0_init',
    ]);
    expect(applied.nothingToApply).toBe(false);
    expect(formatApplySummary(applied)).toEqual([
      'applied (2): 202408262159_add_stats_to_users, 0_init',
    ]);

    const nothing = summarizeMigrateApply('No pending migrations to apply.');
    expect(nothing.applied).toEqual([]);
    expect(nothing.nothingToApply).toBe(true);
    expect(formatApplySummary(nothing)).toEqual([
      'no migrations were applied by this run',
    ]);
  });

  it('ignores ANSI-colored names and the nested migration.sql line', () => {
    const colored = summarizeMigrateApply(
      [
        'The following migration(s) have been applied:',
        '',
        'migrations/',
        '  └─ \x1B[1m0_init\x1B[22m/',
        '    └─ migration.sql',
      ].join('\n'),
    );
    expect(colored.applied).toEqual(['0_init']);
  });

  it('renders status summaries including warnings', () => {
    const lines = formatStatusSummary({
      found: 3,
      pending: ['0_init'],
      upToDate: false,
      diverged: true,
      notManaged: false,
    });
    expect(lines[0]).toBe('migrations found in prisma/migrations: 3');
    expect(lines.some((line) => line.startsWith('pending (1): 0_init'))).toBe(
      true,
    );
    expect(lines.some((line) => line.includes('diverge'))).toBe(true);
  });
});
