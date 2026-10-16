import { randomBytes } from 'node:crypto';

import { hash } from 'argon2';
import { z } from 'zod';

import * as catalog from '@/constants';
import type { Prisma } from '@/lib/prisma-exports';
import * as defaults from '@/services/UserDefaults.service';

const SEED_PREFIX = 'dev-seed-v1-';
const PLAYER_LEVEL = 80;
const FORT_LEVEL = 16;
const HELP = `Usage: bun run dev:seed [--dry-run] [--allow-non-local] [--help]

Provision one starter administrator and three level-80 non-bot combat players.
Production is always refused. Connections must be loopback unless explicitly
opting into --allow-non-local with NODE_ENV=development. Target host/database
are printed without credentials; verify them before using this opt-in.
POSTGRES_PRISMA_URL is required. Optional settings:
  DEV_SEED_ADMIN_EMAIL     (default: admin@openthrone.local)
  DEV_SEED_ADMIN_PASSWORD  (minimum 8 characters; otherwise securely generated)
  DEV_SEED_TEST_PASSWORD   (minimum 8 characters; otherwise generated per player)

Existing seed accounts are skipped, never reset or elevated. All new records
commit together. Passwords are printed only after their accounts are created.
--dry-run validates configuration and catalog loadouts without loading the DB.
Authentication, mission feature flags and privileged 2FA policy remain enforced.
`;

class SeedError extends Error {}

export interface SeedConfig {
  connectionString: string;
  host: string;
  database: string;
  adminEmail: string;
  adminPassword?: string;
  testPassword?: string;
}

function isLocalHost(host: string): boolean {
  return (
    ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host.toLowerCase()) ||
    host.startsWith('/')
  );
}

/** Validate before importing anything that constructs a database client. */
export function validateSeedConfig(
  env: NodeJS.ProcessEnv,
  allowNonLocal = false,
): SeedConfig {
  if (env.NODE_ENV?.trim().toLowerCase() === 'production') {
    throw new SeedError('Refusing to seed in production.');
  }
  if (allowNonLocal && env.NODE_ENV !== 'development') {
    throw new SeedError('--allow-non-local requires NODE_ENV=development.');
  }
  const connectionString = env.POSTGRES_PRISMA_URL;
  if (!connectionString) {
    throw new SeedError('POSTGRES_PRISMA_URL is required.');
  }
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new SeedError('POSTGRES_PRISMA_URL must be a valid PostgreSQL URL.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new SeedError('POSTGRES_PRISMA_URL must use PostgreSQL.');
  }
  let host: string;
  let database: string;
  try {
    host = decodeURIComponent(url.hostname);
    database = decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new SeedError('POSTGRES_PRISMA_URL contains invalid encoding.');
  }
  // node-postgres permits query parameters to override connection fields.
  // Check every host override, not just the URL authority.
  const hosts = url.searchParams.getAll('host');
  if (
    (!host && !hosts.length) ||
    hosts.some((override) => !override.trim()) ||
    ['hostaddr', 'service', 'servicefile', 'dbname', 'database'].some((key) =>
      url.searchParams.has(key),
    )
  ) {
    throw new SeedError('Refusing an ambiguous database connection.');
  }
  if (
    !allowNonLocal &&
    ((host && !isLocalHost(host)) ||
      hosts.some((override) => !isLocalHost(override)))
  ) {
    throw new SeedError(
      'Refusing a non-loopback database. Use --allow-non-local only for deliberate development provisioning.',
    );
  }
  host = hosts[hosts.length - 1] ?? host;
  if (!database || database.includes('/')) {
    throw new SeedError('POSTGRES_PRISMA_URL must name a database.');
  }
  const email = z
    .string()
    .email()
    .safeParse(
      (env.DEV_SEED_ADMIN_EMAIL ?? 'admin@openthrone.local')
        .trim()
        .toLowerCase(),
    );
  if (!email.success) {
    throw new SeedError('DEV_SEED_ADMIN_EMAIL must be a valid email address.');
  }
  for (const key of ['DEV_SEED_ADMIN_PASSWORD', 'DEV_SEED_TEST_PASSWORD']) {
    if (env[key] && env[key].length < 8) {
      throw new SeedError(`${key} must contain at least 8 characters.`);
    }
  }
  if (
    ['dev-raider', 'dev-guard', 'dev-spy'].some(
      (name) => email.data === `${name}@openthrone.local`,
    )
  ) {
    throw new SeedError('DEV_SEED_ADMIN_EMAIL conflicts with a test player.');
  }
  return {
    connectionString,
    host,
    database,
    adminEmail: email.data,
    adminPassword: env.DEV_SEED_ADMIN_PASSWORD || undefined,
    testPassword: env.DEV_SEED_TEST_PASSWORD || undefined,
  };
}

