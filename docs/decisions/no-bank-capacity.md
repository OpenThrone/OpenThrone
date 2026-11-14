# The bank has no capacity limit

Date: 2026-11-09. Rules: [Economy](../mechanics/economy.md#bank).

## Decision

The personal bank balance has no upper limit. Deposits are limited only by the share of gold on hand (`bank.depositCapPercent`) and by deposits per day. The `bankCap` values the Economy tiers carried (10,000,000 gold on the Farm up to 500,000,000) are removed, and the balance simulator no longer applies them either.

## Reason given

v0.13.0 (PR #376) started enforcing `bankCap` as one of six audit bug fixes, because How to Play said Economy upgrades raise how much the bank holds. The owner had not approved it as a gameplay change. They found it as a player: deposits stopped at 10,000,000 gold "with no clear telltale way to increase it".

Offered the choice between repealing the cap and keeping it with UI that shows each limit and how to raise it, the owner chose to repeal it. The facts in front of them: the next tier (25,000,000) needs fort Town, which needs player level 10, and the one after (50,000,000) needs level 30. At the pace of Era 2 so far, nearly every player would stay at 10,000,000 or 25,000,000 for the rest of the era, a few days of an active player's income.

## What follows from it

- How to Play says Economy upgrades raise deposits per day, not how much the bank holds.
- Gold banked while the cap applied was never touched, so no balance needed correcting.
- A bank capacity is a gameplay rule. Bringing one back follows [AGENTS.md](../../AGENTS.md) section 17: the owner's approval, numbers from production, and UI that shows the limit where it bites and on the upgrade that raises it.
