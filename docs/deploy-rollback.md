# Deploy rollback and observability runbook (Cloudflare Workers)

Operational companion to the deploy/observe/rollback sketch in
[operations](operations.md#deploy-observe-roll-back) (issue #22, part 2 of
2). Targets: the preview Worker `openthrone-preview`
(`wrangler.jsonc:51`) at the preview Worker (`<preview Worker URL>`)
(`wrangler.jsonc:79`) and the production Worker `openthrone`
(`wrangler.jsonc:92`; top-level name `wrangler.jsonc:3`). The deploy smoke
suite referenced throughout is `scripts/smoke-deploy.ts` (issue #22, part 1);
the draft CI gate that runs it is `.forgejo/workflows/cloudflare-ci.yaml`.

External command behavior cited below is from the Cloudflare documentation:
[rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/),
[wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/workers/),
[real-time logs](https://developers.cloudflare.com/workers/observability/logs/real-time-logs/),
[errors / Workers Logs filters](https://developers.cloudflare.com/workers/observability/errors/).

## Rollback procedure

### 1. Identify the last-known-good version

```sh
bunx wrangler deployments list --env preview    # or --env production
```

- Shows the 10 most recent **deployments** with `Version ID`, `Created on`,
  `Author` and `Source`; `--json` is available for scripting (wrangler
  commands doc). The active deployment is the newest entry.
- Last-known-good = the version deployed immediately before the first bad
  deployment. Confirm the choice with evidence, not guesswork: the smoke
  suite (below) proves the candidate still serves the critical routes, and
  `wrangler tail` (see [observability](#observability-pointers)) proves the
  incident window aligns with the bad deployment's `Created on`.
- Rollback targets are limited to the 100 most recently published versions
  (Cloudflare rollbacks doc) — older than that requires a forward deploy of
  the old commit instead (`bun run cloudflare:deploy:preview` /
  `cloudflare:deploy:production`, `package.json:16-17`).

### 2. Roll back

```sh
bunx wrangler rollback <VERSION_ID> --env preview --message "reason: <incident>"
```

- A rollback **immediately creates a new deployment** whose version is the
  one you named and makes it active on all routes and domains; code and
  static assets roll back together (`operations.md:129`, Cloudflare
  rollbacks doc).
- Without a `VERSION_ID` the command defaults to the version uploaded before
  the latest; `--message` records the reason and skips the interactive
  confirmation prompt (wrangler commands doc). Scripts and drills should
  always pass `--message` so they never block on a prompt.
- A rollback is refused if bound resources were deleted or modified between
  the two versions (Cloudflare rollbacks doc). For this Worker the relevant
  bindings are the `WORKER_SELF_REFERENCE` / `ARGON2_VERIFY` services and
  `HYPERDRIVE` (`wrangler.jsonc:27-44`, preview `:52-77`, production
  `:93-108`).

### 3. What rollback does NOT cover

1. **Database schema — forward-only.** Migrations are an operator-run,
   once-per-release step applied *before* deploying new code
   (`scripts/db-migrate.ts:4-7`; `operations.md:127`), and the migration CLI
   deliberately exposes only `status` and `apply`
   (`scripts/db-migrate.ts:44`) — there is no down/rollback subcommand.
   `wrangler rollback` therefore reverts code and assets, never the schema:
   the rolled-back release runs against the newer schema. The practical rule
   follows from the deploy order: keep migrations backward-compatible with
   the release you would roll back to, because the migrate-before-deploy
   sequence (`operations.md:127`) is the only pairing the tooling supports.
2. **Out-of-band environment state.** Worker secrets (`wrangler secret put`,
   `operations.md:120-121`), the Hyperdrive resources themselves
   (`wrangler.jsonc:33-44`) and dashboard-managed settings are not carried by
   a version rollback — anything rotated since the target version stays in
   effect. When the rollback motive is a config change, re-verify the secret
   and var set against the target release before rolling back.
3. **Data already written by the bad release.** Rollback stops new damage; it
   does not undo rows. Cron side effects are the sharp edge here: `turns`
   and `daily` have no per-run ledger and re-runs double-apply ticks
   (`docs/scheduled-jobs.md:41-44`, `:58-62`). Data repair is manual SQL and
   outside this runbook.
4. **A bad migration.** Same as (1): the schema is forward-only, so the
   remedy is a new forward-fix migration plus a code deploy — never a
   rollback.

## Rollback drill (preview)

Exercise this quarterly and after any change to the deploy pipeline. The
orchestrator runs it on the preview environment; builds are serialized
centrally, so do not run it while a CI build is in flight.

**Preconditions**

- Repo root as working directory; `bun`/`bunx` on PATH.
- The preview Worker has at least two deployments. If it has only one, create
  the second with `bun run cloudflare:deploy:preview` (`package.json:16`).
- The drill only switches which version serves traffic: preview deliberately
  runs **no cron triggers** (`wrangler.jsonc:47-48`, `:64-66`), so no
  scheduled job fires mid-drill, and every smoke check is a read-only GET
  (pinned in `scripts/smoke-deploy.test.ts:62-71`).

In the steps below, `$NEW` is the currently active version id and `$PREV`
the version deployed immediately before it, both recorded in step 2.

**Step 1 — baseline smoke**

```sh
bun scripts/smoke-deploy.ts
```

Expected stdout (first line `scripts/smoke-deploy.ts:440`, per-check lines
`:343-351`, summary `:353-360`; the 10 checks are pinned in
`scripts/smoke-deploy.test.ts:45-59`; exit code `:339-340`):

```text
OpenThrone deploy smoke: <preview Worker URL>
PASS  home                            200    <n>ms
… (9 further PASS lines)
OK 10/10 smoke checks passed against <preview Worker URL>
```

Exit code 0. Any FAIL line aborts the drill — the current deployment is
already unhealthy; fix that first.

**Step 2 — record the two most recent versions**

```sh
bunx wrangler deployments list --env preview
```

Expected: the deployment table with `Version ID`, `Created on`, `Author`,
`Source` (wrangler commands doc). Record the top entry's version id as
`$NEW` and the next one as `$PREV`. Do not script against the table prose —
use `--json` if you need machine-readable ids.

**Step 3 — roll back to `$PREV`**

```sh
bunx wrangler rollback <PREV> --env preview --message "rollback drill: issue #22"
```

Expected: exit 0, no interactive prompt (`--message` suppresses it). The
success wording varies across wrangler versions — verify with the next step
instead of trusting the message.

**Step 4 — verify the active version changed**

```sh
bunx wrangler deployments list --env preview
```

Expected: a **new** deployment on top, `Created on` ≈ now, whose `Version ID`
is `$PREV` — a rollback is itself a new deployment of the old version
(Cloudflare rollbacks doc).

**Step 5 — smoke the rolled-back Worker**

```sh
bun scripts/smoke-deploy.ts
```

Expected: the same `OK 10/10 smoke checks passed against
<preview Worker URL>` line, exit 0. The suite pins
behavior observed live (`scripts/smoke-deploy.ts:21-25`), so a genuine
last-known-good passes the same bar. If it does not, `$PREV` was not
healthy either: pick the next-older version and repeat from step 3.

**Step 6 — restore the newer version**

```sh
bunx wrangler rollback <NEW> --env preview --message "rollback drill: restore"
```

Expected: exit 0. Rolling forward is the same operation — selecting a
version creates a new deployment (Cloudflare rollbacks doc).

**Step 7 — final verification**

```sh
bunx wrangler deployments list --env preview
bun scripts/smoke-deploy.ts
```

Expected: top deployment carries `$NEW` with a fresh `Created on`, and the
smoke run again prints `OK 10/10 …` with exit 0.

**Pass criteria:** steps 1, 5 and 7 all exit 0 with the `OK 10/10` line;
steps 4 and 7 show the expected top-of-table version; the Worker is left
serving `$NEW`.

## Structured logging conventions for the worker

The deployment has two log emitters today. New code follows the field
conventions below.

**Emitter 1 — app logger (`src/utils/logger.ts`)**, used by API routes and
services:

- Entry shape `LogEntry { level, message, params, timestamp }`
  (`src/utils/logger.ts:30-36`).
- Console rendering: `[<ISO-8601 UTC>] [<LEVEL>] <message> - <params>`
  (`src/utils/logger.ts:76`); params are space-joined, objects
  JSON-stringified, `Error`s rendered as `{ name, message, stack }`
  (`src/utils/logger.ts:79-95`).
- Level gate: server reads `LOG_LEVEL`, client `NEXT_PUBLIC_LOG_LEVEL`,
  default `INFO` (`src/utils/logger.ts:15-17`, `:22-28`); severity order
  `ERROR(0) … TRACE(4)` (`src/utils/logger.ts:3-9`).
- Structured context rides as the first params object — the established
  pattern is `logError('Unhandled API guard error', { requestId, route,
  method, error })` (`src/middleware/apiGuard.ts:327-332`).

**Emitter 2 — the scheduled entry (`worker.ts` → `src/lib/workerCron.ts`)**,
which logs to `console`, not the logger: console is Workers' log stream
(`wrangler tail` and the dashboard) and the fan-out is a zero-import module
so the wrangler esbuild bundle needs no path aliases
(`src/lib/workerCron.ts:91-92`, `worker.ts:62-64`). Every line carries the
`[scheduled]` prefix:

| Line | Meaning | Source |
| --- | --- | --- |
| `[scheduled] <label> (<path>) ok` | endpoint answered 2xx | `src/lib/workerCron.ts:120-122` |
| `[scheduled] <label> (<path>) failed: <status or WORKER_SELF_REFERENCE binding missing>` | non-ok answer or missing binding | `src/lib/workerCron.ts:124-128` |
| `[scheduled] <label> (<path>) threw <error>` | the fetch call rejected | `src/lib/workerCron.ts:136-139` |
| `[scheduled] TASK_SECRET is not set …` | cron endpoints will refuse the call | `src/lib/workerCron.ts:101-104` |
| `[scheduled] no route mapped for cron "<expr>"` | wrangler cron with no `CRON_TARGETS` match | `src/lib/workerCron.ts:163` |

Labels and paths come from `CRON_TARGETS` (`src/lib/workerCron.ts:35-44`),
which must stay in sync with `wrangler.jsonc` `triggers.crons`
(`wrangler.jsonc:15-22`).

**Standard fields.** Use these names when adding worker-side logging so tail
output stays greppable:

| Field | Convention | Status today |
| --- | --- | --- |
| `route` | Request path (URL) for HTTP, endpoint path for cron. | Emitted by the guard as `route: req.url` (`src/middleware/apiGuard.ts:329`); the cron lines embed the path in parentheses (`src/lib/workerCron.ts:121`, `:125`). |
| `status` | Integer HTTP status; 2xx means ok. | Cron `failed:` lines carry it (`src/lib/workerCron.ts:124-128`); ok is implicit at `:120-122`. |
| `durationMs` | Integer milliseconds, matching the smoke suite's per-check field name (`scripts/smoke-deploy.ts:91`, computed at `:411`, printed at `:343-351`). | No worker-side per-request duration emitter exists today; add one only where an SLO is actually watched. |
| `requestId` | UUID; honor inbound `x-request-id`, else `randomUUID()`, echo it in the `X-Request-Id` response header (`src/middleware/apiGuard.ts:116-118`), thread it into handlers as `context.requestId` (`src/middleware/apiGuard.ts:77`, `:316-317`) and include it in 500 payloads (`src/middleware/apiGuard.ts:333-336`). | Convention: every API-route error log includes it; correlate a user report to logs via the response header. |
| `level`, `timestamp` | Five-value level set (`src/utils/logger.ts:3-9`), ISO-8601 UTC timestamp (`src/utils/logger.ts:36`, `:76`). | Logger entries carry both; cron console lines carry neither — the platform attaches `eventTimestamp` to every tail event (Cloudflare real-time logs doc), so console lines stay lean. |
| `deploy-version` | **Platform-sourced, not an app field.** No version variable exists in the env mapping (`docs/cloudflare-modernization.md:52-63`) or the preview vars (`wrangler.jsonc:78-89`). The deploy version is the Workers **Version ID** attached to each invocation; correlate with it via `wrangler deployments list` and `wrangler tail --version-id` (wrangler commands doc). | If an app-level field is ever added, inject it as a wrangler var at deploy time — never hardcode it, never store it as a secret. |

## Observability pointers

**Errors.**

```sh
bunx wrangler tail --env production --status error
```

`--status` filters by invocation outcome (`ok | error | canceled`); JSON
events expose `exceptions[]` and `logs[]` (wrangler commands doc,
real-time logs doc). In the dashboard's Workers Logs, filter with
`$metadata.error EXISTS` or `$workers.outcome = "exception"` (Cloudflare
errors doc). Repo baseline: plain `wrangler tail --env production` with the
`[scheduled]` result lines is documented at `operations.md:128`.

**Cron activity.**

```sh
bunx wrangler tail --env production --search '[scheduled]'
```

`--search` matches console.log text (wrangler commands doc), and every cron
fan-out line starts with `[scheduled]` (`src/lib/workerCron.ts:121-139`,
`:163`). Production only — preview has no cron triggers by design
(`wrangler.jsonc:64-66`; `operations.md:134`). Two caveats from
[incident jobs](scheduled-jobs.md):

- **Past Cron Events is not a failure signal**: the fan-out catches every
  per-target error so the `waitUntil` promise never rejects, and invocations
  are always recorded as successes — the log stream is the only failure
  signal (`docs/scheduled-jobs.md:78-84`, `:95-98`).
- **Nothing alerts automatically**: no watcher exists on the
  `[scheduled] ... failed:` lines; detection is a human tailing
  (`docs/scheduled-jobs.md:99-101`).

**Correlating a deploy version with an incident window.**

1. `bunx wrangler deployments list --env production` — note each deployment's
   `Version ID` and `Created on` (wrangler commands doc).
2. The version active during window `[T1, T2]` is the version of the newest
   deployment whose `Created on` ≤ T1. Use **deployment** timestamps, not
   version upload order: a rollback is itself a new deployment of an old
   version (Cloudflare rollbacks doc), so upload order and serving order
   diverge exactly when a rollback has happened.
3. Confirm attribution live: `bunx wrangler tail --env production
   --version-id <VERSION_ID> --status error` — `--version-id` filters the
   tail to that Worker version (wrangler commands doc).
4. If errors predate the newest deployment inside the window, step down to
   the next-older deployment's version: the incident predates the last code
   change (config or data cause) and a rollback would not help — see the
   not-covered list above.
5. After any rollback: re-run the smoke suite (`bun scripts/smoke-deploy.ts`
   for preview, `--base-url <url>` for other targets, `scripts/smoke-deploy.ts:28-35`)
   and tail `--search '[scheduled]'` across one `*/30` turn tick
   (`wrangler.jsonc:17`) on production to confirm scheduled health returned.
