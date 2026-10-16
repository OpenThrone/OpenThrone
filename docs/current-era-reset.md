# Reset the current Era

An Administrator can use **Administration → Eras → Reset current era now**. No manual login-setting change is needed, whether player logins are open or closed.

1. Open the current-era reset dialog. It shows starting gold, citizens and attack turns prefilled from the active Era's saved settings. Change them there if needed; the values you confirm are applied to every account and saved to the Era. The separate "Next Era Starting Settings" boxes are only for the next Era and are never used by a reset.
2. Leave **Enable logins after the reset** checked to reopen the realm afterward, or uncheck it to leave player logins closed.
3. Type the displayed `RESET ERA <id>` phrase and confirm.

Confirmation automatically closes player access and starts the same durable reset pipeline used by scheduled resets. The API returns `202 Accepted` once closure and the reset request commit. After the 35-second access-cache drain, the worker resets gameplay state and optionally reopens logins. The page reloads to show the reset-in-progress notice. A pending timed reset is replaced by this confirmed immediate reset; duplicate requests are rejected once a reset has started.

The action is Admin-only, rejects impersonation through the existing guard, and checks both Era ID and start timestamp. Closure and its required audit commit together; failure rolls them back. The reset, optional login opening and completion marker commit in a second transaction. A failure in that phase rolls it back, leaves player access closed and retries through the worker. Concurrent Era/login changes use the same lifecycle lock.

## Reset scope

- Keep the current era's ID, name and saved start settings; advance its start date. No completed-era snapshot is created and no testing achievements are credited.
- Reset every positive-ID account, including staff, to the saved era defaults: resources, normalized army/items/upgrades/bonus points, experience, wounded units and daily pressure. Clear player stat counters and rank; clear last activity so participation starts fresh.
- Clear gameplay histories from the discarded current-era period, including combat ACLs before attack logs, recruitment, personal banking and alliance banking. Remove current-era snapshots, current-era wars and all still-in-progress wars; cancel older pending friend gold requests.
- Reset alliance treasury, XP and upgrades. Preserve alliance identity, roster, roles and fee configuration. Clear transient recruiting sessions/cooldowns and current-era ranking caches.
- Preserve account identity, credentials, staff grants, moderation history, messages/social relationships, lifetime achievements and completed eras.

Queued turn/daily jobs recheck the era start timestamp and player participation after obtaining their row lock; work queued before reset is discarded. Recruitment limits start at the later of the current era's refreshed start date and the OT-day boundary, so old recruitment does not consume fresh quotas.

Maintenance is a separate switch. This action enables player logins but does not disable maintenance or alter scheduled event configuration. The era's date-based activity starts again at the reset time. Existing background jobs and staff sessions remain subject to their normal policies.

No deployment configuration or secret-file edit is needed. The combined action writes both registered database login overrides, so an old deployment `DISABLE_LOGIN` bootstrap value cannot keep logins disabled. Other processes pick up the committed state on their normal five-second config refresh.

## Scheduled reset while players explore

In **Administration → Eras → Schedule reset**, pick a date and time in OT Time (the viewer's local clock, as shown in the sidebar; the picker converts it to UTC and shows both), confirm the starting gold, citizens and attack turns (prefilled from the Era's saved settings and stored with the schedule), select whether to reopen logins afterward, and type the displayed `RESET ERA <id>` confirmation. The time must be at least one minute in the future. The saved schedule immediately appears as a non-dismissible banner throughout the shared layout, including the game and login pages. It reads **“Era will reset on DD/MM/YY HH:MM:SS UTC”** and explains that gameplay progress will be reset while accounts remain.

You can change the time or cancel while the schedule is pending. The UI detects another administrator's changes rather than overwriting them. Opening a new era invalidates the old schedule; it cannot later reset the replacement era. Confirming an immediate reset replaces a pending timed reset.

At the deadline the worker commits both `DISABLE_LOGIN` overrides and marks the reset as started. Existing guarded player sessions are blocked through the maintenance policy; active administrator/moderator recovery access remains available. It waits 35 seconds for other processes' runtime configuration caches (including their 30-second last-good fallback) to expire, then performs the same transactional reset as the manual action. The banner changes to **“Era reset in progress”**. The reset and completion marker commit together; failure rolls that phase back, leaves logins closed, and retries after 15 seconds. The separate maintenance switch is preserved.

The database stores the schedule in a private, non-editable `ServerSetting` row. No schema migration is needed. The lifecycle advisory lock prevents duplicate execution across worker processes. An overdue pending/started reset resumes after restart. The announced time starts the reset window; completion takes at least the 35-second drain interval plus the time needed to reset the accounts. If the worker is offline, execution starts when it returns.

### Worker deployment

The custom Bun server (`bun run dev`, including the existing PM2 configuration) starts the worker automatically. Restart that server after deploying these changes. **`bun run start` / plain `next start` does not start the custom server**, so those deployments must run a separate supervised worker:

```sh
bun run era-reset-worker
```

Run it from the project root with the application's configured database access. Serverless deployments also need this persistent external worker; scheduling the banner alone cannot execute a reset. Monitor the worker logs for failures. Do not reopen logins while a started reset is retrying; repair the underlying failure and let the worker finish.

To let players explore, enable logins after publishing the schedule. No separate Announcement is needed. Ordinary announcement start/end dates still only control banner visibility, and **End Current Era & Start New** remains a separate archival action rather than this preview reset.

## Verification

The Bun suite passes 1,495 tests with five opt-in PostgreSQL integration tests skipped. Type checks and scoped lint pass. Synthetic service/API tests cover scheduling, cancellation, stale-era protection, login closure, restart recovery, duplicate worker polls, audit failure, transaction-boundary rollback, and retry. Real PostgreSQL concurrency/rollback acceptance remains unverified; mocked transaction tests are not a substitute for it.

The authenticated scheduling confirmation dialog was inspected at desktop and mobile widths without saving a schedule or executing a real reset. The scoped Impeccable UI review returned `ship`; shared notice integration was source-reviewed. No live Era reset or deployment was performed.

### Lifecycle lock regression

The lifecycle lock explicitly casts PostgreSQL's `void` result to `text`, matching Prisma's supported result types. The original uncast query was reproduced as a driver error against disposable PostgreSQL 17; the fixed helper passed two real-database tests for decoding, mutual exclusion, and release on commit/rollback. Run `src/utils/eraLifecycleLock.pg.test.ts` with `ERA_LIFECYCLE_TEST_DATABASE_URL` pointing to a local disposable database whose name ends in `_test`. This verifies the lock, not the full Era reset against real account data.
