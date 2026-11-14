# Scheduled tasks and bots

The custom server does not schedule these jobs. Configure an external scheduler to POST to the cron endpoints.

> **Cloudflare deployments:** when the app runs on Workers, Cloudflare Cron
> Triggers call these same endpoints automatically via `worker.ts`
> (`scheduled()` fans out through the `WORKER_SELF_REFERENCE` service binding
> with the raw `TASK_SECRET` header). Cadences: turns every 30 minutes,
> daily 04:00 UTC, bots 04:30 UTC, account status 05:00 UTC — declared in
> `wrangler.jsonc`. The external `curl` crontab below remains a fully
> supported alternative; use one or the other, never both. The preview
> environment intentionally has no cron triggers. See
> [Cloudflare deployment](#cloudflare-deployment) below.


Each endpoint requires its enable flag to equal `true` and an `Authorization` header containing the raw `TASK_SECRET` value (no `Bearer` prefix). Set a nonempty secret in the server environment.

| Endpoint | Enable flag | Schedule |
| --- | --- | --- |
| `/api/cronJobs/daily` | `DO_DAILY_UPDATES` | Daily |
| `/api/cronJobs/turns` | `DO_TURN_UPDATES` | Match `TURN_INTERVAL_MINUTES` (default 30) |
| `/api/cronJobs/bots` | `DO_BOT_UPDATES` | Daily, after citizen growth |
| `/api/cronJobs/accountStatus` | `DO_TURN_UPDATES` | Choose an account-status maintenance cadence |
| `/api/cronJobs/chatModeration` | `DO_TURN_UPDATES` | Every 30 minutes; does nothing until the `moderation.shadowEnabled` setting is on ([decision models](features/decision-models.md)) |

Example crontab entries (replace host and secret placeholders). On the host that runs the app, point `<host>` at the app's own local address (`http://127.0.0.1:<app port>`), not the public domain: a crontab that calls the public domain follows any DNS change, so moving the domain to a Worker with the `DO_*` flags off would silently stop turns and daily updates. Production's crontab was pinned to its local address on 2026-11-11.

```cron
0 0 * * * /usr/bin/curl --fail -X POST -H "Authorization: <TASK_SECRET>" https://<host>/api/cronJobs/daily
*/30 * * * * /usr/bin/curl --fail -X POST -H "Authorization: <TASK_SECRET>" https://<host>/api/cronJobs/turns
30 0 * * * /usr/bin/curl --fail -X POST -H "Authorization: <TASK_SECRET>" https://<host>/api/cronJobs/bots
```

The daily job also grants every participating account any **Daily citizen bonus** set by the active [game events](mechanics/game-events.md) (`dailyCitizenBonus`) on top of the per-player recruit bonus. Only accounts with gameplay activity within the event's activity window (`dailyCitizenActivityHours`, default 24; 0 disables the check) receive it. Gameplay activity means a bank deposit, training or untraining units, buying or selling armory items, an attack, a spy mission, or a fort repair; each stamps `users.last_gameplay_at`, which an era reset clears. The recruit bonus is unaffected. Values are read once per run and recorded in each `DAILY_RECRUIT` bank-history entry.

Changing `TURN_INTERVAL_MINUTES` changes the application interval, not the external scheduler. Keep both aligned. Inspect [cron handlers](../src/pages/api/cronJobs) for current task behavior.

## Run log

Every authorized invocation of these endpoints is recorded in the `CronRun` table: job name, start, finish, duration, a sanitized summary (counts only; never secrets, headers or environment values) and, on failure, the truncated error message. Staff can read the log under **Administration → System → Cron run log** (`/home/admin/cron-runs`), filter it by job and status, and see the last successful run per job. Failures are highlighted.

Rows older than 90 days are deleted by the daily job. Invocations that are rejected (missing or wrong scheduler secret) or disabled via the endpoint's `DO_*` flag record nothing: the job never ran, and a row per rejected tick would only add noise. A row can stay `RUNNING` for two reasons: the process died mid-run, or the start insert was lost or stalled past the 2-second log bound and could not be closed (a start insert that lands late is closed with the job's final status in the background, so this is rare). The admin page shows a `RUNNING` row older than 2 hours as **Stale / unknown**; such rows are pruned with everything else after 90 days. Log writes the job waits on are bounded to 2 seconds and fail open, so logging can never hold a job up. The in-process workers (scheduled era resets, temporary forces, Discord and email outbox) are continuous poll loops, not scheduled jobs, and are not recorded; their failures go to the server log.

## Bots