interface SeedAccount {
  key: 'admin' | 'raider' | 'guard' | 'spy';
  email: string;
  displayName: string;
  scalars: Partial<Prisma.usersUncheckedCreateInput>;
  units: Prisma.UserUnitCreateWithoutUserInput[];
  items: Prisma.UserItemCreateWithoutUserInput[];
  structures: Prisma.UserStructureUpgradeCreateWithoutUserInput[];
  battleUpgrades: Prisma.UserBattleUpgradeCreateWithoutUserInput[];
  bonusPoints: Prisma.UserBonusPointsCreateWithoutUserInput[];
}

/** Catalog-derived profiles can be inspected in dry-run without a DB connection. */
export async function buildSeedAccounts(
  adminEmail: string,
): Promise<SeedAccount[]> {
  const fort = catalog.Fortifications.find((row) => row.level === FORT_LEVEL);
  const xp = catalog.levelXPArray.find((row) => row.level === PLAYER_LEVEL)?.xp;
  const offense = catalog.OffensiveUpgrades.find((row) => row.level === 16);
  const spy = catalog.SpyUpgrades.find((row) => row.level === 16);
  const sentry = catalog.SentryUpgrades[15]; // Catalog levels are one-based indices.
  const armory = catalog.ArmoryUpgrades.find((row) => row.level === 4);
  if (
    !fort ||
    !xp ||
    fort.levelRequirement > PLAYER_LEVEL ||
    !offense ||
    offense.fortLevelRequirement > FORT_LEVEL ||
    !spy ||
    spy.fortLevelRequirement > FORT_LEVEL ||
    !spy.maxAssassinations ||
    !sentry ||
    sentry.fortLevelRequirement > FORT_LEVEL ||
    !armory ||
    armory.fortLevel > FORT_LEVEL
  ) {
    throw new SeedError(
      'The development profiles no longer satisfy catalog gates.',
    );
  }
  const accounts: SeedAccount[] = [
    {
      key: 'admin',
      email: adminEmail,
      displayName: 'Administrator',
      scalars: defaults.buildDefaultUserUpdate(),
      units: defaults.ERA_DEFAULT_UNITS.map((row) => ({ ...row })),
      items: defaults.ERA_DEFAULT_ITEMS.map((row) => ({ ...row })),
      structures: defaults.ERA_DEFAULT_STRUCTURE_UPGRADES.map((row) => ({
        ...row,
      })),
      battleUpgrades: defaults.ERA_DEFAULT_BATTLE_UPGRADES.map((row) => ({
        ...row,
      })),
      bonusPoints: defaults.ERA_DEFAULT_BONUS_POINTS.map((row) => ({ ...row })),
    },
  ];
  const roles = ['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'] as const;
  for (const key of ['raider', 'guard', 'spy'] as const) {
    const quantities = {
      OFFENSE: key === 'raider' ? 200 : 100,
      DEFENSE: key === 'guard' ? 200 : 100,
      SPY: key === 'spy' ? 100 : 50,
      SENTRY: key === 'guard' ? 100 : 50,
    };
    const units: SeedAccount['units'] = defaults.ERA_DEFAULT_UNITS.map(
      (row) => ({
        ...row,
        quantity:
          row.type === 'CITIZEN'
            ? 500
            : row.type === 'WORKER'
              ? 100
              : quantities[row.type],
      }),
    );
    for (const type of roles) {
      for (const level of [2, 3]) {
        const unit = catalog.UnitTypes.find(
          (row) => row.type === type && row.level === level,
        );
        if (!unit || unit.fortLevel > FORT_LEVEL) {
          throw new SeedError(
            'A development unit no longer satisfies catalog gates.',
          );
        }
        units.push({
          type,
          level,
          quantity: quantities[type],
          isMercenary: false,
        });
      }
    }
    // One legal level-3 piece per slot and tier-3 troop; capacity is never multiplied.
    const items: SeedAccount['items'] = [];
    for (const usage of roles) {
      for (const type of [
        'WEAPON',
        'HELM',
        'ARMOR',
        'BOOTS',
        'BRACERS',
        'SHIELD',
      ] as const) {
        const item = catalog.ItemTypes.find(
          (row) =>
            row.usage === usage &&
            row.type === type &&
            row.level === 3 &&
            (row.armoryLevel ?? 1) <= armory.level &&
            ['ALL', 'HUMAN'].includes(row.race),
        );
        if (item)
          items.push({
            type,
            usage,
            level: item.level,
            quantity: quantities[usage],
          });
      }
    }
    accounts.push({
      key,
      email: `dev-${key}@openthrone.local`,
      displayName: `Dev ${key === 'raider' ? 'Raider' : key === 'guard' ? 'Guard' : 'Spy'}`,
      scalars: defaults.buildDefaultUserUpdate({
        experience: xp,
        fort_level: FORT_LEVEL,
        fort_hitpoints: fort.hitpoints,
        gold: 1_000_000,
        attack_turns: 250,
        stamina: 100,
        maxStamina: 100,
      }),
      units,
      items,
      structures: defaults.ERA_DEFAULT_STRUCTURE_UPGRADES.map((row) => ({
        ...row,
        level: row.type === 'ARMORY' ? armory.level : 16,
      })),
      battleUpgrades: defaults.ERA_DEFAULT_BATTLE_UPGRADES.map((row) => ({
        ...row,
      })),
      bonusPoints: defaults.ERA_DEFAULT_BONUS_POINTS.map((row) => ({ ...row })),
    });
  }
  return accounts;
}

