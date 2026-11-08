# Temporary forces (#10)

Last verified against code: 2026-11-06 (alpha 43c5fff7)

## Player gameplay

**Battle → Mercenaries** (`/battle/mercenaries`) hires ready-equipped offense,
defense, spy and sentry troops at native tier unlocks. Choose 1, 3 or 7 days,
review the price and hire up to 100 surviving mercenaries per role (wounded
survivors count). Surviving mercenaries across all roles also cannot exceed 50%
of your own trained army (offense, defense, spy and sentry, rounded down). The contract list shows survivors, recovering troops, expiry,
extension prices and dismissal. Extensions charge for survivors only, keep the
accepted daily price and cannot push expiry past `force.maxTermDays` (default
30) from now. Dismissal has no refund.
Expiry removes mercenaries; it never creates citizens, permanent units or items.

Per-unit mobilization is `ceil(native training × 1.25)`
(`mercenary.hireMultiplier`). Each paid day is
`ceil((native training + bundled kit) × 0.05)` (`mercenary.dailyPriceRate`). Bundled items are server-curated,
use one item in each supported slot (five for spies, six for other roles), and
never enter personal inventory. Mercenaries gain 25% primary strength, lose 20%
off-role strength and have 20% less health. Personal equipment and battle-upgrade
capacity cannot be assigned to these contracts. The 25% and 20% strength changes
and the 20% health cut are fixed in code, not settings.

Hiring and renewing need the Mercenary Hall (Village fort, fort level 2) for
tier 1, the Outpost (fort level 4) for tier 2 and the Stronghold (fort level 7)
for tier 3, plus the fort level of the unit tier itself, so Spy and Sentry tiers
open with their later forts. Dismissal stays open when a tier locks again. Each hire and each paid renewal writes one `SALE` bank-history row (`HIRE_MERCENARY` or `RENEW_MERCENARY`) with the contract, term and quantity. Dismissal and expiry move no gold, so they write none. Mercenaries refuse to sign or renew when kingdom morale is
below 20. A broke kingdom with active contracts loses 3 extra morale a day.
While the `ENABLE_DESERTION` feature is on and morale is below 20, 10% of all
surviving mercenaries walk out each day (at least one when 10 or more remain).
`force.maxQuantity` (default 1,000,000) and `force.maxTermDays` also bound hires.

**Alliance → Alliance troops** (`/alliances/[id]/forces`) exposes the shared
reserve, permanent equipped contributions, loan requests, active loans,
extensions, recalls, role policy, dues and war levies. A contribution transfers
existing permanent combat units and one owned, eligible item in every supported
slot per unit. The player explicitly acknowledges that it is permanent.

Leaders choose manual approval or automatic role allowances. Automatic lending
denies roles without an allowance. Requests reserve no stock and expire after
24 hours; borrowers or leadership can cancel them. Approvals recheck current
membership, tier/kit eligibility, accepted limits and current role caps. Loan
extensions follow the configured approval policy (under automatic lending they
apply at once, under manual lending they wait for the leader), retain the
accepted contribution rate, and cannot push expiry past the smaller of
`force.maxTermDays` (default 30) and the role's term allowance, counted from
now. The leader can recall early, and a borrower can
return troops early.

Alliance troops use normal health and stats with their bundled kit. Surviving
healthy troops return to the source reserve; recovering troops return to its
wounded stock, where 35% (at least one) heal once per OT day. Recall cannot heal wounds
instantly. Combat deaths impose no fine, replacement debt or equipment bill.
Membership exit or expulsion returns surviving loans immediately. Donations
remain alliance property. An army holding alliance troops cannot attack or run a
spy mission against any current member of their source alliance (while that alliance is active), including when
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

## Admin and settings

Runtime settings (admin Runtime Settings, group Mercenaries): `mercenary.hireMultiplier`,
`mercenary.dailyPriceRate`, `force.maxQuantity`, `force.maxTermDays` and
`force.maxPillageBps` (default 2500, the pillage cap and the ceiling for role
rates). The admin Forces page lists contracts, reserves, dues and wounded troops.
Staff can expire or terminate a contract, return an alliance deployment, cancel
an obligation and heal all wounded. Player-scoped actions need
`MANAGE_USERS`, alliance-scoped ones `MANAGE_ALLIANCES`, and every action is
audited.

