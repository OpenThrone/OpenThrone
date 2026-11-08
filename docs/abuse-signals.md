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
| Shared network/device | `LINKED_ACCOUNT_ACTIVITY` | 3+ human accounts on one hashed IP, or one IP+browser pattern, within 14 days. Max severity MEDIUM alone | `LoginEvent` hashes (30-day retention, already disclosed) |
| Resource funnelling | `RESOURCE_FUNNELLING` | 3+ sources send 80%+ of their gold transfers / one-sided attacks / internal recruit-link clicks to one account (2M gold, 5 actions each) in 7 days; alliance treasury payouts to one member (LOW) | `bank_history`, `attack_log`, `recruit_history`, `alliance_bank_history` (20-day retention) |
| Gold ping-pong | `RESOURCE_FUNNELLING` | 3+ transfers and 500k gold each way between two accounts, balance 50%+ | `bank_history` |
| Bot-like timing | `BOT_TIMING` | 20+ active hours a day on 3 of the last 7 days, or action-interval spread ≤10% over 500+ in-session intervals | `ActivityDay` counters |
| Fresh-account farming | `FRESH_ACCOUNT_FARMING` | 5+ attacks (80%+ won) by one player on an account younger than 7 days at the time | `attack_log`, `users.created_at` |

A shared login network/browser pattern between the accounts in a funnel,
ping-pong or fresh-account pair raises the score. Official bots are excluded.

Detection runs in the daily job (`runAbuseDetection`, bounded queries, each
detector isolated) and at write time where cheap: after a login (shared
network), a friend transfer (ping-pong) and an attack (fresh account).

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