Provision bots with `bun run scripts/seed-bots.ts`; configuration lives in [bot manifests](../config/bots/manifests) and [schedules](../config/bots/schedules). Set `BOT_DEFAULT_PASSWORD` for provisioning. Bots are user rows marked `isBot=true`.

The bot cron accepts `?schedule=<name>`; the default schedule is `default`. Admin-session endpoints:

- `POST /api/admin/bots/provision`: `{ manifest?: string, dryRun?: boolean }`
- `GET /api/admin/bots/status`: roster and last-run summary
- `POST /api/admin/bots/run-now`: `{ schedule?: string }`

For local non-bot combat fixtures, see [development seeding](../README.md#development-seeding-bun-run-devseed).

## Staff two-factor authentication

`OT_ENFORCE_PRIVILEGED_2FA` controls whether administrators and moderators must
already be enrolled before signing in. It defaults to `true` when unset. The
local development `.env` and `.env.sample` explicitly set it to `false` so staff
can sign in and complete enrollment. This does not bypass code verification for
accounts that already have an authenticator configured.

For initial enrollment:

1. Set `OT_ENFORCE_PRIVILEGED_2FA=false` and restart the application.
2. Sign in normally. Unenrolled staff are directed to Settings → Two-Factor
   Authentication; other users can visit `/home/settings` themselves.
3. Select **Enable 2FA**, scan the QR code or enter the setup key in an
   authenticator app, then confirm its six-digit code. Only successful
   confirmation enables 2FA. Canceling or abandoning setup leaves sign-in
   unchanged; setup tokens expire after ten minutes.
4. Enrolled users enter their authenticator code in the login form.
5. After all required staff have enrolled, set `OT_ENFORCE_PRIVILEGED_2FA=true`
   and restart. Enforced staff accounts cannot disable their authenticator.

The setup token is encrypted, time-limited, account-bound, and cannot overwrite
an existing authenticator. The public user DTO exposes only `twoFactorEnabled`,
not the authenticator secret.

Sessions also validate account ID and email against the current database. After
an alpha database replacement, sessions for deleted accounts or reused IDs are
expired rather than triggering repeated player-data failures. `/auth/logout`
uses NextAuth's normal sign-out flow for compatibility with older links.


## Disabled login and current-era participation

`NEXT_PUBLIC_DISABLE_LOGIN=true` permits only accounts with unrevoked ADMINISTRATOR or MODERATOR staff assignments to enter the game. Credential validation checks this before status/activity writes; existing sessions and new socket connections also recheck access. Impersonation of a blocked non-staff target is rejected. The `DISABLE_LOGIN` runtime setting overrides this environment value without a rebuild; the environment value is only the fallback. See [runtime settings](mechanics/runtime-settings.md).

Daily and turn processing, attack-user lists, public player counts, current community leaderboards and comparison rankings require a non-system account assigned to the current era with `last_active` on/after its start. During disabled login they additionally require an active staff role. These filters do not change archived era snapshots. Normal vacation gold behavior continues for qualifying era participants when login is open; verify maintenance economics before rollout.

The activity update endpoint only updates its authenticated session owner. Gameplay data reads reject blocked targets before refreshing activity or initializing era state. Comparison cache keys include era and disabled-login mode; community stats use the existing ISR lifecycle and should be refreshed after deployment.

Older failed logins may already have written activity, LOGIN audit entries and subsequent rewards. Those entries cannot prove admission. Forgejo issue #11 tracks a reviewed correction plan before reopening login. No production data cleanup is included in the source patch.

## Client IP and trusted proxies

Login throttling, API rate limits, registration and audit logs use the client
IP from `resolveClientIp` (`src/utils/ipUtils.ts`). Forwarded headers are read
only when the TCP peer is a trusted proxy: loopback (`127.0.0.1`, `::1`, e.g.
cloudflared or nginx on the same host) plus `TRUSTED_PROXY_IPS`, a
comma-separated list of addresses or CIDR ranges
(`10.0.0.5, 172.16.0.0/12, 2001:db8::/32`).

From a trusted peer the client is `cf-connecting-ip` if present, otherwise the
first untrusted hop of `X-Forwarded-For` read from the right (trusted proxy
hops are skipped); otherwise the socket address is used.

On Cloudflare Workers (`navigator.userAgent === 'Cloudflare-Workers'`,
`isCloudflareWorkersRuntime`) `cf-connecting-ip` is used first, from any peer:
every request arrives through Cloudflare's edge, which sets it, and there is no
TCP peer. workerd's `node:http` `IncomingMessage` ignores the socket OpenNext
passes in, so `req.socket.remoteAddress` is always undefined there. Until
v0.14.2 every Worker request resolved to no IP: external recruit links
answered "Client address unavailable", anonymous rate limits shared the
`ip:unknown` bucket and audit rows had no address.

- Behind Cloudflare (tunnel or proxied DNS) nothing else is needed for a
  same-host tunnel. If the origin is reached directly from Cloudflare edges,
  list Cloudflare's published ranges in `TRUSTED_PROXY_IPS` and firewall the
  origin to them.
- Behind nginx (or another proxy) that is not Cloudflare, append to
  `X-Forwarded-For` (`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`)
  and clear any client-sent `cf-connecting-ip`
  (`proxy_set_header CF-Connecting-IP "";`), because it takes precedence.
- If the IP cannot be resolved, the per-IP login budgets are skipped; the
  per-account budget still applies.

## Cloudflare deployment

The Workers deployment path uses OpenNext (`bun run cloudflare:*` scripts) with a custom entry (`worker.ts`) that adds the Cron Trigger fan-out. Realtime (Socket.IO) is disabled on this target: build with `NEXT_PUBLIC_DISABLE_SOCKET=true`; messaging runs read-only over HTTP and the Node + Socket.IO server remains the local development runtime.

### One-time setup (per environment)

1. Create the Hyperdrive resource and put its id into `wrangler.jsonc` (`env.<name>.hyperdrive[0].id`):
   `bunx wrangler hyperdrive create openthrone-db-<env> --connection-string="<POSTGRES_PRISMA_URL>" --caching-disabled`
   Query caching must stay off (`bunx wrangler hyperdrive get <id>` shows `"caching": {"disabled": true}`). With Cloudflare's default (on, about 60 s), reads outside a transaction return the row as it was before a player's own write, so the sidebar kept showing old troops and gold after training until the cache expired. The production and preview configs were switched off on 2026-11-11 (`bunx wrangler hyperdrive update <id> --caching-disabled`).
2. Set secrets (`bunx wrangler secret put <NAME> --env <preview|production>`):
   `NEXTAUTH_SECRET`, `JWT_SECRET`, `TASK_SECRET`, `TURNSTILE_SECRET`, `ALTCHA_HMAC_KEY`, `API_TOKEN_PEPPER`, `ANTI_ABUSE_SALT`, and — when `MAIL_DRIVER=http` — `MAIL_PROVIDER_API_KEY`. SMTP variables are Node-only. A Worker that shares a database with a Node host must use that host's secret values, and must not set `NEXTAUTH_SECRET` when the host does not (it takes precedence over `JWT_SECRET` as the encryption key for 2FA secrets and sealed replays).
3. Set plain vars (`wrangler.jsonc` per-env `vars` or `wrangler vars put`): `NEXTAUTH_URL`, `NEXT_PUBLIC_URL_ROOT`, `DO_TURN_UPDATES`/`DO_DAILY_UPDATES`/`DO_BOT_UPDATES` (production only), `TURN_INTERVAL_MINUTES` (keep aligned with the `*/30` cron), `MAIL_DRIVER` (`cloudflare` sends through the Email Service `send_email` binding `EMAIL`, from `MAIL_FROM`), `MAIL_FROM`.
4. Build-time values (`NEXT_PUBLIC_DISABLE_SOCKET`, other `NEXT_PUBLIC_*`) are inlined by `next build` — they must be present in the build environment, not just the Worker's runtime env. Rehearsal and production take them from `config/cloudflare/<env>.env` via `bun run cloudflare:build:<env>`, which refuses to build if a local `.env` would add others.

### Deploy, observe, roll back

- Deploy: `bun run cloudflare:deploy:production` (or `:preview`). Apply pending Prisma migrations **before** deploying new code (`bunx prisma migrate deploy` against `POSTGRES_URL_NON_POOLING`).
- Streams: `bunx wrangler tail --env production`. Scheduled results and per-target statuses appear as `[scheduled] …` log lines.
- Roll back: `bunx wrangler deployments list --env production` then `bunx wrangler rollback <deployment-id> --env production` (or `wrangler versions rollback`). Static assets and Worker versions roll back together.
- Cutover smoke checklist: `/` and `/account/login` render; register/login with Turnstile; recruit/train/bank/armory round-trip; attack + spy against a seeded player; turn accrual after the next `*/30` tick; password-reset email arrives; admin panel loads; unknown URL renders the 404 page.

### Domain routing

Since 2026-11-12 the production Worker serves `openthrone.dev` through the route
`openthrone.dev/*` (`wrangler.jsonc`, `env.production.routes`). The zone is
proxied by Cloudflare, so the route takes the traffic at the edge with no DNS
change, and the production host stays up behind it as the rollback origin. Keep
it deployed with each release and its scheduled jobs off, since the Worker runs
them.

- **Attach or change routes without redeploying code:** `bunx wrangler triggers deploy --env production`. It publishes the routes and Cron Triggers in `wrangler.jsonc` for the version already deployed.
- **Roll back to the production host:** set the production `routes` to the parking route `[{ "pattern": "stage.openthrone.dev/__route-parking*", "zone_name": "openthrone.dev" }]` and run the same command. Cloudflare sends `openthrone.dev` back to the host within seconds. Do not use `"routes": []` for this: wrangler skips route publishing for an empty list, so the live route stays. Dashboard fallback: the zone's Workers Routes page, delete `openthrone.dev/*`. Drilled on stage on 2026-11-12.
- **Tell them apart:** the footer shows the build commit. Check it after either move.
- **`www.openthrone.dev`** is the `openthrone-www-redirect` Worker (`cloudflare/www-redirect/`, `bun run cloudflare:deploy:www`). Its custom domain creates the DNS record and certificate, and it answers every request with a 301 to the same path on `openthrone.dev`, whichever origin serves the apex.

### Cautions

- Preview has **no cron triggers** on purpose — if preview points at the production database, scheduled jobs would double-apply turns/daily effects. Give preview its own database or keep its `DO_*` flags off.
- The external `curl` crontab and the Cron Triggers both drive the same endpoints; running both double-applies ticks. Pick one per database.
- Avatar uploads return 503 unless S3 mode is configured (`AWS_*` + `NEXT_PUBLIC_USE_AWS`) — the local-disk mode cannot run on Workers.

## LAN database path (LAN Docker host)

The preview Hyperdrive (`openthrone-db-lan`) reaches the staging Postgres
(<staging database host>:5432, `otdev_stage`) through a chain owned entirely by us:

```
Worker → Hyperdrive → VPC service openthrone-pg → private-lan tunnel
       → the LAN Docker host /opt/private-lan (compose project `private-lan`):
          private-lan-cloudflared (tunnel connector, token in tunnel-token.env)
          private-lan-pg-tls      (PgBouncer: client TLS :5433 → plain backend)
       → <staging database host>:5432
```

- PgBouncer is required: Postgres TLS is protocol-negotiated (SSLRequest),
  which TLS-first proxies cannot serve, and the origin Postgres has SSL
  disabled. Its config/userlist live in `/opt/private-lan` (root-owned; the
  userlist holds the ot-dev password — keep it 600).
- The connector token can be rotated from the dashboard tunnel page; update
  `tunnel-token.env` and `docker compose restart cloudflared` in `/opt/private-lan`.
- If Hyperdrive reports origin TLS errors, check `docker logs private-lan-pg-tls`
  first, then the origin Postgres.
## Scheduled Era resets

The custom Bun server now polls database-backed Era reset schedules automatically; the turn/daily cron jobs above remain externally scheduled. Admins configure a reset under **Administration → Eras → Schedule reset**. See [Eras and era resets](mechanics/era-reset.md) for reset scope, player notices, cancellation, failure recovery, and deployment details.

Deployments using plain `next start` need a separate supervised `bun run era-reset-worker` process. At the announced UTC time, logins close; the reset runs after a 35-second access-cache drain. Restarted workers pick up overdue schedules. Keep at least one worker running and monitor failures before relying on an announced deadline.

### Email lifecycle secrets

Configure `IDENTITY_HASH_SECRET` for keyed identity retention/suppression hashes and
`EMAIL_UNSUBSCRIBE_SECRET` for signing unsubscribe links. Public development defaults
are limited to development/test; staging and production must configure secrets.
New hashes use `IDENTITY_HASH_SECRET ?? ANTI_ABUSE_SALT`. Setting
`IDENTITY_HASH_SECRET` to the existing `ANTI_ABUSE_SALT` value is **not required**:
legacy lookups still use `getAntiAbuseHash` unchanged. Missing configuration disables
registration and prevents the email outbox worker from starting.

Decision models (shadow chat moderation) read `DECISION_PROVIDER` (`heuristic` default or `systemone`), `DECISION_API_BASE_URL`, `DECISION_MODEL`, optionally `DECISION_TIMEOUT_MS`, and, as a secret, `DECISION_API_KEY`; see [decision models](features/decision-models.md), including the privacy notice needed before a hosted provider is used.

`SMTP_SECURE` controls implicit TLS for the shared email transport. Secure transport and certificate verification are enabled by default; only an explicit `SMTP_SECURE=false` opts out of implicit TLS. The transport is initialized on first use.
