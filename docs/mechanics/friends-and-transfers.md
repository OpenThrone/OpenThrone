# Friends and gold transfers

Last verified against code: 2026-11-12 (alpha 8ffa50de)

Players can friend each other. Friends can send each other gold gifts, or ask a
friend for gold. Gifts cost a fee, are capped per day, and are blocked between
players who fought recently, so they cannot be used to move gold around freely.
Alliance gifts to members use the alliance treasury instead; see
[alliances.md](alliances.md).

## Rules

### Friends and enemies

- A player sends a friend request to another player. The other player accepts
  or declines. The sender can withdraw a pending request. Either side can end an
  accepted friendship.
- A request is refused while the two players have a pending or accepted
  relationship. A player cannot friend themselves.
- Past relationships don't block a pair forever, but these limits stop a player
  who has been told no from repeating the request:
  - **After a decline**, the player who was declined waits
    `friend.requestCooldownDays` (default 7). The player who declined can send
    a request at any time.
  - **After the decline limit**, `friend.requestMaxDeclines` declines in a row
    (default 3, 0 turns this off), only the other player can restart contact.
    A friendship between the pair clears the count.
  - **After a friendship ends**, both players wait `friend.requestCooldownDays`.
  - **After cancelling a request**, the player who cancelled waits 24 hours
    before asking that player again. Cancelling keeps the row (`cancelled`)
    so it can't be used to reset any of these limits.
  - **Across all players**, a player can send `friend.requestDailyCap` requests
    in a rolling 24 hours (default 20), counting cancelled ones.
- The profile page disables the add button while a limit applies and shows when
  the player can ask again.
- The service sets no maximum number of friends. Listing returns 50 rows by
  default (at most 100), and the "top" widget shows the 5 newest.
- Enemy relationships work the same way but only exist while the `ENABLE_ENEMIES`
  feature setting is on (default off). While it is off, enemy requests are
  refused and pending enemy requests cannot be accepted.
- Social writes are rate-limited per account. A player can read only their own
  relationships.
- Only friends can gift or request gold.

### Sending a gift

All of the following must hold when the gift is sent:

- The feature is on (`NEXT_PUBLIC_ENABLE_FRIEND_TRANSFER`, default on) and the
  two players are accepted friends.
- Both players have the Coal Mine economy upgrade (economy level 3 or higher).
  Below it, transfers are locked.
- Both accounts are at least 7 days old.
- Both players have reached the minimum level, `friend.transferMinLevel`
  (default 5, range 1 to 100). The window says which side is too low, and shows
  only whether the friend meets it, never the friend's level.
- The two players have not attacked each other, in either direction, in the last
  24 hours. Voided battles do not count.
- The recipient's account can play: banned, suspended, on vacation or closed
  accounts cannot receive.
- The amount is a whole number from 1 to the per-gift maximum (default
  1,000,000; env `FRIEND_TRANSFER_MAX_AMOUNT`). A note is optional, up to 200
  characters.
- The sender has not sent a gift within the cooldown (default 24 hours; env
  `FRIEND_TRANSFER_COOLDOWN_HOURS`, minimum 1). In effect that is one gift per
  cooldown window.
- Within a rolling game day (24 hours by default), the sender stays under their
  send limit and the recipient under their receive limit, set by the **sender's**
  and **recipient's** economy level:

  | Economy upgrade | Send per day | Receive per day | Fee |
  |---|---|---|---|
  | Coal Mine | 150,000 | 50,000 | 10% |
  | Tavern | 300,000 | 100,000 | 8% |
  | Copper Mine | 600,000 | 250,000 | 5% |
  | Meat Market and above | 1,250,000 | 500,000 | 3% |

  The recipient's total received from all senders is also capped by
  `friend.dailyReceivedCap` (default 3,000,000). The lower of the two receive
  limits applies. Fees do not count toward either limit.
- The fee is `floor(amount x fee% / 100)` at the **sender's** level, charged on
  top of the amount. The sender needs amount plus fee on hand. The fee is
  recorded against the system account and leaves the economy.
