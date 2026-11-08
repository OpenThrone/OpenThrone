# Alliances

Last verified against code: 2026-11-06 (alpha d59b12d9)

An alliance is a player group with ranks, a shared gold treasury, member loans,
target lists, shared battle reports, announcements and a group chat. A player
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

`send_messages` and `manage_enemies` exist as keys but no server rule reads
them (see Known gaps). The default Member rank starts with `send_messages`,
`view_list`, `request_gold` and `share_reports`.

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
  treasury (history type Tax).

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
  defender of that battle. A report can be shared with a given alliance once.
  Sharing gives the alliance read access under the usual shared-report
  redaction. Only the defender can flag a shared report as a threat. A share can
  be attached to an open call of the same alliance.
- A call (Hit, Farm or Recon) needs `call_targets` and a target who is not in
  the alliance. Hit and Farm also add the target to the matching list (once).
  Everyone else is told in the alliance chat. `call_targets` holders or the
  call's creator can close it. The intel feed shows 20 reports per page.

### Announcements and chat

- `post_announcements` posts a title (up to 120 characters) and body (up to
  4,000), as plain text. At most 10 can be posted per alliance per 24 hours;
  deleted posts still count. Pinned posts list first.
- Posters can pin and delete any post. An author can delete their own.
- Announcements, intel calls and loan-default notices go to one private alliance
  chat room. The room is created on first use, and its participants are
  re-synced to the roster on every post. Leaving or being kicked removes the
  player from the room.
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
  history), and alliance XP and upgrades are cleared.
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
  reactivate (no gold cost), end a war, and dissolve. Each action is audited.
- Staff can read alliance troops and dues on the admin Forces page; see
  [temporary-forces.md](../features/temporary-forces.md).

## Source

- [Alliance.service.ts](../../src/services/Alliance.service.ts): create, join, leave, kick, ranks, invites, requests, disband, erasure.
- [allianceStatus.ts](../../src/services/allianceStatus.ts): Active and Reserved gate, era boundary.
- [AllianceReactivation.service.ts](../../src/services/AllianceReactivation.service.ts): reactivation and admin status override.
- [AllianceBank.service.ts](../../src/services/AllianceBank.service.ts): deposits, transfers, daily limit, history.
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
- [allianceBank.lockOrder.test.ts](../../src/services/__tests__/allianceBank.lockOrder.test.ts): treasury lock order.
- [allianceLoans.test.ts](../../src/services/__tests__/allianceLoans.test.ts): interest, approval, repayment, default, exit, disband, settings.
- [alliance.listsAndAllies.test.ts](../../src/services/__tests__/alliance.listsAndAllies.test.ts): lists, ally diplomacy, name search.
- [alliance.intel.test.ts](../../src/services/__tests__/alliance.intel.test.ts): shared reports and calls.
- [alliance.announcements.test.ts](../../src/services/__tests__/alliance.announcements.test.ts): announcements and limits.
- [alliance.internalBattles.test.ts](../../src/services/__tests__/alliance.internalBattles.test.ts): friendly-fire tab.
- [allianceStatus.test.ts](../../src/services/allianceStatus.test.ts): reserved gate.
- [allianceReserve.test.ts](../../test/integration/allianceReserve.test.ts): era rollover, every feature refused while reserved, reactivation (real database).
- [allianceReserveHardening.test.ts](../../test/integration/allianceReserveHardening.test.ts): loans and credits across the era boundary, war race, attack confirmation.
- [runtimeSettings.test.ts](../../src/constants/runtimeSettings.test.ts): setting registry.

## Known gaps

- `send_messages` and `manage_enemies` are stored and shown in the rank editor, but no server code checks them.
- Nothing moves a war from WARMUP to ACTIVE or COOLDOWN, and no battle, score or protection rule reads a war. Wars are records that block disbanding and allying. Ending a war has no test.
- Ally relations are read only by the diplomacy service and the admin page. They change no combat, intel or chat behavior.
- `alliance_cooldowns` (Leave, Kick) is read and cleared by the admin page, but no player flow creates or checks a cooldown, so there is no rejoin cooldown.
- The `decide` comment in `AllianceLoan.service.ts` says approval snapshots the alliance's current interest. The code keeps the interest quoted at request time and only takes the term at approval.
- Invite flows and the profile-edit split have thin or no direct tests.
