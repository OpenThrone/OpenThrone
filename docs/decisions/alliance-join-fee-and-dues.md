# Alliances may charge a join fee and recurring dues in gold

Date: 2026-11-11. Rules: [Alliances](../mechanics/alliances.md#join-fee-and-membership-dues).

## Decision

Every alliance may set a one-time join fee and recurring membership dues, both in gold. The leader, or a rank with the new `set_dues` permission ("Set join fee and dues"), sets them on the alliance Settings tab. Both are off by default. The rules and maximums are in [allianceDues.ts](../../src/constants/allianceDues.ts):

- Join fee: 0 to 10,000,000 gold, paid once from the joiner's gold on hand into the treasury on every path that adds a member (open join, accepted join request, accepted invitation). The founder pays nothing.
- Dues: none, or a period (daily, weekly or monthly) with an amount per member of at most 1,000,000 (daily), 5,000,000 (weekly) or 20,000,000 (monthly) gold, taken from every member except the leader at each period start by the daily job.

## Reason given

The owner approved it as a gameplay change (AGENTS.md section 17), asking: "where do I set a fee to join (in Gold), a daily/weekly/monthly tax (in Gold)". The maximums, the arrears rule (pay what you have, owe the rest, never removed) and the leader exemption were part of the approved specification; no further reason was recorded.

## Production numbers at approval

Measured on production before the change: 2 alliances exist and the largest has 3 members. With both settings off by default, the change affects nobody on release.

## What follows from it

- A player sees the fee and dues before joining: on the directory card, in the alliance page header and Stats card, on the invitation, and in a confirmation before joining or accepting. A pending join request pays the fee in force when it is accepted; the officer accepting sees the fee, and a player who cannot pay stays pending.
- Changing the fee never affects existing members. A new period (including turning dues on) starts counting from the moment it is saved: every member is marked paid through the current period, so nobody is charged retroactively. A new member's first dues fall at the next period start after joining.
- A member who cannot pay in full pays what they have; the rest is arrears on the membership, collected first at later runs or paid from the alliance's Overview or Bank tab. Nobody is removed for unpaid dues.
- A missed daily run charges one period at the next run, never a pile of past periods (the same rule as troop dues in ForceDuesWorker).
- Fees and dues go to the treasury even above the Alliance Hall treasury cap, like loan repayments.
- Reserved alliances collect nothing. An era boundary clears every membership's arrears with the treasury; the fee and dues settings stay.
- Admins view and edit the fee and dues in the admin alliance drawer, and each member's arrears there and in Edit Player; every change is audited.

## Decisions made while building it (not in the approved specification)

These were implementation choices, listed so the owner can change them:

- Week periods start Monday 00:00 OT and month periods on the 1st at 00:00 OT; daily periods follow the game day.
- Turning dues off (`No dues`) stops automatic collection of existing arrears; members can still pay them from the alliance page, and an admin can clear them.
- A join with a fee or dues opens a confirmation first. An open join and an invitation acceptance send the fee the player confirmed, and the server refuses if the fee changed since, so nobody pays an amount they did not see.
- Staff may set arrears from 0 to 1,000,000,000 gold in Edit Player.

## Feature touchpoints (AGENTS.md section 14)

| Touchpoint | Status |
| --- | --- |
| Data model and migration | Done: enum `AllianceDuesPeriod`; `alliances.join_fee`, `dues_amount` (default 0) and `dues_period` (default `NONE`); `alliance_memberships.dues_arrears` (default 0) and `dues_paid_through` (null). Every existing row is backfilled by the defaults. No new table, so no RLS line. |
| Game logic and API | Done: fee on every join path in the joining transaction, `AllianceDuesService` (settings, status, manual payment, collection), daily cron pass logged as `allianceDues`, `GET /api/alliances/dues/status`, `POST /api/alliances/dues/settings`, `POST /api/alliances/dues/pay`. Era boundary clears arrears. |
| Player UI | Done: Settings tab fee and dues card with the per-period maximums, Fee and dues card on Overview, Bank and Settings, join terms on the directory card, page header, Stats card and invitations, join and invitation confirmations, fee note on join requests, arrears column on Members for the leader, `manage_bank` and `set_dues`, `set_dues` in the rank editor, Join fee and Dues types in bank history. |
| Admin view and edit | Done: fee, dues and period in the admin alliance drawer with the same bounds, arrears column in its member list, arrears per membership in Edit Player, all server-validated. |
| Admin audit trail | Done: `ADMIN_ALLIANCE_SET_DUES` with the previous and new values; arrears edits in the `ADMIN_USER_UPDATE` diff (`changes.duesArrears`), both written in the same transaction. |
| `/test` visual guide | Done: Fee and dues card (member and leader), settings card, directory card with join terms; the Members specimen shows the arrears column. |
| i18n, How to Play, FAQ, CHANGELOG | Done: en, de and es keys; How to Play alliances section and an FAQ entry; CHANGELOG balance entry. |
| Tests | Done: fee on each join path and its rollback, fee changed since confirmation, settings permission and bounds, collection (full, partial, arrears first, idempotent, missed runs, new members, reserved, leader), manual payment, arrears visibility, admin edits and validation, era reset; integration tests for concurrent collection, the fee on a real join and its rollback. |
