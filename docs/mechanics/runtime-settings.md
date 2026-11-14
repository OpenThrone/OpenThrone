# Runtime settings

Last verified against code: 2026-11-12 (alpha 3d0785d1)

Runtime settings are the game values and switches that staff can change while the server runs, without a deploy: feature switches, login and registration access, maintenance mode, combat and economy limits, stamina rules, recruiting caps, alliance limits, account housekeeping and abuse-signal thresholds. A single registry defines every one of them. Nothing outside the registry can be changed through this system.

The registry is [runtimeSettings.ts](../../src/constants/runtimeSettings.ts). Read it for keys, labels and current default values; this page does not repeat them.

## Rules

### What a registry entry holds

Each key maps to:

- `group`: one of `features`, `access`, `combat`, `stamina`, `recruiting`, `economy`, `mercenaries`, `alliances`, `accounts`, `abuse`. The admin page lists settings by group.
- `type`: `NUMBER`, `BOOLEAN`, `STRING` or `JSON` (only `MAINTENANCE_MODE` is JSON: an `enabled` flag and a message of up to 1,000 characters; only `recruit.captchaProvider` is a STRING: `altcha` or `turnstile`, shown as a dropdown).
- `label`: stored with the row.
- `isPublic`: stored with the row. See Known gaps for what it does and does not do.
- `schema`: a Zod schema. Its bounds are the real limits (for example `stamina.recoveryIntervalMinutes` is a whole number from 1 to 1,440; `era.protectionDurationDays` is a whole number from 1 to 60).
- `env`: an optional environment variable that supplies a default.
- `fallback`: the value used when nothing else applies.

### Which value wins

For each key, [RuntimeConfig.service.ts](../../src/services/RuntimeConfig.service.ts) picks the first of these that passes the key's schema:

1. The value in the `ServerSetting` database row.
2. The environment variable named by `env`, if the key has one and it is set. Booleans are true only for the text `true`, except `ENABLE_ATTACKING`, which is true unless the text is `false`. Numbers are parsed with `Number`.
3. The registry `fallback`.

A stored value that fails the schema is ignored, not an error, so a bad row falls back to the environment or default. Deleting a row (reset to default) returns the key to steps 2 and 3. Settings are not secrets and the registry test pins the exact key list, so a database URL or similar cannot be added by accident.

The result is one in-memory snapshot (`getRuntimeConfig`) that all game code reads, and that `GET /api/config` returns with `Cache-Control: no-store`.

### Caching

- A snapshot is cached for 5 seconds per process. Concurrent reads share one query.
- Changing a setting clears the cache on the process that handled the change. Other processes pick the change up within 5 seconds.
- If the database read fails, the last good snapshot is served for up to 30 seconds. After that the read throws and `/api/config` answers 503. A reader inside a transaction bypasses the shared cache so it never publishes uncommitted values.
- The era reset waits 35 seconds before resetting because of this 30-second window ([era-reset.md](era-reset.md)).

The snapshot also carries `eraResetInProgress`, derived from the scheduled-reset row, which is not a setting.

### How an admin changes a value

The admin route is [server-settings.ts](../../src/pages/api/admin/system/server-settings.ts):

- `GET` lists the stored rows. Rows whose key is not in the registry are returned without their value and as not editable.
- `GET ?effective=1` returns what the server is running right now for every registry key, including values that come from the environment or default and have no row.
- `GET ?historyKey=<key>` returns the last 20 audit entries for that key.
- `PUT` with `{ key, value }` sets a value. `PUT` with `{ key, revertAuditId }` restores the `previousValue` recorded on an earlier audit entry for the same key.
- `DELETE ?key=<key>` removes the row, returning the key to its environment or default value.

Rules enforced on write:

- The key must be in the registry (unknown keys: 400) and the value must pass its schema (invalid: 400).
- Related limits are checked together under a lock: loan term minimum cannot exceed maximum, and member daily cap minimum cannot exceed maximum.
- Changing `DISABLE_LOGIN` or any `stamina.*` key takes the era lifecycle lock. A stamina change that alters the value first settles every player under the old rules, so no one gains or loses recovery time unfairly ([stamina.md](stamina.md)).
- Every update and delete is written to the audit log in the same transaction, with the key, previous value and new value. If the audit write fails, the change does not commit.
- The caller needs the server-settings permission.

### Adding a new setting

