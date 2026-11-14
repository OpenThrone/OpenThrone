# Abuse signals (#6)

Admin-only detection signals. A signal is context for staff review: it never bans,
blocks or penalises a player, and players cannot see it. Review in
`/home/admin/cheat-signals` (tab "Abuse signals") or on a player's Edit Player
"Abuse signals" tab. Dismissing requires a note; every review is audited
(`ADMIN_CHEAT_SIGNAL_ACTION`). A dismissed pattern is not re-raised for 30 days
unless its score rises by 20 or more.

All thresholds are runtime settings in the "Abuse detection" group
(`abuse.*`, System → Server settings); `abuse.enabled` switches the daily sweep
and the write-time checks off.

| Signal | Type | Rule (defaults) | Data used |
| --- | --- | --- | --- |
| Shared network/device | `LINKED_ACCOUNT_ACTIVITY` | 3+ human accounts on one hashed IP, or one IP+browser pattern, within 14 days. Max severity MEDIUM alone. Network **ranges** (/24, /64) never raise a signal | `LoginEvent` hashes (30-day retention, already disclosed) |
| Resource funnelling | `RESOURCE_FUNNELLING` | 3+ sources send 80%+ of their gold transfers / one-sided attacks / internal recruit-link clicks to one account (2M gold, 5 actions each) in 7 days; alliance treasury payouts to one member (LOW) | `bank_history`, `attack_log`, `recruit_history`, `alliance_bank_history` (20-day retention) |
| Gold ping-pong | `RESOURCE_FUNNELLING` | 3+ transfers and 500k gold each way between two accounts, balance 50%+ | `bank_history` |
| Bot-like timing | `BOT_TIMING` | 20+ active hours a day on 3 of the last 7 days, or action-interval spread ≤10% over 500+ in-session intervals | `ActivityDay` counters |
| Fresh-account farming | `FRESH_ACCOUNT_FARMING` | 5+ attacks (80%+ won) by one player on an account younger than 7 days at the time | `attack_log`, `users.created_at` |

A shared login network/browser pattern between the accounts in a funnel,
ping-pong or fresh-account pair raises the score. Official bots are excluded.

Detection runs in the daily job (`runAbuseDetection`, bounded queries, each
detector isolated) and at write time where cheap: after a login (shared
network), a friend transfer (ping-pong) and an attack (fresh account).

## Login telemetry

`LoginEvent` rows carry only salted hashes (`ipHash`, `ipPrefixHash`,
`deviceHash`, `userAgentHash`) - never raw IPs, user agents or ranges - and a
`kind`:

| Kind | Written when | Feeds signals |
| --- | --- | --- |
| `SIGN_IN` | A successful credential sign-in | Yes (unchanged write-time check) |
| `SIGN_UP` | A registration | No; linkage only |
| `SEEN` | At most once per user per UTC day of authenticated activity (the game-shell data request), for players on long-lived sessions that never sign in | No; linkage only |

`ipPrefixHash` is the IPv4 /24 or IPv6 /64 of the resolved client address
(trusted-proxy addresses get none, like `deviceHash`). Ranges are shared by
mobile carriers, CGNAT, campuses and large VPN exits, so a range cluster is
weaker evidence: `findLoginClusters` only queries it for the staff view, and
`raiseLoginClusterSignal` returns without filing for `via: 'range'`. Sign-up
and seen rows join the same 30-day retention purge and account-erasure
sweep as sign-ins.

## Multi-account staff view

`/home/admin/multi-accounts` (permission `VIEW_MULTI_ACCOUNTS`,
`getMultiAccountClusters`) groups accounts that shared an IP, a network range
or an IP+browser pattern in the last 30 days, from **two accounts up** - a
pair is context even though it takes `abuse.network.minAccounts` (default 3)
to raise a signal. Each group shows the pattern type (range groups carry a
"weaker evidence" note), the event kinds seen, first/last seen and the
accounts with profile links. Reading the page is audited
(`ADMIN_MULTI_ACCOUNTS_READ`); the logins ledger under Administration →
Ledgers shows each row's `kind`. Multiple accounts are allowed; nothing on
these pages sanctions anyone automatically.

