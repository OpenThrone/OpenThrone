# Alliances

Last verified against code: 2026-11-13 (alpha 237e566f)

An alliance is a player group with ranks, a shared gold treasury, member loans,
target lists, shared battle reports, announcements and a group chat. Its
Alliance Hall level (bought with treasury gold) sets how many members it holds,
how often each member may deposit and how much the treasury may hold. An
alliance may charge a join fee and recurring membership dues in gold. A player
can belong to three alliances and lead one. Alliance troops, dues and pillage
contributions are covered in [temporary-forces.md](../features/temporary-forces.md);
gold gifts between friends are in [friends-and-transfers.md](friends-and-transfers.md).

## Rules

### Membership

- Creating an alliance needs player level 10, 100,000,000 gold on hand (spent,
  not paid to anyone) and a name nobody else uses. Both numbers are fixed in
  code, not runtime settings. The creator becomes leader and gets the Member
  rank.
- A player can belong to at most 3 alliances at once and can lead at most one.
  The limit applies to creating, joining, requesting to join and accepting an
  invite. A new leader must lead no other alliance.
- An alliance holds at most its Alliance Hall level's member cap (10 at Camp,
  up to 100; see Alliance Hall). Joining an open alliance, accepting a join
  request and accepting an invite are refused at the cap with "The alliance is
  full (N/cap members at Level). Upgrade the Alliance Hall to raise it."; the
  last two re-check under the alliance row lock. Sending an invite and filing a
  join request are refused early too. An alliance already above its cap (an
  admin lowered the level, or a new era returned it to Camp) keeps every member
  but cannot add any. The directory card shows members against the cap
  (10 / 10) and, when full, says nobody can join until the hall is upgraded.
  Creating an alliance needs no check: it starts with one
  member.
- `join_mode` is chosen by the leader:
  - **Open**: anyone can join from the alliance page.
  - **Request to join**: the player files a request. Someone with
    `invite_member` accepts or rejects it. A player can have one pending
    request per alliance.
  - **Invite only**: nobody can join without an invite. Someone with
    `invite_member` invites a player by display name. The player accepts or
    declines. Invites can be withdrawn while pending.
- Everyone who joins gets the default Member rank. Neither requests nor invites
  expire on their own.
- A member can leave unless they lead. A leader must transfer leadership or
  disband first. Leaving returns borrowed troops, cancels the member's pending
  gold requests, and settles any treasury loan (see Loans).
- A member can be kicked by someone with `kick_member` whose rank is strictly
  above the target's. The leader cannot be kicked, and nobody can kick
  themselves. Kicking returns borrowed troops, cancels pending gold requests and
  settles loans like leaving does.
- Leadership transfers to a current member who leads no other alliance. Only
  the leader can do it.
- The leader can disband the alliance after typing its exact name, if no war
  involving it is still open. See Disbanding.
- Profile: the leader edits everything. A rank with `edit_profile` can edit the
  motto, description, avatar and banner only. Name, slug, join mode and roster
  visibility are leader-only.
- Visibility: people outside the alliance never see the treasury or the rank
  definitions. They see the roster (without rank permissions) only when
  `roster_visibility` is Public. A missing or unknown value hides the roster.
- Attacking a fellow member of an active alliance asks for confirmation first
  (`ALLIANCE_MEMBER_CONFIRMATION_REQUIRED`). A reserved alliance does not count.

### Ranks and permissions

The leader always holds every permission. Everyone else needs a rank whose
permissions set the key to true. Lower `rank_order` is a higher rank, and equal
ranks do not outrank each other.

