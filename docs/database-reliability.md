# Database reliability

Operational runbook for the PostgreSQL layer behind the OpenThrone Cloudflare
Workers deployment: who owns migrations, how to drill backup/restore for the
LAN staging database, how transient database failures surface to clients, and
how to load-test the preview deployment through a redeploy.

## Migration ownership

**Who runs it:** the release operator, from an operator shell, once per
release. `scripts/db-migrate.ts` is a controlled-release tool — its header
states it must never run per request or at instance startup
(`scripts/db-migrate.ts:4-6`). **When:** apply pending migrations **before**
deploying new code, per the deploy procedure in
[operations.md](operations.md) (`docs/operations.md:127`, "Apply pending
Prisma migrations **before** deploying new code"); the `apply` usage text
repeats the same ordering (`scripts/db-migrate.ts:118-119`).

Per release:

```bash
# 1. Inspect state first (exits nonzero while migrations are pending —
#    that exit code is inherited from prisma migrate status,
#    scripts/db-migrate.ts:116-117)
bun scripts/db-migrate.ts status --env staging

# 2. Apply, then deploy code (package.json:16-17)
bun scripts/db-migrate.ts apply --env staging
bun run cloudflare:deploy:preview     # or :production (package.json:16-17)
```

**The environment registry** (`scripts/db-migrate.ts:30-39`) maps each
`--env` name to the *name* of the variable holding that environment's direct
(non-pooled) connection string:

| `--env` | Connection variable | Target |
| --- | --- | --- |
| `dev` | `POSTGRES_URL_NON_POOLING` | local developer database |
| `staging` | `STAGING_POSTGRES_URL_NON_POOLING` | the LAN Docker host staging Postgres |
| `preview` | `PREVIEW_POSTGRES_URL_NON_POOLING` | database behind the preview Worker (currently the staging instance) |
| `production` | `PRODUCTION_POSTGRES_URL_NON_POOLING` | production database |

Variable names only — values live in the operator's shell or secret store
and are never printed (`scripts/db-migrate.ts:11-17`). Migrations use the
non-pooled URL because DDL wants a direct session; both Hyperdrive and the
LAN PgBouncer hop pool at the protocol level (`scripts/db-migrate.ts:15-17`).
The child Prisma process receives the selected connection string through its
environment only — pinned to both the selected variable and
`POSTGRES_URL_NON_POOLING`, which `prisma.config.ts` reads
(`scripts/db-migrate.ts:235-244`), never through argv
(`scripts/db-migrate.ts:379-385`).

**The production confirmation rule:** any command with `--env production` is
refused unless `--confirm-production` is also passed
(`scripts/db-migrate.ts:190-197`); the guard is unit-tested in
`scripts/db-migrate.test.ts:66-98`. Independently, an unset or empty
connection variable is refused with a message that names the variable but
never its value (`scripts/db-migrate.ts:216-224`), and unknown subcommands,
environments, or options are refused with usage text
(`scripts/db-migrate.ts:135-207`).

## Backup and restore drill (LAN staging database on the LAN Docker host)

The staging database is reached through a chain we own
(`docs/operations.md:143-149`):

```
Worker → Hyperdrive (openthrone-db-lan, wrangler.jsonc:71-77)
       → VPC service openthrone-pg → private-lan tunnel (cloudflared)
       → the LAN Docker host /opt/private-lan: private-lan-pg-tls (PgBouncer, client TLS :5433)
       → <staging database host>:5432 (otdev_stage)
```

PgBouncer terminates TLS because the origin Postgres has SSL disabled and
TLS-first proxies cannot serve protocol-negotiated Postgres TLS
(`docs/operations.md:151-154`). Its config and userlist live in
`/opt/private-lan` (root-owned; the userlist holds the database password — keep
it mode 600, `docs/operations.md:153-154`).

Run the drill from any operator shell that can reach the PgBouncer TLS
listener on the LAN Docker host (confirm the published host port in the compose file
under `/opt/private-lan`; the listener itself is documented at
`docs/operations.md:147`). All values below are placeholders — fill them
from your secret store; none are stored in this repository.

```bash
# --- Variables (no real values in this doc) -------------------------------
DB_TLS_HOST=<LAN Docker host>   # host running the private-lan compose project
DB_TLS_PORT=<published PgBouncer TLS port>  # container listens on :5433 (docs/operations.md:147)
STAGING_DB=<staging database name>          # otdev_stage per docs/operations.md:141
DB_USER=<user listed in the /opt/private-lan userlist>
DB_PASSWORD=<from your secret store>
SCRATCH_DB=${STAGING_DB}_restore_drill_$(date -u +%Y%m%dT%H%M%SZ)
DUMP_FILE=${STAGING_DB}-$(date -u +%Y%m%dT%H%M%SZ).dump
export PGPASSWORD="${DB_PASSWORD}"

SRC_DB_URL="host=${DB_TLS_HOST} port=${DB_TLS_PORT} sslmode=require dbname=${STAGING_DB} user=${DB_USER}"
MAINT_DB_URL="host=${DB_TLS_HOST} port=${DB_TLS_PORT} sslmode=require dbname=postgres user=${DB_USER}"
SCRATCH_DB_URL="host=${DB_TLS_HOST} port=${DB_TLS_PORT} sslmode=require dbname=${SCRATCH_DB} user=${DB_USER}"

# --- 1. Dump through the TLS PgBouncer path --------------------------------
psql "${SRC_DB_URL}" -c 'SELECT 1;'        # connectivity + TLS handshake check first
pg_dump --format=custom --no-owner --no-privileges "${SRC_DB_URL}" --file "${DUMP_FILE}"
ls -l "${DUMP_FILE}" && pg_restore --list "${DUMP_FILE}" | head   # archive is readable

# --- 2. Restore into a scratch database on the same instance ---------------
createdb "${MAINT_DB_URL}" "${SCRATCH_DB}"
pg_restore --no-owner --no-privileges --dbname "${SCRATCH_DB_URL}" "${DUMP_FILE}"

# --- 3. Verify --------------------------------------------------------------
# Exact counts on tables that matter (users: prisma/schema.prisma:240;
# attack_log: prisma/schema.prisma:447; users.created_at: prisma/schema.prisma:270)
for db_url in "${SRC_DB_URL}" "${SCRATCH_DB_URL}"; do
  echo "== ${db_url}"
  psql "${db_url}" -Atc "SELECT 'users', COUNT(*) FROM users"
  psql "${db_url}" -Atc "SELECT 'attack_log', COUNT(*) FROM attack_log"
  psql "${db_url}" -Atc "SELECT 'max_user_created_at', MAX(created_at) FROM users"
done
# Approximate whole-database cross-check (statistics-based; run ANALYZE first
# or prefer the exact counts above when they disagree):
for db_url in "${SRC_DB_URL}" "${SCRATCH_DB_URL}"; do
  psql "${db_url}" -c "SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY relname"
done

# --- 4. Clean up -------------------------------------------------------------
dropdb "${MAINT_DB_URL}" "${SCRATCH_DB}"
unset PGPASSWORD
```

Pass criteria: the dump completes without errors, the restore reports no
fatal errors, and the per-table counts and `MAX(created_at)` match between
source and scratch.

Caveats, stated honestly:

- **PgBouncer pool mode is not recorded in this repository.** `pg_dump`
  wants a stable session; if the `/opt/private-lan` PgBouncer runs transaction
  pooling and the dump fails or behaves oddly through it, run the dump from
  the LAN Docker host against the plain origin (`<staging database host>:5432`, topology at
  `docs/operations.md:148`) instead. That still drills the dump/restore
  procedure; the TLS front door is then exercised separately by the
  application path (the preview Worker reads this same database through
  Hyperdrive — `wrangler.jsonc:68-77` — and `/api/config` answers from it).
- If Hyperdrive reports origin TLS errors during the drill, check
  `docker logs private-lan-pg-tls` first, then the origin Postgres
  (`docs/operations.md:157-158`).
- Never restore into `${STAGING_DB}` itself; the scratch database exists so
  a bad dump cannot damage the live staging data. Drop it when done.

Schedule: run the drill quarterly and before any Postgres or PgBouncer
upgrade on the LAN Docker host.

## Transient-failure behavior (timeouts)

The Prisma client is created with server-side guardrail timeouts
(`src/lib/prisma.ts:54-68`):

| Setting | Value | Effect |
| --- | --- | --- |
| `statement_timeout` | 15 000 ms | PostgreSQL cancels any single query running longer than 15 s (`src/lib/prisma.ts:64`) |
| `idle_in_transaction_session_timeout` | 15 000 ms | PostgreSQL terminates any session idle in a transaction longer than 15 s (`src/lib/prisma.ts:65`) |
| `connectionTimeoutMillis` | 10 000 ms | the client gives up waiting for a connection after 10 s (`src/lib/prisma.ts:66`) |
| `max` | 5 | per-isolate pg pool size; Hyperdrive performs the origin pooling (`src/lib/prisma.ts:67`, comment at `:62-63`) |

Why they exist: a canceled Worker request cannot abort its in-flight query,
so a request killed mid-transaction leaks a session holding row locks, and
every later request touching those rows piles up behind it — the code
comment calls out the pre-fix symptom as "hung" 1101s and a whole-app stall
(`src/lib/prisma.ts:58-63`). The timeouts make the database reap that leaked
work in seconds.

What clients see:

- **Long query (>15 s):** PostgreSQL cancels it — SQLSTATE `57014`
  ("canceling statement due to statement timeout"). The request fails fast
  with a database error instead of hanging; the user sees the route's error
  path (typically a 5xx or error page), not a stalled tab.
- **Leaked mid-transaction session:** after 15 s idle the server terminates
  the session — SQLSTATE `25P03` ("terminating connection due to
  idle-in-transaction timeout"). Its row locks release, so queued requests
  unblock; the dead session's next caller gets a terminated-connection error
  and retries on a fresh pooled connection.
- **Database unreachable:** connection attempts give up after 10 s
  (`connectionTimeoutMillis`, `src/lib/prisma.ts:66`) with a client-side
  connection failure rather than an indefinite hang.

The Hyperdrive binding is resolved synchronously and never throws; outside
Workers the client falls back to `POSTGRES_PRISMA_URL`
(`src/lib/prisma.ts:42-52`, fallback at `:57`).

## Load-test runbook (preview during a redeploy)

`scripts/loadtest-preview.ts` drives concurrent GET traffic at the public
routes of a deployment and prints a one-line JSON summary. Defaults target
the live preview (`<preview Worker URL>`,
`scripts/loadtest-preview.ts:33`), 30 s / 10 workers over `/`,
`/account/login`, `/api/config` (`scripts/loadtest-preview.ts:35-37`).

**The drill — validate behavior under concurrent requests and deployment
churn:**

```bash
# Terminal 1: start the harness FIRST, with enough runway to span the deploy
bun scripts/loadtest-preview.ts --duration-seconds 240 --concurrency 20

# Terminal 2: while it runs, redeploy the preview worker (package.json:16)
bun run cloudflare:deploy:preview
```

Workers hit the routes round-robin via one shared cursor
(`scripts/loadtest-preview.ts:344-362`); in-flight requests when the timer
expires are allowed to finish, so a run whose requests hang can take longer
than `--duration-seconds` (observed: a 1 s run took ~15 s while requests
hung until the per-request 15 s abort, `scripts/loadtest-preview.ts:317`).

**Reading the JSON summary** (one line on stdout,
`scripts/loadtest-preview.ts:397`):

```json
{"baseUrl":"…","durationSeconds":240,"concurrency":20,"startedAt":"…",
 "routes":{"/api/config":{"requests":912,"successes":908,"errors":4,
   "errorRate":0.0044,"p50Ms":48,"p95Ms":210,"p99Ms":2210,"maxMs":15001}},
 "totalRequests":…,"totalErrors":…,"overallErrorRate":…,
 "passed":true,"failureReasons":[]}
```

- `requests` / `successes` / `errors` / `errorRate` — per route. A request
  is a success only when fetch resolves with a 2xx/3xx status; network
  failures, aborts and 4xx/5xx count as errors
  (`scripts/loadtest-preview.ts:313-326`). Every attempt — success or error —
  contributes a latency sample, because slow failures during a redeploy are
  the signal worth keeping (`scripts/loadtest-preview.ts:12-15`).
- `p50/p95/p99/max` — nearest-rank percentiles of time-to-response-headers
  in milliseconds (`scripts/loadtest-preview.ts:224-234`); bodies are
  cancelled, not drained (`scripts/loadtest-preview.ts:320-321`).
- `passed` / `failureReasons` — the run fails when the error rate exceeds
  1% overall or on any single route, or any route records zero successes
  (`scripts/loadtest-preview.ts:43`, rules at `:259-276`); the process exits
  nonzero accordingly (`scripts/loadtest-preview.ts:401`).

**Interpreting a redeploy run:** expect a p99/max spike while new isolates
cold-start (a warm cache serves in tens of milliseconds; cold first hits
cost seconds) and accept a small error blip — freshly deployed isolates are
documented to intermittently 5xx before route logic runs
(`scripts/smoke-deploy.ts:16-19`). The 1% budget absorbs a brief blip;
sustained errors, a route stuck at zero successes, or max latencies pinned
at the 15 s request timeout indicate a real problem: investigate with
`bunx wrangler tail --env preview` (preview analog of the production tail at
`docs/operations.md:128`), then roll back with `wrangler deployments list` /
`wrangler rollback` per `docs/operations.md:129`, and re-run
`bun scripts/smoke-deploy.ts` for functional checks.

**Limitation:** public routes only — the harness sends no credentials,
cookies or Turnstile tokens, so authenticated flows (recruit/train/bank,
attack+spy, admin) are out of scope (`scripts/loadtest-preview.ts:21-26`);
those stay covered by the cutover smoke checklist (`docs/operations.md:130`).

Live observation (2026-10-13, `--duration-seconds 1 --concurrency 2 --routes
/api/config`): the preview answered one request in ~2 s and let two hang to
the 15 s abort (exit 1, error rate 66.67%); an independent probe the same
minute saw a fast 500, a 15 s hang, a ~2.4 s cold 200 and ~40-50 ms warm
200s. Treat the harness verdict as a real signal about preview health, not
harness noise — the counters were verified to record exactly one sample per
claimed request.

**Incident record (2026-10-14, orchestrator):** a full 30 s / 10-worker run
passed `/` and `/account/login` cleanly (0 errors, p50 62-68 ms, p95 ~1.2-1.5 s
on cold isolates) but failed `/api/config` with a 23.3% error rate and
p95/p99/max pinned at the 15 s request timeout; immediately afterwards six
sequential unauthenticated curls to `/api/config` all hung past 20 s with zero
bytes, while `/` and `/account/login` stayed 200 at ~70-90 ms — the failure is
isolated to the database path, not the Worker. Minutes later `/api/config`
answered 200 in ~1.1 s without any change: the upstream connection
intermittently wedges and later re-establishes. From a LAN host, the origin
staging Postgres (`<staging database host>:5432`) is TCP-reachable; the PgBouncer hop is
tunnel-only by design and not directly probeable.

**Root cause (confirmed 2026-10-14 on the LAN Docker host):** the trigger was a
cloudflared QUIC storm — 63 `Failed to dial a quic connection / timeout: no
recent network activity` errors between 04:00-04:52 UTC killing all four edge
connections of `private-lan-cloudflared` (log evidence), which black-holed every
in-flight database connection. The persistent aftermath is Cloudflare-side:
requests that fail never reach cloudflared (zero serve activity in its logs)
nor PgBouncer (zero client logins during hang windows), while requests that
do get through complete in tens of milliseconds — the Hyperdrive/VPC segment
holds connections poisoned by the tunnel outages and evicts them only slowly,
and each connector restart re-poisons the pool by killing all transit
connections (observed: state worsened after each restart; the earlier
self-heal coincided with a traffic-free gap). PgBouncer and the origin
Postgres are healthy (session `pool_mode`; ~40 ms server connect, immediate
logins whenever traffic arrives).

**Remediation applied:** `private-lan-cloudflared` switched from QUIC to the
HTTP/2 (TCP) fallback — `/opt/private-lan/docker-compose.yml` now runs
`tunnel --no-autoupdate --protocol http2 run`, the previous file kept at
`docker-compose.yml.bak-quic`; four connections registered over http2
(ewr11/phl01), eliminating the QUIC-storm failure class. The Hyperdrive-side
pool was still draining at time of writing — leave the path undisturbed
rather than restarting components.

**Remaining owner actions if it does not self-heal:** inspect the
`openthrone-db-lan` Hyperdrive resource and the `openthrone-pg` VPC service
in the Cloudflare dashboard (the drop sits between Hyperdrive and the tunnel);
re-create or re-point the preview Hyperdrive resource if the pool stays
wedged. *(Superseded — see "Root cause corrected" below.)*

**Same-day escalation (2026-10-14 evening):** login on the preview remained
broken through good and bad windows. A synthetic account reproduced it
remotely (credentials callback → fast `error code: 1101`, or 12-15 s hangs)
while the IDENTICAL deployed code under local `wrangler dev` — pointed at the
same staging database directly over the LAN — registers and logs in with a
session cookie in ~0.3 s. Exhaustive component replacement did not change
the failure rate: a brand-new Hyperdrive resource (`openthrone-db-lan2`,
caching disabled, origin-connection-limit raised to 100), a fresh VPC
service, a fresh preview deployment, and the http2 connector all still fail
~60-80% of app requests. The decisive split: **five consecutive throwaway
`wrangler hyperdrive create` validations connected 5/5 through the exact same
VPC service → tunnel → PgBouncer chain** — Hyperdrive's setup path connects
perfectly while its bound serving path fails. *(The platform-issue conclusion drawn
here was wrong — see "Root cause corrected" below.)* Account facts
verified in `otdev_stage`: the owner's admin account exists (id 1,
argon2id m=65536 legacy hash → every login also exercises the ARGON2_VERIFY
sidecar; no 2FA enrolled); a synthetic m=19456 account that skips the
sidecar fails identically remote-side, so the sidecar is not the blocker.
Preview stays bound to the LAN path.

**Database topology (authoritative):** production runs on Supabase; every
non-production database (staging, preview) lives on the homelab and is
reached through Hyperdrive over the tunnel above. Supabase was never a
preview target or fallback — earlier notes saying so were mistaken.
Note: Hyperdrive resource `openthrone-db-preview` (`87241402`, the top-level
default binding in `wrangler.jsonc`) does point at a Supabase pooler host
despite its name; the `production` env binding is still a placeholder id.

**Root cause corrected (2026-10-14, late):** the remaining login failures are
not a Hyperdrive datapath fault. `wrangler tail` shows the failing requests
end with outcome `exceededCpu` / `Worker exceeded CPU time limit.` (HTTP 503),
and deploying `limits.cpu_ms` is refused with *"CPU limits are not supported
for the Free plan"* (code 100328): the account runs on the **Workers Free
plan, 10 ms CPU per request**. Every credentials login runs argon2 (CPU-bound
by design), and ordinary Next.js + Prisma requests measure 80-900 ms CPU, so
they pass only inside the Free plan's burst allowance and fail once it is
spent. That explains every earlier observation: local `wrangler dev` (no CPU
limit) always works, Hyperdrive validation (no Worker CPU) always connects,
and failure rates did not change when the database path was rebuilt.
**Resolved 2026-10-15:** the account moved to Workers Paid and the preview
was redeployed (version `d0c40565`). A Worker version keeps the CPU limit of
the plan it was uploaded under — the pre-upgrade version still killed requests
at exactly 1000 ms CPU, the redeployed one did not (4118 requests at
concurrency 30, 0 errors; synthetic register + repeated logins all 200 with a
session cookie). After any plan change, redeploy every Worker, including the
`openthrone-argon2` sidecar. No Hyperdrive or tunnel change was needed. Separately, `src/lib/prisma.ts` now
creates one Prisma client per Worker request — workerd binds sockets to the
request that opened them, so the former isolate-wide client could throw
cross-request I/O errors (1101) or hang when reused by a later request.
