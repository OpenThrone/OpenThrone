/**
 * Operator-run guarded Prisma migration CLI (issue #26, part 1 of 2).
 *
 * Schema migrations are a controlled release operation: run this script once
 * per release from an operator shell — never per request or instance startup
 * (deploy order per docs/operations.md: apply migrations before new code).
 *
 *   bun scripts/db-migrate.ts status --env staging
 *   bun scripts/db-migrate.ts apply  --env production --confirm-production
 *
 * The registry below maps each environment NAME to the NAME of an environment
 * variable holding that environment's direct (non-pooled) PostgreSQL
 * connection string. Variable names only — values live in the operator's
 * shell or secret store, never in this file, and are never printed. Migrations
 * use the non-pooled URL because the Prisma CLI (prisma.config.ts) reads
 * POSTGRES_URL_NON_POOLING and DDL wants a direct session: Hyperdrive and the
 * PgBouncer hop on the LAN path both pool at the protocol level.
 *
 * Guards: `--env production` additionally requires `--confirm-production`;
 * an unset/empty connection variable is refused (naming the variable);
 * unknown subcommands or environment names are refused with usage text. The
 * connection string reaches the child Prisma process through its environment
 * only — never through argv, output, or error messages.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Environments → the env var NAME holding their direct connection string. */
export const ENV_REGISTRY = {
  /** Local developer database (.env; the same var prisma.config.ts reads). */
  dev: 'POSTGRES_URL_NON_POOLING',
  /** db-host staging Postgres (docs/operations.md LAN database path). */
  staging: 'STAGING_POSTGRES_URL_NON_POOLING',
  /** Database behind the preview Worker (currently the staging instance). */
  preview: 'PREVIEW_POSTGRES_URL_NON_POOLING',
  /** Production database. Any command here requires --confirm-production. */
  production: 'PRODUCTION_POSTGRES_URL_NON_POOLING',
} as const;

export type EnvName = keyof typeof ENV_REGISTRY;
export type MigrateCommand = 'status' | 'apply';

export const MIGRATE_COMMANDS = ['status', 'apply'] as const;

export interface MigrationInvocation {
  command: MigrateCommand;
  envName: EnvName;
  /** Name of the environment variable holding the connection string. */
  connectionEnvVar: string;
}

export type ParsedArgs =
  | { ok: true; invocation: MigrationInvocation }
  | { ok: false; message: string; showUsage: boolean };

export type ConnectionResolution =
  | { ok: true; connectionEnvVar: string; connectionString: string }
  | { ok: false; message: string };

export interface MigrationStatusSummary {
  /** Migrations declared in prisma/migrations; null when unparseable. */
  found: number | null;
  pending: string[];
  upToDate: boolean;
  diverged: boolean;
  notManaged: boolean;
}

export interface MigrationApplySummary {
  applied: string[];
  nothingToApply: boolean;
}

/**
 * The Prisma CLI entry shipped with the repo's `prisma` dependency; executed
 * with the running Bun binary so no extra resolver or network call is needed.
 */
const PRISMA_CLI_ENTRY = join(
  import.meta.dir,
  '..',
  'node_modules',
  'prisma',
  'build',
  'index.js',
);

// Markers below mirror Prisma 7.8's migrate status/deploy output templates.
const NO_MIGRATIONS_TEXT = 'No migration found in prisma/migrations';
const MIGRATIONS_FOUND_RE = /^(\d+) migrations? found in prisma\/migrations$/m;
const PENDING_HEADER_RE =
  /^Following migrations? have not yet been applied:\n([\s\S]*?)\n\n/m;
const UP_TO_DATE_MARKER = 'Database schema is up to date!';
const DIVERGED_MARKER =
  'Your local migration history and the migrations table from your database are different';
const NOT_MANAGED_MARKER =
  'The current database is not managed by Prisma Migrate.';
const NOTHING_TO_APPLY_MARKER = 'No pending migrations to apply.';
// `sx` renders each applied migration as "  └─ <name>/" ("    └─ migration.sql"
// sits four spaces deep and has no trailing slash, so it never matches).
const APPLIED_NAME_RE = /^[ ]{2}└─ (.+)\/$/gm;

export function isEnvName(value: string): value is EnvName {
  return Object.prototype.hasOwnProperty.call(ENV_REGISTRY, value);
}

const isMigrateCommand = (value: unknown): value is MigrateCommand =>
  typeof value === 'string' &&
  (MIGRATE_COMMANDS as readonly string[]).includes(value);