interface ExistingIdentity {
  id: number;
  email: string;
  recruit_link: string;
  isBot: boolean;
  staffRoleAssignments: { role: string; revokedAt: Date | null }[];
}

/** A matching email/name alone is not proof that a regular account belongs to us. */
export function resolveSeedIdentity(
  account: Pick<SeedAccount, 'key' | 'email'>,
  matches: ExistingIdentity[],
): number | null {
  if (!matches.length) return null;
  const existing = matches[0];
  if (
    matches.length !== 1 ||
    existing.email.toLowerCase() !== account.email ||
    existing.isBot
  ) {
    throw new SeedError(
      `Identity conflict for development ${account.key}; nothing was changed.`,
    );
  }
  const seeded = new RegExp(`^${SEED_PREFIX}${account.key}-[a-f0-9]{32}$`).test(
    existing.recruit_link,
  );
  const administrator =
    account.key === 'admin' &&
    existing.staffRoleAssignments.some(
      (role) => role.role === 'ADMINISTRATOR' && role.revokedAt === null,
    );
  if (!seeded && !administrator) {
    throw new SeedError(
      `Unrelated account conflicts with development ${account.key}; refusing elevation or reset.`,
    );
  }
  return existing.id;
}

interface SeedResult {
  email: string;
  id: number;
  password?: string;
}