| Permission | What it allows (server-enforced) |
|---|---|
| `invite_member` | Accept or reject join requests, send, view and cancel invites |
| `grant_access` | Change a member's rank |
| `edit_ranks` | Create, edit, reorder and delete ranks |
| `kick_member` | Kick members |
| `declare_war` | Declare and end wars |
| `manage_bank` | Transfer treasury gold, decide gold requests and loans |
| `approve_own_requests` | Approve your own gold request or loan (a banker also needs `manage_bank`) |
| `request_gold` | File gold requests and loan requests |
| `post_announcements` | Post, pin and delete announcements |
| `edit_profile` | Edit the public profile (not name, join mode, visibility) |
| `manage_allies` | Send, answer and break ally relations |
| `edit_list` / `view_list` | Change / read the Farm, Hit and Block lists |
| `share_reports` | Share a battle report with the alliance |
| `call_targets` | Open and close Hit, Farm and Recon calls |
| `upgrade_alliance` | Buy the next Alliance Hall level with treasury gold |
| `set_dues` | Set the join fee and membership dues |

`send_messages` and `manage_enemies` exist as keys but no server rule reads
them (see Known gaps). The default Member rank starts with `send_messages`,
`view_list`, `request_gold` and `share_reports`. `upgrade_alliance` was added
with the Alliance Hall and `set_dues` with the join fee and dues; both are
false on every existing rank until the leader or someone with `edit_ranks`
grants them.

Rank rules:

- A new rank is inserted just above Member, and a non-leader can only create
  ranks below their own. At most 50 ranks per alliance. Names are unique per
  alliance and 1 to 50 characters.
- A non-leader cannot grant a permission they do not hold, and can only edit,
  reorder or delete ranks below their own.
- The Member rank cannot be renamed, deleted or moved off the last place. A
  rank that members still hold cannot be deleted.
- Changing a member's rank needs `grant_access`. Both the member and the new
  rank must be strictly below the actor. Nobody except the leader can change
  their own rank, and nobody else can change the leader's.

### Treasury and bank

- Any member can deposit gold from their hand. A single deposit is at most
  `bank.depositCapPercent` of the gold on hand (default 80%).
- Each member may make the Alliance Hall level's number of deposits per
  rolling 24 hours (2 at Camp, up to 8), counted from that member's Deposit
  rows for that alliance. The next deposit is refused with the limit, the time
  until the next slot opens (24 hours after the deposit that must leave the
  window) and "Upgrade the Alliance Hall to raise it". This keeps alliance
  deposits from getting around the personal bank's deposits per day.
- A deposit may not take the treasury above the level's treasury cap
  (5,000,000 at Camp, up to 10,000,000,000). The refusal names the room left.
  Only deposits are capped: loan repayments, pillage and dues still arrive, and
  a treasury already above its cap keeps its gold but takes no deposits.
- The deposit form shows the deposits left in the window, when the next one
  opens, the room left under the cap and a link to the Upgrades tab.
- The leader, or a member with `manage_bank`, can transfer treasury gold to a
  current member, with an optional note of up to 200 characters. The treasury
  must hold the amount.
- Each member can receive a limited amount from the treasury per game day (24
  hours by default). Transfers, approved gold requests and loan principal all
  count, the leader's own transfers too. The limit is the alliance's
  `member_daily_cap` (leader-set, default 5,000,000), clamped to
  `alliance.memberDailyCapMax`.
- Bank history is visible to members only: the latest 50 rows of the current
  era.
- Pillage contributions and dues payments from alliance troops also credit the
  treasury (history type Tax), as do membership dues; join fees are type Fee.

### Alliance Hall (upgrades)

Rules live in [allianceLevels.ts](../../src/constants/allianceLevels.ts). The
owner approved them on 2026-11-11
([decision](../decisions/alliance-hall-levels.md)).

| Level | Name | Cost (treasury) | Needs members | Max members | Deposits per member per 24 h | Treasury cap |
|---|---|---|---|---|---|---|
| 0 | Camp | — | 0 | 10 | 2 | 5,000,000 |
| 1 | Hall | 2,000,000 | 5 | 20 | 3 | 25,000,000 |
| 2 | Great Hall | 10,000,000 | 10 | 35 | 4 | 100,000,000 |
| 3 | Keep | 50,000,000 | 20 | 50 | 5 | 500,000,000 |
| 4 | Citadel | 250,000,000 | 30 | 75 | 6 | 2,000,000,000 |
| 5 | Stronghold | 1,000,000,000 | 50 | 100 | 8 | 10,000,000,000 |