1. Add an entry to `RUNTIME_SETTING_REGISTRY`: pick the group, type, label, `isPublic`, a Zod schema with real bounds (integers where it matters), an `env` only if a deployment default is wanted, and a `fallback`.
2. Add a property for it to the `RuntimeConfig` interface and map it from `values[key]` in `getRuntimeConfig`.
3. Add the key to the `runtimeValue` map in the admin route. Without it the "effective" view shows the registry fallback instead of an environment-supplied value, and the audit log records the wrong previous value.
4. Add the label under `settings.labels.<key>` in the English, German and Spanish `admin-system.json` files. A test fails if any locale lacks one.
5. Update the pinned key list in [runtimeSettings.test.ts](../../src/constants/runtimeSettings.test.ts), and add tests for the bounds and default.
6. Read the value through `getRuntimeConfig()` where it is used; never read the database row or environment directly. Pass a transaction handle when reading inside a transaction.
7. The admin page shows a plain number box for any `NUMBER`, a switch for any `BOOLEAN`, and special inputs only for a few keys (a `STRING` needs its own input, as `recruit.captchaProvider` has). A new setting works with no page change; add a custom input only if a plain box is not enough. The server, not the box, enforces the bounds.
8. If related settings must stay consistent (like a minimum and maximum), extend `validateRuntimeSettingConsistency` and the lock logic in the admin route.
9. If a change must settle state first, as stamina does, add that to the route's write path.

## Why it works this way

- Server settings are the only stored source. Earlier feature-flag rows were folded into them by a migration (`20261019010000_feature_flags_into_settings`), per the comment in [RuntimeConfig.service.ts](../../src/services/RuntimeConfig.service.ts).
- Reading a setting from a transaction bypasses the cache so uncommitted values never leak into other readers ([RuntimeConfig.service.ts](../../src/services/RuntimeConfig.service.ts)).
- An allowlist means a leaked admin session still cannot edit arbitrary rows ([ServerSetting.service.ts](../../src/services/ServerSetting.service.ts)).

## Admin and settings

- **Admin settings page** (`/home/admin/settings`, [settings.tsx](../../src/pages/home/admin/settings.tsx)): grouped table with current value, an input per setting, change history with revert, and a link to the era reset page next to `DISABLE_LOGIN`.
- **Maintenance** page ([maintenance.tsx](../../src/pages/home/admin/maintenance.tsx)): edits `MAINTENANCE_MODE`.
- Access settings (`DISABLE_LOGIN`, `DISABLE_REGISTRATION`, `MAINTENANCE_MODE`) are enforced by [loginPolicy.ts](../../src/utils/loginPolicy.ts) and [runtimeAccess.ts](../../src/utils/runtimeAccess.ts). While logins are disabled or maintenance is on, only active administrators and moderators get through; auth, password, two-factor, appeals, config and schedule endpoints stay reachable.
- The scheduled era reset and the player-facing config read the same snapshot.

## Source

- [runtimeSettings.ts](../../src/constants/runtimeSettings.ts): the registry, groups, key guard, consistency check.
- [RuntimeConfig.service.ts](../../src/services/RuntimeConfig.service.ts): resolution, cache, snapshot shape.
- [ServerSetting.service.ts](../../src/services/ServerSetting.service.ts): list, upsert and delete helpers (allowlisted).
- [server-settings.ts](../../src/pages/api/admin/system/server-settings.ts): admin read, write, revert, history.
- [config.ts](../../src/pages/api/config.ts): the snapshot endpoint.
- [admin-system.json](../../public/locales/en/admin-system.json): labels.

## Tests

- [runtimeSettings.test.ts](../../src/constants/runtimeSettings.test.ts): exact key list, one group per key, defaults and bounds, inverted limits rejected, maintenance shape, every key labelled in every admin locale.
- [RuntimeConfig.service.test.ts](../../src/services/RuntimeConfig.service.test.ts): database over environment over default, five-second cache, invalidation, last-good snapshot and sanitized failure, transaction readers, shared reads.
- [server-settings-effective.api.test.ts](../../src/__tests__/pages/api/admin/server-settings-effective.api.test.ts): the effective view for settings without a row.
- [runtimeAccess.test.ts](../../src/utils/runtimeAccess.test.ts): maintenance and reset gating by path and role.

## Known gaps

- `isPublic` is stored on each row but is not a security control. Do not rely on it to keep a value private.
- The admin write route (`PUT`, `DELETE`, revert, history, consistency checks, locks) has no direct test; only the effective view is covered.
- The admin number box has no bounds of its own for most settings; an out-of-range value is refused by the server with a generic error.
- `ServerSettingService.upsert` and `delete` duplicate the route's write path without its audit and locks and are not used by it.