export function usage(): string {
  return [
    'Usage: bun scripts/db-migrate.ts <status|apply> --env <name> [--confirm-production]',
    '',
    'Subcommands:',
    '  status  Show applied and pending migrations (wraps prisma migrate status).',
    '          Exits nonzero while migrations are pending (inherited from prisma).',
    '  apply   Apply pending migrations (wraps prisma migrate deploy). Run once',
    '          per release, before deploying new code — never per request/startup.',
    '',
    'Environments (--env reads the connection string from the named variable):',
    ...Object.entries(ENV_REGISTRY).map(
      ([name, varName]) => `  ${name.padEnd(11)} $${varName}`,
    ),
    '',
    'Options:',
    '  --env <name>            Target environment (required).',
    '  --confirm-production    Required in addition to --env for production.',
    '',
    'Connection strings are read from the environment and are never printed.',
  ].join('\n');
}

/** Pure argument parsing and guard decisions (no IO, safe to unit-test). */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const [command, ...flags] = argv;

  if (!isMigrateCommand(command)) {
    return {
      ok: false,
      message: command
        ? `Unknown subcommand: ${command}. Expected: ${MIGRATE_COMMANDS.join(' or ')}.`
        : `A subcommand is required: ${MIGRATE_COMMANDS.join(' or ')}.`,
      showUsage: true,
    };
  }

  let envName: string | undefined;
  let confirmProduction = false;

  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    if (flag === '--env') {
      const value = flags[index + 1];
      index += 1;
      if (!value || value.startsWith('--')) {
        return {
          ok: false,
          message:
            '--env requires an environment name: dev, staging, preview or production.',
          showUsage: true,
        };
      }
      envName = value;
      continue;
    }
    if (flag === '--confirm-production') {
      confirmProduction = true;
      continue;
    }
    return { ok: false, message: `Unknown option: ${flag}`, showUsage: true };
  }

  if (!envName) {
    return {
      ok: false,
      message: '--env is required: dev, staging, preview or production.',
      showUsage: true,
    };
  }

  if (!isEnvName(envName)) {
    return {
      ok: false,
      message: `Unknown environment: ${envName}. Valid environments: ${Object.keys(ENV_REGISTRY).join(', ')}.`,
      showUsage: true,
    };
  }

  if (envName === 'production' && !confirmProduction) {
    return {
      ok: false,
      message:
        'Refusing to run against production without --confirm-production.',
      showUsage: true,
    };
  }

  return {
    ok: true,
    invocation: {
      command,
      envName,
      connectionEnvVar: ENV_REGISTRY[envName],
    },
  };
}

/** Pure guard: the selected variable must be set and non-empty in `env`. */
export function resolveConnectionString(
  envName: EnvName,
  env: Readonly<Record<string, string | undefined>>,
): ConnectionResolution {
  const connectionEnvVar = ENV_REGISTRY[envName];
  const connectionString = env[connectionEnvVar]?.trim() ?? '';
  if (!connectionString) {
    return {
      ok: false,
      message:
        `Refusing to run: $${connectionEnvVar} is unset or empty for --env ${envName}. ` +
        `Export the ${envName} connection string first, for example ` +
        `export ${connectionEnvVar}="<direct postgres URL from your secret store>". ` +
        'Values are never hard-coded or printed by this tool.',
    };
  }
  return { ok: true, connectionEnvVar, connectionString };
}

/**
 * Environment for the child Prisma process. prisma.config.ts reads its
 * datasource from POSTGRES_URL_NON_POOLING and dotenv does not override
 * already-set variables, so pinning that name guarantees the CLI targets
 * exactly the selected environment even when a local .env exists.
 */
export function buildChildEnv(
  env: Readonly<Record<string, string | undefined>>,
  resolution: { connectionEnvVar: string; connectionString: string },
): Record<string, string | undefined> {
  return {
    ...env,
    [resolution.connectionEnvVar]: resolution.connectionString,
    POSTGRES_URL_NON_POOLING: resolution.connectionString,
  };
}