- Every alliance starts at Camp (`alliances.hall_level`, default 0; the
  migration put every existing alliance there).
- The leader, or a rank with `upgrade_alliance`, buys the next level from the
  Upgrades tab. Levels go one at a time: the request names the level and must
  be the current level + 1, so a stale page or a double click buys nothing.
- The purchase takes the era lifecycle shared lock and the alliance row lock,
  then re-checks: the alliance is Active, the buyer holds the permission, the
  alliance has the level's member count, and the treasury pays the cost through
  a conditional update (`gold_in_bank >= cost` and the level unchanged). It is
  recorded in bank history as type Upgrade with the note "Level N".
- Each cost fits under the treasury cap of the level below, and each member
  requirement fits under the member cap below, so every level is reachable;
  [allianceHall.test.ts](../../src/services/__tests__/allianceHall.test.ts)
  checks it.
- The Upgrades tab lists every level's cost, requirement, member cap, deposits
  and treasury cap, the current values, and the Buy button for the next level,
  disabled with its reason (reserved, no permission, members short, gold short).
  The Overview Stats card shows the hall level and members against the cap, and
  the invite panel shows the cap with a link to the Upgrades tab.

### Join fee and membership dues

Rules live in [allianceDues.ts](../../src/constants/allianceDues.ts). The owner
approved them on 2026-11-11
([decision](../decisions/alliance-join-fee-and-dues.md)). They are separate from
the troop dues and levies in
[temporary-forces.md](../features/temporary-forces.md).

| Setting | Allowed values |
|---|---|
| Join fee (`alliances.join_fee`) | 0 to 10,000,000 gold (default 0) |
| Dues period (`alliances.dues_period`) | None (default), Daily, Weekly, Monthly |
| Dues per member (`alliances.dues_amount`) | 0 with None; otherwise 1 to 1,000,000 (Daily), 5,000,000 (Weekly) or 20,000,000 (Monthly) |

- The leader, or a rank with `set_dues`, saves them on the Settings tab
  (`POST /api/alliances/dues/settings`). The alliance must be Active. An amount
  needs a period and a period needs an amount; the server checks both and the
  per-period maximum. The card lists the maximum for every period.
- **Join fee.** Every path that adds a member (open join, accepted join request,
  accepted invitation) charges the fee in force at that moment from the
  joiner's gold on hand, inside the joining transaction, after the alliance and
  player rows are locked (`lockAllianceThenUsers`). The debit is conditional on
  gold on hand; without it the join is refused with the fee in the message and
  nothing is written (a join request stays pending). The fee is credited to the
  treasury even above the Alliance Hall treasury cap and recorded as type Fee
  with the joiner as related user. The founder pays nothing. Changing the fee
  never touches existing members.
- An open join and an invitation acceptance send the fee the player confirmed
  (`expectedFee`); if it changed since, the join is refused and asks the player
  to review it.
- **Dues.** The daily cron (`/api/cronJobs/daily`, logged as its own
  `allianceDues` run) calls `AllianceDuesService.collectAll`. Period starts are
  the game day (OT midnight), Monday 00:00 OT and the 1st of the month 00:00 OT.
  For each Active alliance with dues, one transaction takes the era lifecycle
  shared lock, the alliance row and every member row in id order. Each
  non-leader member whose `dues_paid_through` is before the current period start
  owes their arrears plus one period's dues; gold on hand pays what it can (type
  Tax, member as related user), the rest is stored as `dues_arrears`, and
  `dues_paid_through` moves to the current period start. A conditional update
  on `dues_paid_through` and the alliance lock make a second or concurrent run
  charge nobody. A missed run charges one period, never several.
- Members are never charged for time before they joined: a join stores the
  current period start in `dues_paid_through`, a member with none (from before
  dues existed or after an era reset) is only marked, and saving a new period
  marks every member paid through the current one. Changing only the amount
  applies from the next period start.
