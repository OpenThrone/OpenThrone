# Alliances buy Hall levels that cap members, deposits and the treasury

Date: 2026-11-11. Rules: [Alliances](../mechanics/alliances.md#alliance-hall-upgrades).

## Decision

Every alliance has an Alliance Hall level from 0 (Camp) to 5 (Stronghold), bought one level at a time with treasury gold by the leader or a rank with the new `upgrade_alliance` permission. The level sets three limits: the most members the alliance holds, how many deposits each member may make per rolling 24 hours, and how much gold deposits may bring the treasury to. The table is in [allianceLevels.ts](../../src/constants/allianceLevels.ts) and the mechanics doc.

## Reason given

The owner approved all of it as a gameplay change (AGENTS.md section 17), in three parts:

- Alliance deposits must not get around the personal bank's limits. Without a per-member limit, a player could move unlimited gold into an alliance treasury, where the personal bank caps deposits per day.
- Alliances get upgrades, like Structure Upgrades for players, so the new limits are raised by something an alliance works towards.
- A rank permission lets chosen ranks buy upgrades on the leader's behalf.

## Production numbers at approval

Measured read-only on production, in aggregate, before the change:

- 2 alliances exist. The largest has 3 members (Camp allows 10).
- The largest treasury holds about 760,000 gold (Camp caps deposits at 5,000,000).
- 2 alliance deposits were made in the last 7 days, the largest 745,000 gold (Camp allows 2 per member per 24 hours).

No alliance or member reaches any Camp limit today, so the change bites nobody on release.

## What follows from it

- Each limit shows where it bites (deposit form, invite panel, Overview) with the current value, what happens at the limit and a link to the Upgrades tab, which lists every level's values.
- Every level is reachable: each cost fits under the treasury cap of the level below and each member requirement under the member cap below; a unit test enforces it.
- The member cap never removes anyone. Alliances above it keep their members but cannot add more.
- The hall returns to Camp at an era boundary, with the treasury that paid for it. This was not part of the owner's request; it follows the existing rule that alliance XP, upgrades and the treasury are era progression. Changing it is a gameplay decision for the owner.
- Admins view and set the level (0 to 5) in the admin alliance drawer; each change is audited.

## Feature touchpoints (AGENTS.md section 14)

| Touchpoint | Status |
| --- | --- |
| Data model and migration | Done: `alliances.hall_level` default 0 (every existing alliance starts at Camp), `AllianceTransactionType` gains `UPGRADE`. No new table, so no RLS line. |
| Game logic and API | Done: deposit slots and treasury cap in `AllianceBankService.deposit`, member cap on every join path, purchase service, `GET /api/alliances/upgrades`, `POST /api/alliances/upgrades/purchase`. Era boundary returns the hall to Camp. |
| Player UI | Done: Upgrades tab, deposit form limits, Overview hall level and member cap, invite panel cap, Upgrade type in bank history, `upgrade_alliance` in the rank editor. |
| Admin view and edit | Done: hall level column and member cap in the admin alliance list, hall level selector in the detail drawer, server-validated 0 to 5. |
| Admin audit trail | Done: `ADMIN_ALLIANCE_SET_HALL_LEVEL` with the previous and new level, written in the same transaction. |
| `/test` visual guide | Done: two `AllianceUpgradesView` specimens; deposit form and invite panel listed as live-only. |
| i18n, How to Play, FAQ, CHANGELOG | Done: en, de and es keys; How to Play alliances section and an FAQ entry; CHANGELOG balance entry. |
| Tests | Done: deposit slots and rolling window, treasury cap, member cap per join path, purchases, admin edit validation, routes; integration tests for a purchase race, deposit limits, the member cap and the era reset. |
