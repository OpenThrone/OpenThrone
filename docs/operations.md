# Scheduled tasks and bots

The custom server does not schedule these jobs. Configure an external scheduler to POST to the cron endpoints.

Each endpoint requires its enable flag to equal `true` and an `Authorization` header containing the raw `TASK_SECRET` value (no `Bearer` prefix). Set a nonempty secret in the server environment.

| Endpoint | Enable flag | Schedule |
| --- | --- | --- |
| `/api/cronJobs/daily` | `DO_DAILY_UPDATES` | Daily |
| `/api/cronJobs/turns` | `DO_TURN_UPDATES` | Match `TURN_INTERVAL_MINUTES` (default 30) |
| `/api/cronJobs/bots` | `DO_BOT_UPDATES` | Daily, after citizen growth |
| `/api/cronJobs/accountStatus` | `DO_TURN_UPDATES` | Choose an account-status maintenance cadence |

Example crontab entries (replace host and secret placeholders):

```cron
0 0 * * * /usr/bin/curl --fail -X POST -H "Authorization: <TASK_SECRET>" https://<host>/api/cronJobs/daily
*/30 * * * * /usr/bin/curl --fail -X POST -H "Authorization: <TASK_SECRET>" https://<host>/api/cronJobs/turns
30 0 * * * /usr/bin/curl --fail -X POST -H "Authorization: <TASK_SECRET>" https://<host>/api/cronJobs/bots
```

The daily job also grants every participating account the **Daily citizen bonus** from **Administration → Server settings** (`era.dailyCitizenBonus`, default 0) on top of the per-player recruit bonus. Only accounts with gameplay activity within the **Daily citizen bonus activity window** (`era.dailyCitizenBonusActivityHours`, default 24; 0 disables the check) receive it. Gameplay activity means a bank deposit, training or untraining units, buying or selling armory items, an attack, a spy mission, or a fort repair; each stamps `users.last_gameplay_at`, which an era reset clears. The recruit bonus is unaffected. Values are read once per run and recorded in each `DAILY_RECRUIT` bank-history entry.

Changing `TURN_INTERVAL_MINUTES` changes the application interval, not the external scheduler. Keep both aligned. Inspect [cron handlers](../src/pages/api/cronJobs) for current task behavior.

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

`NEXT_PUBLIC_DISABLE_LOGIN=true` permits only accounts with unrevoked ADMINISTRATOR or MODERATOR staff assignments to enter the game. Credential validation checks this before status/activity writes; existing sessions and new socket connections also recheck access. Impersonation of a blocked non-staff target is rejected. Rebuild/redeploy when changing this public environment setting; existing connections should be restarted during the rollout.

Daily and turn processing, attack-user lists, public player counts, current community leaderboards and comparison rankings require a non-system account assigned to the current era with `last_active` on/after its start. During disabled login they additionally require an active staff role. These filters do not change archived era snapshots. Normal vacation gold behavior continues for qualifying era participants when login is open; verify maintenance economics before rollout.

The activity update endpoint only updates its authenticated session owner. Gameplay data reads reject blocked targets before refreshing activity or initializing era state. Comparison cache keys include era and disabled-login mode; community stats use the existing ISR lifecycle and should be refreshed after deployment.

Older failed logins may already have written activity, LOGIN audit entries and subsequent rewards. Those entries cannot prove admission. [Forgejo issue #11](http://192.168.4.3:3000/dastacomann/OpenThrone/issues/11) tracks a reviewed correction plan before reopening login. No production data cleanup is included in the source patch.

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

## Scheduled Era resets

The custom Bun server now polls database-backed Era reset schedules automatically; the turn/daily cron jobs above remain externally scheduled. Admins configure a reset under **Administration → Eras → Schedule reset**. See [current-era-reset.md](current-era-reset.md) for reset scope, player notices, cancellation, failure recovery, and deployment details.

Deployments using plain `next start` need a separate supervised `bun run era-reset-worker` process. At the announced UTC time, logins close; the reset runs after a 35-second access-cache drain. Restarted workers pick up overdue schedules. Keep at least one worker running and monitor failures before relying on an announced deadline.

### Email lifecycle secrets

Configure `IDENTITY_HASH_SECRET` for keyed identity retention/suppression hashes and
`EMAIL_UNSUBSCRIBE_SECRET` for signing unsubscribe links. Public development defaults
are limited to development/test; staging and production must configure secrets.
New hashes use `IDENTITY_HASH_SECRET ?? ANTI_ABUSE_SALT`. Setting
`IDENTITY_HASH_SECRET` to the existing `ANTI_ABUSE_SALT` value is **not required**:
legacy lookups still use `getAntiAbuseHash` unchanged. Missing configuration disables
registration and prevents the email outbox worker from starting.

`SMTP_SECURE` controls implicit TLS for the shared email transport. Secure transport and certificate verification are enabled by default; only an explicit `SMTP_SECURE=false` opts out of implicit TLS. The transport is initialized on first use.