- Nobody is removed for unpaid dues. A member pays arrears from gold on hand on
  the Overview or Bank tab (`POST /api/alliances/dues/pay`, capped at what is
  owed). With dues set to None, existing arrears are no longer collected
  automatically but can still be paid.
- Reserved alliances collect nothing. The era boundary clears every
  membership's `dues_arrears` and `dues_paid_through` with the treasury; the fee
  and dues settings stay.
- Visibility: the directory card, the page header and Stats card (for
  non-members) and invitations show the fee and dues; joining or accepting an
  invitation with either opens a confirmation; the join request card tells the
  officer the applicant pays the fee. Members see a Fee and dues card on
  Overview, Bank and Settings with the fee, the dues and period, the next
  collection, what they owe, Pay dues and a link to Settings. The Members tab
  shows each member's arrears to the leader, `manage_bank` and `set_dues`;
  the server strips other members' arrears for everyone else.

### Gold requests

- A member with `request_gold` can ask the treasury for gold, with a reason of
  up to 200 characters. At most `alliance.maxPendingGoldRequests` (default 3)
  can be pending per member per alliance.
- Managers (leader or `manage_bank`) approve or decline. Approval is an
  ordinary treasury transfer, so the daily limit and the treasury balance apply.
  If the treasury is short, the approval fails and the request stays pending.
- Approving your own request needs `approve_own_requests` (the leader always
  can). Declining your own request is always allowed.
- The requester can cancel while pending. Leaving or being kicked cancels
  pending requests.

### Loans

- A member with `request_gold` can request a loan. It is capped at the member
  daily limit. A member can have only one requested, active or defaulted loan per
  alliance, and cannot borrow anywhere while they have a defaulted loan.
- The leader sets, within the runtime bounds, the loan term
  (`loan_term_days`, default 7, bounds `alliance.loanTermMinDays` 1 to
  `alliance.loanTermMaxDays` 14), the flat interest
  (`loan_interest_pct`, default 10, at most `alliance.loanInterestMaxPercent`
  25) and the member daily limit (default 5,000,000, bounds
  `alliance.memberDailyCapMin` 100,000 to `alliance.memberDailyCapMax`
  50,000,000).
- Interest is fixed when the request is filed: owed = principal plus interest,
  rounded up to whole gold. A later change to the alliance rate does not change
  a requested loan. The term starts at approval.
- Managers approve or decline. Approving pays the principal out through the
  ordinary treasury transfer (daily limit and balance apply; failure rolls the
  approval back). Own-loan approval follows the same `approve_own_requests`
  rule as gold requests. A borrower can cancel while the request is pending.
- Repayment:
  - Manual: from gold on hand, up to the remaining balance.
  - Automatic: `alliance.loanIncomeSharePercent` (default 25%) of the
    borrower's new economy income and battle pillage goes to the oldest open
    loan first, never above the balance. The treasury is credited shortly
    after, in a separate step.
- Overdue: the daily cleanup seizes what is owed from gold on hand, then the
  personal bank. If that is not enough, the loan becomes **Defaulted** once, the
  leader and `manage_bank` holders are told in the alliance chat, and the loan
  keeps being collected every day. A defaulted loan blocks new loans and
  deposits into the personal bank.
- Leaving collects the loan from hand, then bank. If that falls short, the leave
  is refused. A kick collects what it can and writes off the rest. Account
  erasure collects what it can and keeps the remainder owed by the erased
  account. Disbanding writes all loans off.
- A reserved alliance collects nothing, accepts no repayments and approves no
  loans. Open loans move their due date out by the reserved time on
  reactivation. Loans are written off at an era boundary.

### Diplomacy (allies)

- Someone with `manage_allies` sends an ally request to an active alliance. An
  alliance cannot ally itself, repeat a request, or ally an alliance it is at
  war with (a war still warming up or active).
- Only the receiving side can accept (it also needs `manage_allies`) or decline.
  Either side can break an active alliance, and the sender can cancel a pending
  request.

### Wars

- Someone with `declare_war` declares war on another active alliance or on a
  single player outside their own alliance. `manage_enemies` is no longer
  enough. A second war with the same target while one is open is refused.