## Source

- [Mercenary.service.ts](../../src/services/Mercenary.service.ts): offers, hire, renew, dismiss, expiry.
- [TemporaryForceLedger.service.ts](../../src/services/TemporaryForceLedger.service.ts): policy, contribution, loan request and approval, close, casualties.
- [AllianceForceExtension.service.ts](../../src/services/AllianceForceExtension.service.ts): extensions and request cancellation.
- [ForceLifecycle.service.ts](../../src/services/ForceLifecycle.service.ts): return, member exit, forbidden targets, suspension.
- [ForcePillage.service.ts](../../src/services/ForcePillage.service.ts): pillage contributions.
- [ForceDues.service.ts](../../src/services/ForceDues.service.ts) and [ForceDuesWorker.service.ts](../../src/services/ForceDuesWorker.service.ts): levies, rules, payments, daily enforcement.
- [ForceWorker.service.ts](../../src/services/ForceWorker.service.ts) and [temporaryForceWorker.ts](../../src/server/temporaryForceWorker.ts): the minute worker.
- [AdminForces.service.ts](../../src/services/AdminForces.service.ts): staff actions.
- [temporaryForces.ts](../../src/utils/temporaryForces.ts): constants, policy schema, helpers.
- Routes: [mercenaries](../../src/pages/api/mercenaries/index.ts), [alliance troops](../../src/pages/api/alliances/[id]/forces.ts), [dues](../../src/pages/api/alliances/[id]/dues.ts), [dues summary](../../src/pages/api/forces/dues-summary.ts).

## Tests

- [ForceDues.waive.test.ts](../../src/services/__tests__/ForceDues.waive.test.ts): the leader-only dues waiver.
- [mercenaries.test.ts](../../test/integration/mercenaries.test.ts): hire and cost, races, unlock tiers, army share, renewal, dismissal, combat persistence (real database).
- [temporaryForces.test.ts](../../test/integration/temporaryForces.test.ts): contribution, requests, approvals, recall, expiry, automatic lending, policy versions.
- [temporaryForcesSafety.test.ts](../../test/integration/temporaryForcesSafety.test.ts): pillage cap, role caps, cancel races, era separation, spy replay.
- [allianceForceGameplay.test.ts](../../test/integration/allianceForceGameplay.test.ts): automatic loans, forbidden targets, extensions, dues, fines, expulsion, recurring rules, pillage.
- [temporaryForces.test.ts](../../src/utils/temporaryForces.test.ts): pure helpers for expiry, renewal, tiers, share cap, pillage split and enforcement planning.
- [Mercenary.price.test.ts](../../src/services/Mercenary.price.test.ts): price quote check.
- [AllianceForceExtension.cap.test.ts](../../src/services/AllianceForceExtension.cap.test.ts): extension quantity cap.
- [Force.strengthRefresh.test.ts](../../src/services/Force.strengthRefresh.test.ts): stored strength after expiry and return.
- [ForceDues.schema.test.ts](../../src/services/ForceDues.schema.test.ts): dues payment quantity.
- [adminForces.test.ts](../../src/utils/adminForces.test.ts): staff action rules.

## Known gaps

- `planForceEnforcement`, `extendForceContract` and `splitForcePillage` in `temporaryForces.ts` are exercised by unit tests but not called by the server. The daily worker and pillage code implement their own logic. In particular the helper requires a prior final warning before expulsion, while the worker expels from the snapshotted overdue threshold alone, so the unit test for that rule does not cover production.
- Reserve wound healing uses a literal 35% in `ForceWorker.service.ts` instead of the shared wounded-heal constant that player healing uses. They match today.
- Collection designation is covered only through the automatic-collection integration test. No test covers the admin Forces routes.
- Contracts paid before these bank-history rows were added stay out of bank history. `ForceEvent` still holds their gold.
- Not independently verified for this pass: battle-report deduction display for the attacker versus defender, and the account-reset and migration details above.
