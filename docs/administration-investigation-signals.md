# Read-only administration investigation signals

`/home/admin/cheat-signals` opens a **Read-only findings** tab. Existing persisted
signals and their existing review workflow remain in **Saved signals**.

The new GET endpoint `/api/admin/abuse/investigation-signals?days=7` requires
`VIEW_CHEAT_SIGNALS`. It supports 7 or 30 OT calendar days, ending at the start of
the request. Results are private and uncached. The detector service executes its
queries inside a repeatable-read, database-enforced read-only transaction, with
a 10-second statement timeout and 30-second transaction timeout. It never saves
CheatSignal records, changes player state, or applies enforcement actions.

## Rules

- **Possible account feeding:** at least six positive friend transfers to one
  recipient from at least three senders. At most 20 senders are listed. Shared
  network/browser login patterns among those sampled senders provide optional
  context from the retained records within the selected period, at most 30 days.
- **Repeated transfer cycle:** a directed cycle of two or three players, with at
  least two positive friend transfers on each edge. Gross gold movement does not
  imply profit or that the same gold circulated in chronological order.
- **Possible attack farming:** at least eight attacks on the same defender,
  attacker wins at least 90%, positive total pillage, positive defender losses,
  and attacker losses at most 10% of defender losses. Both loss totals must be
  recorded on every attack. Loss totals include wounded units.
- **Combat accounting mismatch:** compare version-1 admin before/after snapshots
  against recorded pillage, turns, stamina expenditure, and active-unit losses.
  Account for regular units and mercenaries; casualties include wounded units
  removed from active duty. A comparison with missing/invalid values is skipped.
  This is a consistency warning that may reveal a game or logging bug.
- **Recruitment concentration:** at least 20 recruiting clicks, at least 80%
  directed toward one target. In recruit history, `to_user` is the clicking actor
  and `from_user` is the link owner. Supported auto-recruiting and small populations
  can legitimately cause this.
- **Alliance treasury concentration:** at least five withdrawals/loans to one
  beneficiary, accounting for at least 80% of that alliance's withdrawal/loan
  amount. The actor and beneficiary are separate. Authorized funding can explain it.
- **Chat volume burst:** at least 50 retained chat messages from one player in a
  fixed ten-minute bucket. Includes private/group chat metadata, not content.
  Legacy inbox broadcasts are excluded because recipient rows do not establish
  the number of manual sending actions.

Official game bots and system accounts are excluded. Friend-transfer tax rows,
automatic recruiting rewards, alliance taxes/fees, and future-dated records are
excluded from the corresponding detectors. Rules are investigative heuristics,
not findings of cheating. There is no probability-of-cheating score.

## Evidence and limits

Each pattern includes players, observation dates, measured values, and up to ten
source records. Transfer cycles show one source transfer per edge. Attack records
link to the admin attack ledger; staff with `VIEW_ANALYTICS` can open the involved
players' activity timelines. Raw login hashes, private messages, and transfer
notes are not returned.

At most 25 findings are returned per type; extra matches are disclosed. The combat
accounting scan covers the latest 1,000 attacks and reports missing snapshots,
invalid comparisons, and truncation. Other rules aggregate the selected window.
Player/type filtering applies to the returned set and cannot search beyond these
caps. Missing/pruned records reduce coverage. An empty result is not proof that
all activity is legitimate.

No migration is required. Full combat snapshots are captured in attack-log JSON
for attacks recorded after the admin-ledger change; older records cannot provide
all comparisons. Rules do not infer missing balances from current player state.

## Verification

```sh
bun --no-env-file test src/services/__tests__/InvestigationSignals.test.ts src/services/Battle.redaction.test.ts src/utils/adminCombat.test.ts src/__tests__/pages/api/admin/activity-ledger.api.test.ts
bun --no-env-file run check-types
```

Detector tests execute SQL in an in-memory PostgreSQL-compatible database with
synthetic records. Browser fixtures verify the real source components with a
mocked user/network; they do not establish authenticated end-to-end integration
against a deployed database.
