# Temporary forces (#10)

## Player gameplay

**Battle → Mercenaries** (`/battle/mercenaries`) hires ready-equipped offense,
defense, spy and sentry troops at native tier unlocks. Choose 1, 3 or 7 days,
review the price and hire up to 100 surviving mercenaries per role (wounded
survivors count). The contract list shows survivors, recovering troops, expiry,
extension prices and dismissal. Extensions charge for survivors only, keep the
accepted daily price and cannot exceed 30 days from now. Dismissal has no refund.
Expiry removes mercenaries; it never creates citizens, permanent units or items.

Per-unit mobilization is `ceil(native training × 1.25)`. Each paid day is
`ceil((native training + bundled kit) × 0.05)`. Bundled items are server-curated,
use one item in each supported slot (five for spies, six for other roles), and
never enter personal inventory. Mercenaries gain 25% primary strength, lose 20%
off-role strength and have 20% less health. Personal equipment and battle-upgrade
capacity cannot be assigned to these contracts.

**Alliance → Alliance troops** (`/alliances/[id]/forces`) exposes the shared
reserve, permanent equipped contributions, loan requests, active loans,
extensions, recalls, role policy, dues and war levies. A contribution transfers
existing permanent combat units and one owned, eligible item in every supported
slot per unit. The player explicitly acknowledges that it is permanent.

Leaders choose manual approval or automatic role allowances. Automatic lending
denies roles without an allowance. Requests reserve no stock and expire after
24 hours; borrowers or leadership can cancel them. Approvals recheck current
membership, tier/kit eligibility, accepted limits and current role caps. Loan
extensions follow the configured approval policy, retain the accepted
contribution rate and have a 30-day maximum horizon. Leadership can recall early.

Alliance troops use normal health and stats with their bundled kit. Surviving
healthy troops return to the source reserve; recovering troops return to its
wounded stock and heal at the normal daily rate. Recall cannot heal wounds
instantly. Combat deaths impose no fine, replacement debt or equipment bill.
Membership exit or expulsion returns surviving loans immediately. Donations
remain alliance property. An army holding alliance troops cannot attack or run a
spy mission against any current member of their source alliance, including when
the ordinary friendly-fire confirmation would otherwise allow the action.

## Dues, taxes and enforcement

Leaders can issue a one-time gold or equipped-troop levy to selected current
members with an explicit due date. Recurring rules choose gold or equipped
troops, alliance role, minimum player level, repetition interval and default days
to pay. The highest qualifying level rule applies per role. Missed scheduler time
creates one current demand, without back-charging missed periods. Disabling a
rule stops future demands; leadership can waive existing obligations separately.

Payments are manual and may be partial. Gold comes from on-hand gold. Troop
payments transfer existing permanent units and their full owned kit atomically
into the reserve. Borrowed units and mercenaries cannot pay troop dues.

General pillage taxes are configured by role. A participating offensive loan can
carry a separate contribution. Each alliance gets the higher applicable rate,
never their sum. The combined charge across alliances is capped at 25% of gross
pillage, allocated proportionally with deterministic largest-remainder rounding.
Existing gold-loan repayment applies to post-contribution income. The attacker's
battle report shows contributions, gold-loan repayment and net gold brought home.
Defenders and shared readers do not receive these private deductions.

Due-soon and overdue reminders appear on authenticated game pages and link to
payments. The troop page marks overdue balances and shows the accepted collection,
fine and expulsion terms. Leaders may enable overdue borrowing/extension
suspension, collection after a chosen grace period, a fixed one-time fine, and
later expulsion. Collection/fine/expulsion terms are snapshotted when an
obligation is issued, so changing policy cannot retroactively increase a demand.
Fines never compound. Collection uses on-hand gold and explicitly designated,
still-eligible equipped permanent troop stacks only; shortfalls remain due.
There is no bank seizure, forced training, automatic attack or bounty. Existing
manual alliance target calls remain the coordination mechanism.

## Persistence and lifecycle

- `ForceContract` is the source of temporary troop ownership. Combat and user
  reads project virtual contract rows, preserving contract IDs, kind and kit.
  Neither battle nor spy persistence can create a `UserUnit` from a contract.
- Killed and wounded troops retain contract identity. Wounds remain in the
  recovering pool until daily healing; contract expiry also expires mercenary
  wounds. Alliance wounds return to separate reserve stock.
- Replays include the immutable contract identities and bundled kits, so later
  recalls, expiry, donations or armory changes do not alter the recorded battle.
- `ForceEvent` records ownership/money changes and operation UUIDs. Retrying an
  operation cannot charge twice; reusing an ID for different terms is rejected.
  Browser retries retain operation IDs after ambiguous network/server failures.
- Treasury operations lock alliance then sorted players. Combat holds sorted
  player locks and parks contribution credits without acquiring alliance locks;
  the worker settles them once. A shared era lifecycle lock precedes these locks
  so resets cannot interleave with new commitments or enforcement.
- `ForceObligation` stores outstanding dues and their accepted enforcement terms;
  `ForceDuesRule` stores recurring defaults. Membership exit cancels remaining
  obligations. Account resets retain dues but terminate temporary contracts.
  Era resets cancel old obligations, clear temporary stock and pending credits,
  and restart recurring schedules. Pools and contracts carry era identity.
- Alliance dissolution archives the force ledger before removing its referenced
  rows, preserving audit history without making alliances undeletable.
- `startTemporaryForceWorker` runs sequential bounded passes every minute in the
  custom Bun server. It closes elapsed contracts, cancels stale requests, heals
  reserve wounds, settles parked contributions and processes each alliance's dues
  once per OT day. Multiple processes coordinate through PostgreSQL locks and
  unique event keys. Roster reads enforce exact expiry between worker passes.

## Migration and rollback

Apply `20261021200000_temporary_force_gameplay` after the ownership foundation.
The migration is additive apart from converting legacy `UserUnit.isMercenary`
stacks and their wounded survivors into seven-day equipped contracts without
charging gold or minting personal items. Wounded-only companies receive their
own contracts; native wound groups remain unchanged. The migration runs in a
single transaction, so validation failure leaves the prior schema and troops intact. Unsupported legacy roles, tiers or quantities abort migration
instead of silently deleting data. Existing ledger records receive era identity.

Use the private alpha deployment runbook for host access, backups, migrations,
restart and rollback. Do not copy private host details or credentials here.
Never drop the new tables or restore a shared database merely to roll code back.
The previous inactive foundation cannot use contract troops in combat; a rollback
to that version requires maintenance until the compatible gameplay build is
restored. Preserve the ledger and recover forward if players have used it.

## Verification

Run Bun with `--no-env-file`. Real database tests must use
`bash scripts/test-integration.sh`, which creates and destroys its own local
PostgreSQL container; never direct these tests at alpha or production.

The integration suites cover contract hiring/payment races, exact ownership,
combat and spy persistence/replay, reserve return races, role limits, cancellation,
membership exit, contribution limits, partial payments, daily fine/collection
idempotency, expulsion, recurring rules, era separation and contribution credit
settlement. `/test` includes mock-only mercenary, alliance troop and dues
specimens, plus the battle-report deduction state. Live browser checks use a
separate disposable database and authenticated synthetic players.