- Sending is idempotent per sender, friend and amount, and the sender's and
  recipient's rows are locked together, so a double click or parallel gifts
  cannot overspend or exceed a cap.

### Asking for gold

- A player can ask a friend for gold. The request needs the same unlock, account
  age, level and recent-fight conditions on both sides, with the friend as the
  sender and the requester as the recipient. The amount is 1 to the per-gift maximum.
- The same requester can ask the same friend once per cooldown window.
- A request expires after the cooldown length (default 24 hours). The friend
  accepts or declines. Accepting runs a normal gift from the friend to the
  requester right then, so every gift rule, cap, fee and the friend's cooldown
  apply at that moment. If a rule fails, the request stays unfulfilled.
- Pending requests show for 7 days, but an expired request cannot be accepted.

## Why it works this way

- The recipient daily cap exists to stop many friends funnelling gold into one
  account (comment in `FriendTransfer.ts`).
- Locked players cannot create gold requests either: both the requester and the
  friend who would pay need the Coal Mine (#205, comment in
  `FriendTransfer.service.ts`).
- Voided battles do not count as a recent fight (#229).

## Admin and settings

- Runtime Settings (Economy group): `friend.dailyReceivedCap`,
  `friend.transferMinLevel`, `friend.requestCooldownDays`,
  `friend.requestMaxDeclines` and `friend.requestDailyCap`. The enemy feature is the `ENABLE_ENEMIES` feature
  setting.
- The enable switch, per-gift maximum and cooldown are server environment
  settings, not runtime settings.
- Pair-level abuse checks run after each successful gift and are visible to staff
  only (see [abuse-signals.md](../abuse-signals.md)).

## Source

- [FriendTransfer.service.ts](../../src/services/FriendTransfer.service.ts): gift, request, accept, history, limits status.
- [FriendTransfer.ts](../../src/constants/FriendTransfer.ts): fixed limits, fee ladder, amount parsing.
- [Config.service.ts](../../src/services/Config.service.ts): environment switches for max amount and cooldown.
- [Social.service.ts](../../src/services/Social.service.ts): friend and enemy relationships.
- [runtimeSettings.ts](../../src/constants/runtimeSettings.ts): `friend.*` settings.
- Routes: [social API](../../src/pages/api/social), including the gift route under `friends/[friendId]` and `friends/transfer-limits`.

## Tests

- [FriendRequests.test.ts](../../src/constants/FriendRequests.test.ts): every request limit and how they combine.
- [Social.requestLimits.test.ts](../../src/services/__tests__/Social.requestLimits.test.ts): the limits on sending, cancelling and what the profile is offered.
- [Social.respond.test.ts](../../src/services/__tests__/Social.respond.test.ts): accepting, declining and ending a friendship.
- [FriendTransfer.test.ts](../../src/constants/FriendTransfer.test.ts): tier limits, fee ladder, level error parsing.
- [friendTransfer.service.test.ts](../../src/services/__tests__/friendTransfer.service.test.ts): gift rules, caps, unlock, age, recent fight, cooldown, requests, minimum level.
- [Social.relationshipConcurrency.test.ts](../../src/services/Social.relationshipConcurrency.test.ts): opposite-direction requests serialise.
- [gift-social-hardening.api.test.ts](../../src/__tests__/pages/api/social/gift-social-hardening.api.test.ts): gift and request input, enemy flag, rate limit.
- [relationship.api.test.ts](../../src/__tests__/pages/api/social/relationship.api.test.ts) and [listAll.api.test.ts](../../src/__tests__/pages/api/social/listAll.api.test.ts): a player reads only their own relationships.

## Known gaps

- `SocialService.cancelGoldRequest` has no API route, so a player cannot withdraw a pending gold request through the API.
- The pending-request list is not filtered by expiry, so a request can be listed for up to 7 days after it can no longer be accepted.
- `FRIEND_TRANSFER_FEE_PERCENTAGE` (env) is read by the config but the server fee comes from the economy ladder. Only the client modal falls back to it when limits are missing.
- The 50-row listing limit has no direct test.
