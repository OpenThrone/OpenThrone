# Cloudflare platform modernization

Working record for Epic #19 (Forgejo): make OpenThrone deployable and operationally stable on Cloudflare with a minimal slice first (authentication plus core gameplay), then migrate the remaining capabilities incrementally.

## Decision record

### Runtime adapter: OpenNext (stays)

The repository already ships `@opennextjs/cloudflare` scaffolding (`wrangler.jsonc`, `open-next.config.ts`, `cloudflare:*` package scripts). Cloudflare recommends evaluating Vinext for **new** Next.js deployments while OpenNext remains the documented path for existing applications. This is an existing Pages Router application with 174 API routes, so we stay on OpenNext; a Vinext re-evaluation remains backlog under issue #25 if OpenNext blocks us.

### Scope of the first deployable slice

Ship **all HTTP-native routes** (gameplay, alliances, social, reports, admin) once their runtime blockers are removed, and **disable the websocket path** behind a feature flag. Realtime is chat/messaging only: every game-adjacent socket emission (`spyDefenseNotification`, attack notifications, social count updates) had no client listener at the time (restored 2026-11-13 on both transports, see [realtime-pilot.md](realtime-pilot.md)), and the social notification count already has a 2-minute HTTP polling fallback. Live chat send/receive and the live unread badge are the only real losses; a Durable Objects pilot (issue #23) restores them later.

### Choices taken

| Decision | Choice | Rationale |
| --- | --- | --- |
| Database | Existing PostgreSQL + Hyperdrive | Epic rule: PostgreSQL stays the source of truth; no D1 |
| Email | Mailer abstraction; SMTP driver for Node dev, HTTP provider driver on Workers | `nodemailer` SMTP cannot run on workerd |
| Cron | Cloudflare Cron Triggers calling existing endpoints via self-reference binding | Deployment becomes self-contained; external `curl` cron keeps working |
| Route surface | All HTTP-native routes ship; socket-dependent UI gated read-only | Least churn, matches strangler migration |

## Blocker inventory (verified 2026-10-11)

1. **Socket.IO coupling** — ~12 API routes import `getSocketIO` from `src/lib/socket.ts`, which would drag `socket.io` and `node:http` into the Workers bundle even when disabled. Fixed by a facade module with lazy dynamic import (Stage 1).
2. **`argon2` native module** — password hashing/verification (`src/services/Account.service.ts`, `src/services/ApiToken.service.ts`). Native N-API; cannot run on workerd. Replaced with `hash-wasm` argon2id, which verifies existing `$argon2id$` hash strings (parameters decode from the hash itself); `bcryptjs` path for legacy `$2b$` hashes is unchanged (Stage 2).
3. **`nodemailer` SMTP** — password-reset and verification mail (`src/services/Auth.service.ts`, `src/services/Account.service.ts`) (Stage 2).
4. **Filesystem at runtime** — avatar local-save mode (`src/pages/api/account/profile.ts`, `src/utils/avatarStorage.ts`, `formidable` temp files) and bot manifests via `readFileSync` (`src/botUsers/config.ts`, admin bot routes) (Stage 2).
5. **Turn accrual is cron-driven** — `CronJobService.processTurnUpdates` runs via external HTTP cron; turns do not accrue lazily (Stage 4).
6. **Internal HTTP self-call** — login Turnstile verification fetches the app's own `/api/captcha/verify` (Stage 2, inlined).

Non-blockers already Workers-compatible: NextAuth v4 JWT sessions, Postgres-backed rate limiting, `bcryptjs`, `speakeasy` (HMAC via `nodejs_compat`), Turnstile `siteverify` (plain fetch), Prisma 7 driver adapters, `getServerSideProps`.

## Stage checklist

Maps to the epic's sub-issues; each stage keeps the Node dev path green (strangler migration).

- [x] **Stage 0** — Baseline verified (`check-types`, `lint`, `test`, `build` green); decision record; env inventory (below). [#25]
- [x] **Stage 1** — Realtime facade `src/lib/realtime.ts`; all `getSocketIO` call sites swapped; `NEXT_PUBLIC_DISABLE_SOCKET` gates client hook, banner, and messaging send UI. Verified: full test suite green, worker boots on workerd with zero socket errors. Note: socket.io remains in the bundle as lazily-registered dead code (turbopack inlines dynamic imports); it is never evaluated when the flag is set. True bundle exclusion is backlog. [#23 prep]
- [x] **Stage 2** — `argon2` → `hash-wasm` (new passwords at OWASP m=19456/t=2/p=1; legacy hashes verify with their embedded params, incl. m=65536 from the native library's defaults; API tokens keep m=65536/t=3/p=4; the login rehash path upgrades legacy bcrypt/weak hashes on successful login); mailer facade with smtp/http/noop drivers; avatar upload gated behind an fs-capability probe (clean 503 on Workers, S3 mode preserved); bot manifests statically imported; Turnstile siteverify called directly (no self-HTTP hop); next-i18next config passed inline via `serverSideTranslations` wrapper. Discovered and fixed along the way: (b) the Turbopack-built OpenNext bundle fails to load the `app/_not-found` SSR chunk, turning every 404 into a 500 — **resolved by pinning the `cloudflare:*` scripts to `next build --webpack`** (Next 16 defaults `next build` to Turbopack; the adapter's Turbopack support misses this chunk for Pages-Router apps); a custom themed `pages/404.tsx` was also added. Workerd boot verification: `/`, `/account/login`, `/account/register`, `/battle/users`, `/messaging` all 200; unknown routes render the custom 404. `/home` 500s only in bare local dev without `NEXTAUTH_URL` (next-auth client session fetch) — expected to resolve with real deployment env. Legacy-argon2 verification at m=65536 later proved to exceed the 128 MiB isolate ceiling in practice and moved to a dedicated sidecar worker (commits 3f8726f/29547c9, `wrangler.argon2.jsonc`, `ARGON2_VERIFY` service binding; deployed via `cloudflare:deploy:argon2` before the main worker); new m=19456 hashes still verify in-process. [#25]
- [x] **Stage 3** — `src/lib/prisma.ts` resolves the Hyperdrive binding's connection string on Workers (`getCloudflareContext({ async: false })`, never throws) and falls back to `POSTGRES_PRISMA_URL` on Node; the same `PrismaPg` adapter serves both runtimes. Two workerd-specific fixes were required for the live path (see commit history): (a) Prisma's query-compiler wasm is extracted at build time into `prisma-generated/` and injected as a wrangler wasm module binding via `worker.ts` (`scripts/patch-prisma-wasm.ts` makes the generated client accept it — reruns via postinstall and `cloudflare:build`, fails loudly on Prisma template drift); (b) `pg`'s runtime sniffing is patched to always use its Node stream path (`node:net` TCP works under `nodejs_compat`; the `pg-cloudflare` adapter resolves to an empty stub under OpenNext's bundling). `open-next.config.ts` must keep `useWorkerdCondition: false` — enabling it drops default export conditions and breaks `jose`/`react-textarea-autosize` resolution. **Verified live**: `/api/config` on the preview deployment returns 200 with configuration read from PostgreSQL (Supabase preview DB) through Hyperdrive. `cf-typegen` available for typed bindings; the generated `cloudflare-env.d.ts` is gitignored. [#26]
- [x] **Stage 4** — Custom worker entry `worker.ts` re-exports the OpenNext handler and adds `scheduled()`, mapping Cron Triggers to the existing endpoints via the `WORKER_SELF_REFERENCE` binding with the raw `TASK_SECRET` header (turns `*/30 * * * *` to match the default `TURN_INTERVAL_MINUTES`, daily 04:00 UTC, bots 04:30, account status 05:00). `wrangler.jsonc` `main` now points at `worker.ts` and declares the four crons. The external `curl` crontab keeps working unchanged. Idempotency is unchanged from the service layer, which serializes per-user writes under `FOR UPDATE` row locks (covered by `src/services/__tests__/cronJob.concurrency.test.ts`, 7 tests). Verified locally with `wrangler dev --test-scheduled`: triggers fire, warn on missing `TASK_SECRET`, reach the endpoints through the binding, and are refused without the secret. [#21]
- [x] **Stage 5** — Wrangler `preview`/`production` environments (preview deliberately without cron triggers; self-reference service corrected per env) plus `cloudflare:deploy:preview|production` scripts; Cloudflare runbook appended to [operations](operations.md) covering one-time setup (Hyperdrive create, secrets, build-time `NEXT_PUBLIC_*`), deploy order (migrations before code), observability (`wrangler tail`, `[scheduled]` log lines), rollback (`wrangler rollback`), the cutover smoke checklist, and double-cron cautions. CI workflow wiring is deferred until a Forgejo runner is available — the legacy `.github/workflows/CI.yml` predates the Bun-first doctrine and is untouched. [#22, #24 minimal]
- [x] **Stage 6 — Wave 1 closeout** (2026-10-13) — tooling and runbooks for #21/#22/#26: guarded migration CLI `scripts/db-migrate.ts` (env registry dev/staging/preview/production, `--confirm-production` for prod, never echoes connection strings; 19 unit tests) plus `scripts/loadtest-preview.ts`; smoke suite `scripts/smoke-deploy.ts` (10 deterministic checks, live 10/10 on the preview, 26 unit tests); the cron fan-out extracted from `worker.ts` into `src/lib/workerCron.ts` with 9 boundary tests (cron→endpoint mapping, missing `TASK_SECRET`, partial-failure isolation, duplicate delivery, disabled flags); runbooks `docs/scheduled-jobs.md` (per-job trigger/owner/retry/idempotency/recovery plus honest known-gaps), `docs/database-reliability.md` (migration ownership, LAN staging backup/restore drill, transient-failure timeouts, load-test runbook), `docs/deploy-rollback.md` (rollback drill, structured-logging conventions, wrangler tail patterns), and the draft promotion gate `.forgejo/workflows/cloudflare-ci.yaml` (inactive until a Forgejo runner exists). `bun run lint` was unblocked by ignoring generated trees (`.open-next/` 122 MB, `prisma-generated/`, `dogfood-output/`, `.zcode/`) in `.eslintignore`. Gates: `check-types`, full test suite, targeted eslint, live smoke — all green. #25 audited and closed. [#21, #22, #25, #26]
- [x] **Stage 7 — Wave 2: API boundaries + DO pilot** (2026-10-14) — [#20] `docs/api-route-classification.md` (all 174 routes in 21 domains, criticality/auth/dependencies, 192 client references, 9-step extraction order), `docs/api-contract.md` (four auth modes, validation variants, canonical error shape with divergence table, rate limits, v1 versioning), and the bank vertical slice: getDeposits/history routes delegate to new `Bank.service` functions with byte-identical responses (22 unit + 25 parity tests). [#23] `docs/realtime-pilot.md` (full event/room/reconnect map + pilot spec), `ChatRoomDO` with WebSocket Hibernation (`src/durable-objects/`), `/do/chat/*` routing via `src/lib/workerDoRouter.ts` in `worker.ts`, short-lived ticket auth (`/api/realtime/ticket`), client `NEXT_PUBLIC_REALTIME_TRANSPORT` flag (socketio/do/off, default socketio — Socket.IO remains the rollback path), `scripts/loadtest-chat.ts` for the expand-or-stop measurement; 67 tests. Orchestrator verification: `cloudflare:build` green; wrangler `--dry-run` for preview AND production caught that `durable_objects` is not inherited by named environments — binding repeated per env. Repo-wide `eslint .` confirmed non-terminating and `eslint src` carries ~144 legacy errors: CI draft switched to changed-files lint (36a559d). Preview DB-path incident (2026-10-14) recorded in `docs/database-reliability.md` — `/api/config` hangs under concurrency while static pages stay fast; infra-owned (cloudflared/PgBouncer on the LAN Docker host suspected). [#20, #23]
- [x] **Stage 8 — Wave 3: gates, coverage, cross-review** (2026-10-14) — [#24] `docs/testing-coverage.md` (coverage matrix for every critical player/admin flow, 171-suite count summary, 12 prioritized gaps, strict minimum-before-production list) and `docs/migration-gates.md` (per-workload stage ladders, 14 quantified go/no-go gates each citing a measured baseline or marked target, initial SLOs with honest measurement gaps, incident-response ladder, rollback safety with runnable double-tick reconciliation, final cutover checklist, open-blockers list). Independent adversarial cross-review of the full `9af386a..HEAD` diff (55 files, +10702/−323) returned **SHIP WITH FIXES** — 0 high / 3 medium / 3 low — and independently re-ran the suite green (1656 pass / 3 skip / 0 fail). All six findings fixed the same day: JWT_SECRET fail-closed in `ChatRoomDO` (503, test), per-channel reconnect timers in `realtimeDoClient` (test), malformed-signature 401 in `realtimeTicket` (test), CI promotion now gates on the artifact it smokes (deploy-preview → smoke → promote), `bun.lock` committed so `--frozen-lockfile` is real, ticket-in-URL exposure documented in the pilot doc. Final gates: `check-types` green, full suite 1662 pass / 0 fail / 3 skip. [#22, #23, #24]

Deferred backlog: Durable Objects realtime pilot and chat send port (#23), API boundary/domain-service refactor (#20, not required for the minimal deploy), R2 avatar port, Vinext re-evaluation.

## Environment variable → Cloudflare mapping (names only)

Worker secrets unless noted. `NEXT_PUBLIC_*` values are build-time inlined and must be provided to `opennextjs-cloudflare build` (via wrangler `vars` or CI environment), not just set at runtime.

| Category | Variables | Cloudflare treatment |
| --- | --- | --- |
| Database | `POSTGRES_PRISMA_URL` | Secret (fallback when Hyperdrive is absent); primary path is the Hyperdrive binding |
| Auth sidecar | (binding, no secret) | `ARGON2_VERIFY` service binding to the `openthrone-argon2` worker verifies legacy m≥32768 argon2 hashes; deployed via `cloudflare:deploy:argon2` before the main worker |
| Auth | `NEXTAUTH_SECRET`, `JWT_SECRET`, `NEXTAUTH_URL`, `API_TOKEN_PEPPER`, `ANTI_ABUSE_SALT`, `TRUSTED_PROXY_IPS`, `SYSTEM_USER_ID`, `OT_ENFORCE_PRIVILEGED_2FA` | Secrets / vars; on Workers `resolveClientIp` uses `cf-connecting-ip` from any peer (`isCloudflareWorkersRuntime`), since workerd gives no socket address |
| Tasks | `TASK_SECRET`, `REVALIDATION_SECRET`, `DO_TURN_UPDATES`, `DO_DAILY_UPDATES`, `DO_BOT_UPDATES`, `TURN_INTERVAL_MINUTES` | Secret + vars; consumed by cron endpoints and the `scheduled()` entry |
| Email | `MAIL_DRIVER`, `MAIL_FROM`, `MAIL_BINDING`; `SMTP_HOST/PORT/USER/PASSWORD/FROM_EMAIL` | Workers use `MAIL_DRIVER=cloudflare`: Cloudflare Email Service through the `send_email` binding `EMAIL` (sender restricted to `MAIL_FROM`), no secret. The SMTP set stays on Node hosts, which keep sending queued outbox mail |
| S3/avatars | `AWS_S3_ENDPOINT`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_BUCKET_NAME`, `NEXT_PUBLIC_USE_AWS` | Secrets; S3 mode is the Workers-supported avatar path (fetch-based), local-fs mode is Node-only |
| Turnstile | `TURNSTILE_SECRET` (+ legacy `NEXT_PUBLIC_TURNSTILE_SECRET` name), `DISABLE_TURNSTILE`, `NEXT_PUBLIC_TURNSTILE_SITE_ID`, `NEXT_PUBLIC_USE_CAPTCHA`, `NEXT_PUBLIC_DISABLE_TURNSTILE` | Secret (server) — the `NEXT_PUBLIC_TURNSTILE_SECRET` name is a misnomer read only server-side; map it to a plain secret and rename later |
| ALTCHA (recruiting) | `ALTCHA_HMAC_KEY` | Secret (server), at least 16 characters; signs and verifies recruit challenges with WebCrypto only, so it runs on Workers. A Worker sharing a database with a Node host must use that host's value |
| Realtime | `NEXT_PUBLIC_WS_URL`, `OT_SOCKET_CORS_ORIGINS`, `NEXT_PUBLIC_SOCKET_IO_ORIGIN` | Unused on Workers while sockets are disabled; `NEXT_PUBLIC_DISABLE_SOCKET=true` becomes a build-time var |
| Feature flags | `NEXT_PUBLIC_ENABLE_ATTACKING`, `NEXT_PUBLIC_ENABLE_INFILTRATIONS`, `NEXT_PUBLIC_ENABLE_ASSASSINATIONS`, `NEXT_PUBLIC_ENABLE_INTEL`, `NEXT_PUBLIC_ENABLE_SOCIAL`, `NEXT_PUBLIC_ENABLE_ENEMIES`, `NEXT_PUBLIC_DISABLE_LOGIN`, `NEXT_PUBLIC_DISABLE_REGISTRATION`, `NEXT_PUBLIC_ATTACK_LEVEL_RANGE` | Build-time vars (DB-backed runtime overrides already exist via `RuntimeConfig.service`) |
| Misc | `NEXT_PUBLIC_URL_ROOT`, `NEXT_PUBLIC_ADMIN_MAINTENANCE_MESSAGE`, `LOG_LEVEL`, `NEXT_PUBLIC_LOG_LEVEL`, `NEXT_PUBLIC_ASSETS_HOSTNAME` | Build-time vars / runtime var |
| Bots (Node-only) | `BOT_DEFAULT_PASSWORD` | Secret used by provisioning scripts; not needed at runtime on Workers after static-import fix |

Source of truth for names: `process.env` reads in `src/`, `scripts/`, and root configs (see `src/constants/runtimeSettings.ts` for the flag registry). Never commit values.

## Cross-model review (Stage 2)

An adversarial review of the auth/crypto changes (Gemini via `agy`, read-only, on a staged copy of the diff) returned 11 findings; triage and disposition:

- **Fixed:** `verifyPassword` now fails closed (returns `false` on missing/empty/malformed hashes — previously threw, matching the native library, turning corrupt rows into 500s); mailer throws on a silent `noop` default in production (explicit `MAIL_DRIVER=noop` stays honored); `MAIL_PROVIDER_URL` must be `https://`; Turnstile siteverify now passes `remoteip`; avatar fs probe performs a real `realpath` call instead of presence checks (workerd provides stubs); API-token hashing reduced to m=19456/t=3/p=1 for new tokens (high-entropy secrets; existing tokens verify at their embedded m=65536).
- **False positive:** profile route already returns 405 for non-POST.
- **Deferred (pre-existing, documented):** the `NEXT_PUBLIC_TURNSTILE_SECRET` naming misnomer (server-only value; not referenced by client code so not inlined into client bundles, but should be renamed to a server-only secret — kept for now to not break existing deployments that only set that name); the `require()` of `next-i18next.config` (works under Next bundling; an ESM import is cosmetic).



## Cron contract (for the `scheduled()` entry)

From [operations](operations.md): each endpoint requires its enable flag set to `true` and an `Authorization` header containing the **raw** `TASK_SECRET` value (no `Bearer` prefix). Cadences: `turns` every `TURN_INTERVAL_MINUTES` (default 30), `daily` daily, `bots` daily after citizen growth (e.g. 00:30), `accountStatus` at a chosen maintenance cadence (shares the `DO_TURN_UPDATES` flag).

## Production-connected rehearsal (before domain cutover)

`bun run cloudflare:deploy:rehearsal` builds the app for
`https://stage.openthrone.dev` and deploys the separate `rehearsal`
environment, which serves that hostname through a Worker route (since
2026-11-11; the hostname used to alias the alpha server). It mirrors
production: its Hyperdrive binding targets the production Supabase
database, its build flags match production's, and its secrets match the
production host's. Every response carries `X-Robots-Tag: noindex, nofollow`
(`OT_NOINDEX`). `<rehearsal Worker URL>` stays up for
the readiness check. The staging preview remains separate.

The fixed `/__rehearsal/health` operation uses a read-only transaction and returns
only readiness, with no connection details or database records. Manual sign-in
and gameplay are explicitly permitted in this environment and write to the same
live database as the LXC, including login activity and telemetry. This is not a
cloned database. Automated checks should use the readiness operation only.
Redeployed 2026-10-18 with the merged master v0.4.1 code (commit c754c54b + DO
pilot fixes dfea22d8): readiness operation green, DO router answering.
Redeployed 2026-11-08 with master v0.12.0 (#386).

Image uploads (profile avatar, alliance artwork) are parsed and validated in
memory by `src/lib/imageUpload.ts` (Web `Request.formData()`, `image-size` on
the bytes) and stored through the S3 SDK's fetch handler, so the same path runs
on Node and Workers. The earlier formidable path spooled to temp files that a
Worker cannot read back, and every upload failed as "not a valid image".
Local-disk storage still needs a filesystem and answers 503 on Workers.

Build-time values come from a committed profile,
`config/cloudflare/<rehearsal|production>.env` (public values only), applied by
`scripts/cloudflare-build-profile.ts`. It refuses to build when a local `.env`
would inline a `NEXT_PUBLIC_*` value the profile does not set, so a checkout
pointed at staging cannot leak staging flags into a production bundle.

Secrets are aligned with the production host: `JWT_SECRET`, `ANTI_ABUSE_SALT`,
`IDENTITY_HASH_SECRET`, `EMAIL_UNSUBSCRIBE_SECRET`, `TASK_SECRET`,
`REVALIDATION_SECRET`, the Turnstile secret and the S3 avatar keys. Production
sets no `NEXTAUTH_SECRET`, so no Worker on the production database may set
one: the code uses `NEXTAUTH_SECRET || JWT_SECRET` to encrypt 2FA secrets,
sealed replays and gift codes, and a different key makes those rows
unreadable by the production host.

Cron triggers are empty and all `DO_*` flags are false. Mail sent during a
request (password reset, verification) goes through Cloudflare Email Service
via the `EMAIL` binding (`MAIL_DRIVER=cloudflare`, from
`no-reply@openthrone.dev`); queued outbox mail stays on the production host,
whose outbox worker keeps sending over SMTP.
Realtime runs the Durable Objects pilot (`NEXT_PUBLIC_REALTIME_TRANSPORT=do`,
enabled 2026-10-16 with the preview fixes; see `docs/realtime-pilot.md` §7.13)
— chat writes go through the same validated services as the HTTP API.
Automated checks against the rehearsal still use the readiness operation only.
No production migrations are run as part of rehearsal deployment. Configure
production-compatible identity/API secrets privately and allow the rehearsal
hostname on Turnstile before testing sign-in. Session-signing secrets can be
unique to the rehearsal, so LXC and Worker sessions stay independent. Preserve
existing anti-abuse, identity-hashing, and API-token secrets to keep shared records
consistent. Background email and Era-reset workers remain on the LXC.

## Domain cutover (2026-11-12)

`openthrone.dev` is served by the production Worker through the route
`openthrone.dev/*`, attached with `wrangler triggers deploy` after a route
swap was drilled on stage. The LXC keeps running as the rollback origin and
still runs the outbox mail worker and era resets; the Worker runs the
scheduled jobs. `www.openthrone.dev` redirects to the apex through its own
small Worker. The routing and rollback steps are in
[operations](operations.md#domain-routing).

## Cold starts (measured 2026-11-11)

A request that lands on a new Worker isolate is slow; a warm one is not.
With little traffic, requests spread across many isolates, so most page loads
on `stage.openthrone.dev` were cold. Method: deploy (which makes every
isolate cold), then read `cpuTime`/`wallTime` of the first request per route
from `wrangler tail`, two deploys per variant.

| First request on a new isolate | Before | Prisma built at startup |
| --- | --- | --- |
| `/api/config` CPU | 662–886 ms | 287–342 ms |
| `/battle/users` CPU | 911–1345 ms | 687–1023 ms |
| `/` CPU | 450–965 ms | 372–838 ms |
| Worker startup time | 25 ms | 165–184 ms (limit 1 s) |

Warm requests take about 15–50 ms of CPU. Prisma's cold cost was building
the client (deserializing the 1.1 MB parameterization graph) and the query
compiler. `worker.ts` now does that at isolate startup through
`warmWorkerPrismaClient()` (`src/lib/prismaClients.ts`), and the OpenNext
bundle reuses the same client through a `Symbol.for` global. `wrangler.jsonc`
aliases `@prisma/client/runtime/client` to its CommonJS build, because the
ESM build calls `fileURLToPath(import.meta.url)` at import time and crashes
startup in wrangler's bundle.

What remains:

- **Loading app code** (`_app`, the page, Next.js internals): the rest of the
  cold CPU. The server bundle is 26 MB (12 MB compiled pages and chunks,
  4 MB Next.js, 1 MB FontAwesome's full solid icon set).
- **Creating the isolate**: cold requests take about 1 s longer end to end
  than the Worker's own wall time (warm: about 60 ms). That is outside our
  code and grows with script size (34 MB uncompressed).

Profiling: `bunx wrangler check startup --env rehearsal` for startup, and a
CPU profile over the inspector of `wrangler dev --local` for the first request.