- A new war starts in WARMUP with a start time 24 hours later. Linked Discord
  accounts of both sides get an alert.
- Someone with `declare_war` in either alliance can end it. An open war blocks
  disbanding.
- Wars carry no combat or scoring rule in the current code (see Known gaps).

### Lists, intel and calls

- Farm, Hit and Block lists hold players. `edit_list` changes them, `view_list`
  reads them (25 per page, notes up to 200 characters). A player is listed once
  per list. Members of the same alliance can be blocked but not put on Farm or
  Hit. The system account can never be listed. The battle page looks up a
  target on every list the viewer may read.
- Sharing a report needs `share_reports`, and the actor must be the attacker or
  defender of that battle (the target of a spy mission that got through is
  not its defender for this; see [spying.md](spying.md)). A report can be shared with a given alliance once.
  Sharing gives the alliance read access under the usual shared-report
  redaction. Only the defender can flag a shared report as a threat. A share can
  be attached to an open call of the same alliance.
- A call (Hit, Farm or Recon) needs `call_targets` and a target who is not in
  the alliance. Only one call of each type can be open per target; a second is
  refused (code `ALLIANCE_CALL_DUPLICATE`, shown in the player's language).
  Hit and Farm also add the target to the matching list (once).
  Everyone else is told in the alliance chat. `call_targets` holders or the
  call's creator can close it. The intel feed shows 20 reports per page.

### Announcements and chat

- `post_announcements` posts a title (up to 120 characters) and body (up to
  4,000), as plain text. At most 10 can be posted per alliance per 24 hours;
  deleted posts still count. Pinned posts list first.
- Posters can pin and delete any post. An author can delete their own.
- Announcements, intel calls and loan-default notices go to one private alliance
  chat room. The room is created on first use, and its participants are
  re-synced to the roster on every post, and members can also open it (creating
  it) with "Open alliance chat" on the Overview (`POST /api/alliances/chat`).
  A reserved alliance has no chat: the server refuses to open it and the
  Overview hides the chat card.
  Leaving or being kicked removes the player from the room.
- The internal-battles tab lists attacks this era between two current members,
  20 per page, for members only.

### Disbanding

- The leader types the alliance name. The treasury is split evenly across all
  members (the leader included), and the remainder goes to the leader. Loans are
  written off, borrowed troops return, the troop ledger is archived, and the
  chat room, wars, memberships and ranks are removed.
- When an account is erased, it leaves every alliance. An erased leader is
  succeeded by the highest-ranked remaining member (ties go to the longest
  member, then the lowest id), skipping anyone who already leads another
  alliance. If nobody remains, the alliance is disbanded through the same path.

### Reserved alliances and reactivation

- An ordinary era rollover or current-era reset moves every alliance from
  Active to **Reserved**. Name, artwork, leader, roster and rank definitions are
  kept. The treasury is set to zero (not paid out), loans are written off,
  pending loan, gold and join requests are cancelled, open wars end (kept as
  history), alliance XP and upgrades are cleared, and the Alliance Hall returns
  to Camp (level 0). Members above Camp's cap stay.
- While reserved, treasury, loans, troop contracts, dues, wars, diplomacy,
  lists, intel, announcements, internal battles, recruiting and profile edits
  are refused, and lists, pillage contributions and shared reports stop having
  effect. Members can still leave. The leader can still kick and transfer
  leadership.
- The leader reactivates it: they must have entered the current era, reached
  `alliance.reactivationMinLevel` (default 10) and hold
  `alliance.reactivationCostGold` (default 10,000,000) on hand. The gold is
  spent. A repeat submit does not charge twice. Reactivation is audited.
- Only the admin factory restore deletes alliances.

## Why it works this way

- The treasury is discarded at an era boundary rather than paid out, because the
  same boundary resets every member's gold and a payout would mint new-era gold
  from nothing (`allianceStatus.ts`).
- Leaving never forgives a debt: income diversion and the overdue sweep follow
  the loan and borrower, not membership. Only the era boundary forgives
  (`AllianceLoan.service.ts`).
- Loan repayments from income are parked and moved into the treasury in a later
  step, so income code never takes the alliance lock out of order
  (`AllianceLoan.service.ts`).
- Deleted announcements still count toward the daily limit so deleting cannot
  bypass it (`AllianceAnnouncements.service.ts`).
- Members of the same alliance cannot be put on Farm or Hit lists, and an
  alliance cannot call one of its own members.
- Announcements and calls go to the alliance chat because they used to be
  written to a legacy messages table no page reads (`AllianceRoom.service.ts`).

- Alliance Hall levels are era progression: they are bought with treasury gold,
  and the treasury itself is discarded at the boundary, so the hall returns to
  Camp with it (`allianceStatus.ts`).
- The member cap never removes anyone: an alliance above it only stops adding,
  so an admin edit or a new era cannot cost players their alliance.
- Unpaid dues become arrears instead of removing anyone, as the owner approved;
  the alliance decides what to do about members who owe.

## Admin and settings

- Runtime settings (admin Runtime Settings page, group Alliances):
  `alliance.maxPendingGoldRequests`, `alliance.loanTermMinDays`,
  `alliance.loanTermMaxDays`, `alliance.loanInterestMaxPercent`,
  `alliance.memberDailyCapMin`, `alliance.memberDailyCapMax`,
  `alliance.loanIncomeSharePercent`, `alliance.reactivationMinLevel`,
  `alliance.reactivationCostGold`. `bank.depositCapPercent` (group Economy) also
  sets the deposit cap. Minimum cannot exceed maximum for the term and daily
  limit pairs.
- Admin Alliances page (`MANAGE_ALLIANCES`): transfer leadership, rename, remove a
  member, clear cooldowns, forgive a loan, cancel a loan request, reserve or
  reactivate (no gold cost), end a war, set the Alliance Hall level (0 to 5, no
  cost or member requirement, validated server-side, audited as
  `ADMIN_ALLIANCE_SET_HALL_LEVEL` with the previous and new level), set the
  join fee and dues (same bounds as players, audited as
  `ADMIN_ALLIANCE_SET_DUES` with the previous and new values), and dissolve.
  Each action is audited. The list shows members against the cap and the hall
  level; the drawer's member list shows each member's dues arrears. The hall
  level and fee/dues edits send the values the drawer loaded; if the alliance
  changed them meanwhile (a purchase, or the leader's Settings card) the edit is
  refused and nothing is saved, so staff never silently undo a player change.
- Edit Player shows each alliance membership's dues arrears and lets an
  administrator set them (whole gold, 0 to 1,000,000,000, with the loaded value
  as a stale check); the change is in the `ADMIN_USER_UPDATE` audit diff under
  `duesArrears`.
- Staff can read alliance troops and dues on the admin Forces page; see
  [temporary-forces.md](../features/temporary-forces.md).

## Source

- [Alliance.service.ts](../../src/services/Alliance.service.ts): create, join, leave, kick, ranks, invites, requests, disband, erasure.
- [allianceStatus.ts](../../src/services/allianceStatus.ts): Active and Reserved gate, era boundary.
- [AllianceReactivation.service.ts](../../src/services/AllianceReactivation.service.ts): reactivation and admin status override.
- [AllianceBank.service.ts](../../src/services/AllianceBank.service.ts): deposits (slots per 24 hours, treasury cap), transfers, daily limit, history.
- [AllianceUpgrade.service.ts](../../src/services/AllianceUpgrade.service.ts): Alliance Hall status and purchases.
- [allianceLevels.ts](../../src/constants/allianceLevels.ts): the Alliance Hall table.
- [AllianceUpgrades.tsx](../../src/components/alliance/AllianceUpgrades.tsx): Upgrades tab.
- [AllianceDues.service.ts](../../src/services/AllianceDues.service.ts): join fee charge, fee and dues settings, status, arrears payment, dues collection.
- [allianceDues.ts](../../src/constants/allianceDues.ts): fee and dues bounds and period starts.
- [AllianceMembershipDues.tsx](../../src/components/alliance/AllianceMembershipDues.tsx): Fee and dues card, settings card, join terms.
- [AllianceGoldRequest.service.ts](../../src/services/AllianceGoldRequest.service.ts): gold requests.
- [AllianceLoan.service.ts](../../src/services/AllianceLoan.service.ts): loans, repayment, default, disband split.
- [AllianceDiplomacy.service.ts](../../src/services/AllianceDiplomacy.service.ts): allies.
- [AllianceWar.service.ts](../../src/services/AllianceWar.service.ts): wars.
- [AllianceLists.service.ts](../../src/services/AllianceLists.service.ts): Farm, Hit and Block lists.
- [AllianceIntel.service.ts](../../src/services/AllianceIntel.service.ts): shared reports and calls.
- [AllianceAnnouncements.service.ts](../../src/services/AllianceAnnouncements.service.ts): announcements.
- [AllianceRoom.service.ts](../../src/services/AllianceRoom.service.ts): alliance chat room.
- [AllianceInternalBattles.service.ts](../../src/services/AllianceInternalBattles.service.ts): friendly-fire log.
- [alliances.ts](../../src/constants/alliances.ts), [alliancePermissions.ts](../../src/constants/alliancePermissions.ts), [allianceTreasury.ts](../../src/constants/allianceTreasury.ts), [runtimeSettings.ts](../../src/constants/runtimeSettings.ts): limits and settings.
- [AttackService.ts](../../src/services/AttackService.ts): friendly-fire confirmation.
- Routes: [alliances API](../../src/pages/api/alliances), [admin alliances API](../../src/pages/api/admin/game/alliances).

## Tests

- [alliance.management.test.ts](../../src/services/__tests__/alliance.management.test.ts): ending wars and reordering ranks.
- [alliance.management.test.ts](../../src/services/__tests__/alliance.management.test.ts): leave, kick, rank and permission rules, disband, war permission, erasure succession.
- [alliance.multiMembership.test.ts](../../src/services/__tests__/alliance.multiMembership.test.ts): three-membership limit, one led alliance.
- [alliance.racesAndPrivacy.test.ts](../../src/services/__tests__/alliance.racesAndPrivacy.test.ts): roster and treasury visibility, locked create, join, accept and leadership transfer.
- [allianceTreasury.test.ts](../../src/services/__tests__/allianceTreasury.test.ts): deposit cap, transfers, gold requests, own-approval rule.
- [allianceHall.test.ts](../../src/services/__tests__/allianceHall.test.ts): Alliance Hall table and reachability, deposit slots and the rolling window, treasury cap, purchases (debit, member requirement, funds, reserved, permission, one level at a time), status.
- [alliance.memberCap.test.ts](../../src/services/__tests__/alliance.memberCap.test.ts): member cap on join, accept request, accept invite, invite and request, alliances above the cap.
- [allianceHallLevel.api.test.ts](../../src/__tests__/pages/api/admin/allianceHallLevel.api.test.ts): admin hall level edit, validation and audit.
- [upgrades.api.test.ts](../../src/__tests__/pages/api/alliances/upgrades.api.test.ts): Upgrades routes.
- [allianceDues.test.ts](../../src/services/__tests__/allianceDues.test.ts): join fee on every join path and its rollback, fee changed since confirmation, settings permission and bounds, dues collection (full, partial, arrears first, idempotent, missed runs, new and unmarked members, reserved, leader exempt), arrears payment, arrears visibility.
- [allianceDues.test.ts](../../src/constants/allianceDues.test.ts): bounds and period starts.
- [dues.api.test.ts](../../src/__tests__/pages/api/alliances/dues.api.test.ts): fee and dues routes.
- [allianceDues.api.test.ts](../../src/__tests__/pages/api/admin/allianceDues.api.test.ts): admin fee and dues edit, validation and audit.
- [admin-hardening.api.test.ts](../../src/__tests__/pages/api/admin/admin-hardening.api.test.ts): Edit Player dues arrears edit, stale check, bounds and audit.
- [CurrentEraReset.service.test.ts](../../src/services/__tests__/CurrentEraReset.service.test.ts): the era reset clears dues arrears.
- [allianceDues.test.ts](../../test/integration/allianceDues.test.ts): two concurrent dues runs charge once, arrears payment, the join fee on a real join and its rollback (real database).
- [allianceHall.test.ts](../../test/integration/allianceHall.test.ts): two concurrent purchases charge once, deposit slots, treasury cap, member cap on a real join (real database).
- [allianceBank.lockOrder.test.ts](../../src/services/__tests__/allianceBank.lockOrder.test.ts): treasury lock order.
- [allianceLoans.test.ts](../../src/services/__tests__/allianceLoans.test.ts): interest, approval, repayment, default, exit, disband, settings.
- [alliance.listsAndAllies.test.ts](../../src/services/__tests__/alliance.listsAndAllies.test.ts): lists, ally diplomacy, name search.
- [alliance.intel.test.ts](../../src/services/__tests__/alliance.intel.test.ts): shared reports and calls.
- [alliance.announcements.test.ts](../../src/services/__tests__/alliance.announcements.test.ts): announcements and limits.
- [alliance.internalBattles.test.ts](../../src/services/__tests__/alliance.internalBattles.test.ts): friendly-fire tab.
- [allianceStatus.test.ts](../../src/services/allianceStatus.test.ts): reserved gate.
- [allianceReserve.test.ts](../../test/integration/allianceReserve.test.ts): era rollover (treasury and Alliance Hall reset), every feature refused while reserved, reactivation (real database).
- [allianceReserveHardening.test.ts](../../test/integration/allianceReserveHardening.test.ts): loans and credits across the era boundary, war race, attack confirmation.
- [runtimeSettings.test.ts](../../src/constants/runtimeSettings.test.ts): setting registry.

## Known gaps

- `send_messages` and `manage_enemies` are stored and shown in the rank editor, but no server code checks them.
- Nothing moves a war from WARMUP to ACTIVE or COOLDOWN, and no battle, score or protection rule reads a war. Wars are records that block disbanding and allying. Ending a war has no test.
- Ally relations are read only by the diplomacy service and the admin page. They change no combat, intel or chat behavior.
- `alliance_cooldowns` (Leave, Kick) is read and cleared by the admin page, but no player flow creates or checks a cooldown, so there is no rejoin cooldown.
- The `decide` comment in `AllianceLoan.service.ts` says approval snapshots the alliance's current interest. The code keeps the interest quoted at request time and only takes the term at approval.
- Invite flows and the profile-edit split have thin or no direct tests.
- Refusals from the Alliance Hall, upgrade, join fee and dues flows carry a
  stable `code` and numeric `params` (`src/constants/allianceErrors.ts`,
  `publicErrorBody`), and the browser shows `alliances:errors.<code>` in the
  player's language (`src/utils/allianceErrorMessage.ts`). Other alliance
  refusals (wars, lists, loans, announcements) are still English text from the
  server; add a code, params and an `errors.*` entry in en, de and es to move
  one over. A test checks every code has all three languages.
- Gold amounts on alliance screens are written in full for the page language
  (`src/utils/formatWhole.ts`), not the account locale and not abbreviated.
  Gold inputs group digits the same way (`wholeGoldSeparators`), and the
  treasury, loan, announcement and intel dates and amounts use the page
  language too. The game sidebar and other shared pages still format with the
  account locale, so a German page viewed with an English account locale can
  show both 1,000 and 1.000.
- Saving a new amount between a period start and that day's cron run applies
  the new amount to the period that just started.
- The legacy `alliance_fees` table (frequency, amount, exempt ranks), shown in
  the admin drawer, predates the join fee and dues and no code writes it.
- The legacy `alliance_upgrades` and `alliance_xp` tables (cleared at each era
  boundary, shown in the admin drawer) are unrelated to the Alliance Hall and
  no player flow writes them.