const stripAnsi = (text: string): string =>
  // eslint-disable-next-line no-control-regex
  text.replace(/\x1B\[[0-9;]*m/g, '');

export function summarizeMigrateStatus(output: string): MigrationStatusSummary {
  const text = stripAnsi(output);
  const foundMatch = MIGRATIONS_FOUND_RE.exec(text);
  const pendingBlock = PENDING_HEADER_RE.exec(text)?.[1];
  return {
    found: foundMatch
      ? Number(foundMatch[1])
      : text.includes(NO_MIGRATIONS_TEXT)
        ? 0
        : null,
    pending: pendingBlock
      ? pendingBlock
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
      : [],
    upToDate: text.includes(UP_TO_DATE_MARKER),
    diverged: text.includes(DIVERGED_MARKER),
    notManaged: text.includes(NOT_MANAGED_MARKER),
  };
}

export function summarizeMigrateApply(output: string): MigrationApplySummary {
  const text = stripAnsi(output);
  const applied = [...text.matchAll(APPLIED_NAME_RE)].map(
    (match) => match[1] ?? '',
  );
  return {
    applied,
    nothingToApply:
      text.includes(NOTHING_TO_APPLY_MARKER) || applied.length === 0,
  };
}

export function formatStatusSummary(summary: MigrationStatusSummary): string[] {
  const lines = [
    `migrations found in prisma/migrations: ${summary.found ?? 'unknown'}`,
  ];
  if (summary.upToDate) lines.push('database schema is up to date');
  if (summary.pending.length > 0) {
    lines.push(
      `pending (${summary.pending.length}): ${summary.pending.join(', ')}`,
    );
  }
  if (summary.diverged) {
    lines.push(
      'WARNING: local migration history and the database migrations table diverge — resolve before applying',
    );
  }
  if (summary.notManaged) {
    lines.push(
      'WARNING: database is not managed by Prisma Migrate — baseline it first (pris.ly/d/migrate-baseline)',
    );
  }
  return lines;
}

export function formatApplySummary(summary: MigrationApplySummary): string[] {
  if (summary.applied.length === 0) {
    return ['no migrations were applied by this run'];
  }
  return [`applied (${summary.applied.length}): ${summary.applied.join(', ')}`];
}

const stamp = (line: string): string => `[${new Date().toISOString()}] ${line}`;

/** Drain a child stream line by line (live operator feedback). */
async function streamLines(
  stream: ReadableStream<Uint8Array>,
  emit: (line: string) => void,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      emit(buffer.slice(0, newline).replace(/\r$/, ''));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
    }
    if (done) {
      // Flush any UTF-8 sequence split across the final chunk boundary
      // (prisma's box-drawing output is multi-byte).
      buffer += decoder.decode();
      if (buffer) emit(buffer);
      reader.releaseLock();
      return;
    }
  }
}

async function runMigrationCli(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    console.error(parsed.message);
    if (parsed.showUsage) console.error(usage());
    return 2;
  }

  const { invocation } = parsed;
  const resolution = resolveConnectionString(invocation.envName, process.env);
  if (!resolution.ok) {
    console.error(stamp(resolution.message));
    return 1;
  }

  if (!existsSync(PRISMA_CLI_ENTRY)) {
    console.error(
      stamp(
        `Prisma CLI not found at ${PRISMA_CLI_ENTRY}. Run bun install first.`,
      ),
    );
    return 1;
  }

  const prismaArgs = [
    'migrate',
    invocation.command === 'apply' ? 'deploy' : 'status',
  ] as const;
  console.log(
    stamp(
      `prisma ${prismaArgs.join(' ')} — env=${invocation.envName}, ` +
        `connection via $${invocation.connectionEnvVar} (value never printed)`,
    ),
  );

  const child = Bun.spawn([process.execPath, PRISMA_CLI_ENTRY, ...prismaArgs], {
    cwd: join(import.meta.dir, '..'),
    env: buildChildEnv(process.env, resolution),
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });

  let stdout = '';
  let stderr = '';
  await Promise.all([
    streamLines(child.stdout, (line) => {
      stdout += `${line}\n`;
      console.log(line);
    }),
    streamLines(child.stderr, (line) => {
      stderr += `${line}\n`;
      console.error(line);
    }),
  ]);
  const exitCode = await child.exited;

  // Diverged-history and not-managed diagnostics arrive on stderr (the test
  // fixtures label them as such), so both streams feed the summary.
  const combinedOutput = `${stdout}${stderr}`;
  const summary =
    invocation.command === 'apply'
      ? formatApplySummary(summarizeMigrateApply(combinedOutput))
      : formatStatusSummary(summarizeMigrateStatus(combinedOutput));
  for (const line of summary) console.log(stamp(line));
  console.log(
    stamp(`prisma ${prismaArgs.join(' ')} exited with code ${exitCode}`),
  );
  return exitCode;
}

if (import.meta.main) {
  runMigrationCli(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch(() => {
      // Prisma/IO failures can embed connection details — never echo them.
      console.error(
        stamp(
          'db-migrate failed; see the output above for prisma diagnostics.',
        ),
      );
      process.exitCode = 1;
    });
}