export async function runDevSeed(
  args: readonly string[] = process.argv.slice(2),
): Promise<void> {
  if (
    args.some(
      (arg) =>
        !['--help', '-h', '--dry-run', '--allow-non-local'].includes(arg),
    )
  ) {
    throw new SeedError('Unknown argument. Use bun run dev:seed --help.');
  }
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(HELP);
    return;
  }
  const config = validateSeedConfig(
    process.env,
    args.includes('--allow-non-local'),
  );
  const accounts = await buildSeedAccounts(config.adminEmail);
  console.log(
    `Development database host=${JSON.stringify(config.host)} database=${JSON.stringify(config.database)}`,
  );
  if (args.includes('--dry-run')) {
    for (const account of accounts) {
      console.log(
        `PLAN ${account.email} (${account.displayName})${account.key === 'admin' ? ' ADMINISTRATOR starter' : ` level ${PLAYER_LEVEL}, fort ${FORT_LEVEL}`}`,
      );
    }
    console.log(
      'Dry run: configuration and catalogs valid; DB not loaded, conflicts not queried, no writes.',
    );
    return;
  }

  // Static imports would construct Prisma before the production/locality guard.
  const { default: prisma } = await import('@/lib/prisma');
  try {
    // Era.service imports that same client, so it also must load after the guard.
    const { ensureActiveEra } = await import('@/services/Era.service');
    const result = await prisma.$transaction(
      async (tx: Prisma.TransactionClient): Promise<SeedResult[]> => {
        // Preflight every identity before ensuring an era or inserting anything.
        const plan: { account: SeedAccount; existingId: number | null }[] = [];
        for (const account of accounts) {
          const matches = await tx.users.findMany({
            where: {
              OR: [
                { email: { equals: account.email, mode: 'insensitive' } },
                {
                  display_name: {
                    equals: account.displayName,
                    mode: 'insensitive',
                  },
                },
              ],
            },
            select: {
              id: true,
              email: true,
              recruit_link: true,
              isBot: true,
              staffRoleAssignments: { select: { role: true, revokedAt: true } },
            },
          });
          plan.push({
            account,
            existingId: resolveSeedIdentity(account, matches),
          });
        }
        const created: SeedResult[] = [];
        if (plan.every((entry) => entry.existingId !== null)) {
          return plan.map(({ account, existingId }) => ({
            email: account.email,
            id: existingId,
          }));
        }
        const era = await ensureActiveEra(tx);
        for (const { account, existingId } of plan) {
          if (existingId !== null) {
            created.push({ email: account.email, id: existingId });
            continue;
          }
          const password =
            (account.key === 'admin'
              ? config.adminPassword
              : config.testPassword) ?? randomBytes(24).toString('base64url');
          const user = await tx.users.create({
            data: {
              ...account.scalars,
              email: account.email,
              display_name: account.displayName,
              password_hash: await hash(password),
              race: 'HUMAN',
              class: 'FIGHTER',
              locale: 'en-US',
              colorScheme: 'HUMAN',
              isBot: false,
              currentEraId: era.id,
              last_active: new Date(), // A null last_active reads as idle and resets the account on first check.
              recruit_link: `${SEED_PREFIX}${account.key}-${randomBytes(16).toString('hex')}`,
              statusHistories: {
                create: {
                  status: 'ACTIVE',
                  reason: 'Development seed provisioning',
                },
              },
              UserUnit: { create: account.units },
              UserItem: { create: account.items },
              UserStructureUpgrade: { create: account.structures },
              UserBattleUpgrade: { create: account.battleUpgrades },
              UserBonusPoints: { create: account.bonusPoints },
              ...(account.key === 'admin'
                ? {
                    staffRoleAssignments: {
                      create: {
                        role: 'ADMINISTRATOR',
                        note: 'Development seed provisioning',
                      },
                    },
                  }
                : {}),
            },
            select: { id: true },
          });
          created.push({ email: account.email, id: user.id, password });
        }
        return created;
      },
      { isolationLevel: 'Serializable', timeout: 30_000 },
    );
    for (const account of result) {
      console.log(
        `${account.password ? 'CREATED' : 'SKIP'} ${account.email} id=${account.id}`,
      );
      if (account.password) console.log(`  Password: ${account.password}`);
    }
    console.log(
      'Authentication and feature flags are unchanged. Privileged 2FA may be required by deployment policy.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.main) {
  runDevSeed().catch((error: unknown) => {
    // Database/native errors can include connection strings. Never echo them.
    console.error(
      error instanceof SeedError
        ? error.message
        : 'Development seed failed. Check the development database/schema and retry; existing accounts are never reset.',
    );
    process.exitCode = 1;
  });
}
