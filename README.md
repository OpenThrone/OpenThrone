# OpenThrone

OpenThrone is a text-based MMORPG inspired by DarkThrone. It is not affiliated with the original DarkThrone project. This codebase grew out of the [Dark Curse project](https://github.com/MattGibney/DarkCurse) and uses Next.js Pages Router, React, TypeScript, Mantine, PostgreSQL/Prisma, and Socket.IO.

OpenThrone is developed by DasTacoMann and operated by AIOXperts IT Solutions LLC, which funds its development and provides hosting.

## Local development

Use Bun and a local PostgreSQL database.

```bash
cp .env.sample .env
# Configure the database URLs and authentication secrets in .env.
bun install
bunx prisma migrate deploy
bun run dev
```

- `POSTGRES_PRISMA_URL` is the runtime database connection; `POSTGRES_URL_NON_POOLING` is used by the Prisma CLI in [prisma.config.ts](prisma.config.ts). Point both at your development database.
- `bun install` runs Prisma client generation. Run `bunx prisma generate` again after schema changes.
- `prisma migrate deploy` applies checked-in migrations. Use `bunx prisma migrate dev --name <change>` when authoring a schema migration, not as an installation step.
- The custom development server defaults to port **3000** (`PORT` overrides it) and initializes Socket.IO. Keep `NEXTAUTH_URL` consistent with the local URL.
- Use `.env` for shared CLI/runtime configuration: Prisma's config explicitly loads it. Do not rely on `.env.local` alone for Prisma commands.

After pulling updates, run `bun install`, apply checked-in migrations, regenerate the client if necessary, and restart the development server.

## Verification

The base interface runs without custom artwork or a storage bucket. See [optional artwork](docs/artwork.md) to enable the hosted Cloudflare R2 art or force the CSS-and-icon experience with `NEXT_PUBLIC_ARTWORK_MODE=pure`.

| Task | Command |
| --- | --- |
| Build | `bun run build` |
| Lint | `bun run lint` |
| Type check (app and Cypress) | `bun run check-types` |
| Default tests (Bun) | `bun run test` |
| One Bun test file | `bun test <path/to/test-file>` |
| Jest DOM suite | `bun run test:jest -- <path/to/test-file>` |
| Format (modifies files) | `bun run format` |

The default test command excludes the Jest DOM suites: `src/lib/socket.test.ts`, `src/components/sidebar/SidebarShared.test.tsx`, and `src/__tests__/app-shell.test.tsx`. Run those with Jest. See [Cypress setup](cypress/README.md) for browser tests.

`bun run start` runs `next start` on port 3001; it does not start the custom Socket.IO server. For the custom server after a build, use `NODE_ENV=production bun run src/server/index.ts` with the appropriate environment. The checked-in PM2 config contains a machine-specific Bun path and must be adapted before use.

## Development Seeding (`bun run dev:seed`)

`bun run dev:seed` provisions one starter administrator and three level-80
non-bot combat players (`dev-raider`, `dev-guard`, `dev-spy`) with legal
catalog loadouts for attacking, defending, and spying. Safety rules:

- Production (`NODE_ENV=production`) is always refused.
- The database must be loopback (`localhost`, `127.0.0.1`, `::1`, Unix socket)
  unless you pass `--allow-non-local` with `NODE_ENV=development` — for
  pointing at a deliberate remote development database. The target
  host/database is printed without credentials before anything loads.
- `POSTGRES_PRISMA_URL` is required. `DEV_SEED_ADMIN_EMAIL`,
  `DEV_SEED_ADMIN_PASSWORD`, and `DEV_SEED_TEST_PASSWORD` are optional;
  unset passwords are generated and printed once after commit.
- Reruns are idempotent: existing seed accounts are skipped (no resets, no
  password changes, no resource top-ups), unrelated accounts with colliding
  emails/names are refused, and everything commits in one serializable
  transaction.
- `--dry-run` validates configuration and catalog loadouts without touching
  the database. `--help` prints the full flag reference.

Authentication, mission feature flags, and privileged-2FA policy are never
relaxed by the seed.

## Documentation

- [Documentation index](docs/README.md): current references, generated output, and historical notes.
- [Contributing](CONTRIBUTING.md): workflow and verification.
- [AGENTS.md](AGENTS.md): authoritative repository instructions for coding agents.

Report bugs and propose changes through the repository's issue tracker. Discord: https://discord.gg/j9NYxmBCjA.

## License

[MIT](LICENSE).

### Email lifecycle secrets

Configure `IDENTITY_HASH_SECRET` for keyed identity retention/suppression hashes and
`EMAIL_UNSUBSCRIBE_SECRET` for signing unsubscribe links. Public development defaults
are limited to development/test; staging and production must configure secrets.
New hashes use `IDENTITY_HASH_SECRET ?? ANTI_ABUSE_SALT`. Setting
`IDENTITY_HASH_SECRET` to the existing `ANTI_ABUSE_SALT` value is **not required**:
legacy lookups still use `getAntiAbuseHash` unchanged. Missing configuration disables
registration and prevents the email outbox worker from starting.