### Recruit direction
`recruit_history` stores the link owner in `from_user` and the signed-in recruiter
in `to_user`, and the recruiter gets the reward. So a recruit funnel sinks into
the **recruiter**: 3+ link owners whose clicks (5+ each) come 80%+ from that one
recruiter. External link visits are not counted: they have no source account
(`from_user` is null) and are already capped per owner and per IP per day.

## Cost and failure bounds
- Every sweep query and signal write runs in a transaction with `SET LOCAL
  statement_timeout` / `lock_timeout` (20 s sweep, 3 s writes, 2 s lock), so a
  stalled query or contended advisory lock fails that step instead of hanging.
- Each detector has a 5-minute wall-clock budget that covers every query and
  write inside it (not just the gaps between batches): no query or signal write
  starts once it is spent, and each transaction's statement and lock deadlines are
  capped to the time left; the deadline is re-armed from the time left immediately before every statement (not once per transaction), so waiting for a connection or an earlier slow statement cannot carry a later one past the budget. A detector is isolated: a failure or budget stop is
  logged and the next detector still runs.
- Window indexes: `bank_history(history_type, date_time)`,
  `recruit_history(source, timestamp)`, `LoginEvent(occurredAt)` (plus the existing
  attack/alliance/activity ones).
- Login, transfer, attack and activity-counter work runs in the background
  (bounded concurrency, never awaited by the request). A runner slot is held until
  its job actually settles (every query has a database deadline, so it ends on its
  own); work arriving while all slots are busy is dropped, with a warning at most
  once a minute per runner carrying the dropped count. Background jobs read the abuse
  thresholds through a 2 s bound (`getAbuseConfigBounded`): on timeout they use the
  last known configuration, or skip the job if there is none, so a hung
  configuration read cannot hold a slot. Activity
  counters are not collected at all while `abuse.enabled` is off.
- Bot timing walks every candidate player in keyset batches of 500 (by user id,
  complete player groups, only players with enough actions to possibly qualify). No
  cursor is kept across days; the whole 7-day window is re-walked each sweep.

## Data

No new IP or device data. `ActivityDay` holds one row per player and UTC day:
a 24-bit set of active hours, an action count and the sum and sum of squares of
in-session action intervals (gaps up to 15 minutes), updated by the existing
gameplay-action hook. It contains no IP, device or content and is pruned after
14 days by the daily sweep.

## Tests

- `src/services/__tests__/LoginTelemetry.service.test.ts`: hash-only storage,
  /24 and /64 prefix hashing, proxy skips, SIGN_UP writes no signal, the daily
  seen guard (once per user per UTC day, idempotent insert, never throws),
  range clusters raising nothing, retention and erasure covering every kind.
- `src/services/__tests__/CheatDetection.clusters.test.ts`: proxy exclusion,
  two-account groups, range groups with kinds and first/last seen.
- `src/__tests__/pages/api/auth/register-telemetry.api.test.ts`: registration
  writes a `SIGN_UP` event (hashes only) and succeeds when telemetry fails.
- `src/__tests__/pages/api/general/getUser-telemetry.api.test.ts`: the daily
  seen hook records once per day, skips impersonated sessions and never fails
  the request.
- `src/__tests__/migrations-row-level-security.test.ts`: the kind migration
  adds no table, so none needs RLS.

## Known gaps

- The staff view builds groups in memory from the newest 5000 rows of the
  window; on a busy server a busy day could push older groups out of view.
- `SEEN` rows are deduplicated per UTC day per user per process; two app
  processes could race, but the `WHERE NOT EXISTS` insert keeps at most one
  row per user per day.
- The once-a-day seen hook covers the game-shell data request
  (`/api/general/getUser`); activity that never loads the game shell (API
  tokens, some admin pages) leaves no seen row. Sign-in and sign-up rows still
  cover those users.

Last verified against code: 2026-11-12 (alpha 49c9273)
