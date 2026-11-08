# Recruitment

Last verified against code: 2026-11-06 (alpha a365a67d)

Recruiting is a daily, capped way to gain citizens. There are two paths. A signed-in player can "recruit" another player through that player's recruit link and earn 250 gold and a citizen. Anyone, signed in or not, can visit a player's public recruit link to give that player a citizen. Auto-recruit repeats the first path automatically for supporters.

The "recruiter" in the code is the player who receives the reward. The link owner is the "sender" in the history table.

## Rules

### Recruit links

Every player has a recruit link. `/recruit/<link>` opens the external path by default. Adding `?mode=internal` opens the signed-in path (the Recruit button on a player profile does this). No referral or advisor recruiting path exists in the recruit services or API.

### Signed-in recruiting (internal)

- The reward goes to the signed-in visitor, never to the link owner: 250 gold plus 1 citizen. A running event can multiply the citizen (`recruitCitizenMultiplier`); the extra citizens count toward new-player-protection population. The gold is a fixed 250 in the API handler.
- Refused with `SELF_RECRUIT_REJECTED` when the link is the visitor's own. Refused when the link does not exist, or the sender row is missing. Anonymous callers get nothing: the endpoint needs a session.
- A captcha is required for every recruit (see below), unless the recruit is part of a live auto-recruit session.
- Limits, counted since the start of the current game day (calendar day in `America/New_York`, or the current era's start if later):
  - 5 recruits per day for the same pair (visitor and link owner).
  - `recruit.internalDailyCap` (default 250) recruits per day for the visitor across all link owners. The link owner has no cap on how many different visitors recruit them.
- Refusals use HTTP 409 with a code: `RECRUITER_DAILY_CAP_REACHED` or `PAIR_LIMIT_REACHED`. The recruit page asks `GET /api/recruit/<link>` first and never shows the captcha when a limit is already reached.
- `GET /api/recruit/status` reports used and remaining recruits and when the day resets.
- The handler adds a short random delay inside the transaction before paying out.
- The limits are re-checked inside the transaction under advisory locks on the recruiter and the link owner, so parallel requests cannot pass the cap together.
- Each recruit writes a `recruit_history` row (source INTERNAL) and a `RECRUITMENT` bank-history row. Recruit history is deleted after 20 days by the daily tick.

### Public link visits (external)

- The link owner receives 1 citizen and 0 gold. The visitor can be anonymous and gets nothing.
- Captcha required. The visit needs a detectable client address.
- Limits per link owner per game day: `recruit.dailyCap` (default 25) visits in total, and `recruit.externalIpDailyCap` (default 5) from one IP address. The legacy key name `recruit.dailyCap` means the external total.
- External visits never use the internal quotas, and internal recruits never use the external ones.
- `GET /api/recruit/external/<link>` returns what is left and whether to show the captcha without granting anything.

### Captcha

Required when Turnstile is configured (a server secret exists) or `NEXT_PUBLIC_USE_CAPTCHA=true`, unless `DISABLE_TURNSTILE`, `NEXT_PUBLIC_DISABLE_TURNSTILE` or `NEXT_PUBLIC_USE_CAPTCHA=false` switches it off. The token is verified on the reward request itself, single use, with a 5 second provider timeout. Missing secret, missing token or provider failure all fail closed.

### Auto-recruit

- The feature flag `AUTO_RECRUIT_ENABLED` is `false`. While it is off, only active supporters can use auto-recruit, and only while `ENABLE_SUPPORTER` is on. Everyone else gets HTTP 503 with `AUTO_RECRUIT_DISABLED` on every auto-recruit endpoint.
- It does not raise the ceiling: the same pair limit and the internal daily cap apply.
- A session is opened with one captcha check (`POST /api/recruit/startSession`). Recruits inside a live session skip the per-recruit captcha. A player may hold at most 2 active sessions; sessions idle for 5 minutes are deleted on the next start. A recruit through a session is refused ("Session expired") if the session had no activity for 1 minute.
- A numeric target is only accepted inside a session. Targets are picked at random from players who are not the recruiter, were created before the start of today's game day, have an ACTIVE latest status, and still have pair allowance. When the recruiter's cap is reached, the list is empty and the client stops.

## Why it works this way

- Rewards always go to the signed-in recruiter; anonymous visits "must never credit gold" (comment in the handler, test "rejects an anonymous link visit before any gold is credited").
- External and internal quotas are separate on purpose: the CHANGELOG records "signed-in recruitment and external recruitment links now have separate daily limits, including per-IP and global connection caps."
- Other recruiters do not use up one recruiter's per-target allowance (service comment).
- Captcha is checked on the reward endpoint, never in an earlier call, so a token cannot be reused for a different action (service comment).
- The recruit page pre-checks limits so players never solve a captcha for a refusal (route comment).

## Admin and settings

- Administration, System: Runtime Settings, group Recruiting: `recruit.internalDailyCap`, `recruit.dailyCap`, `recruit.externalIpDailyCap`. Each accepts 0 to 1000; invalid stored values fall back to the defaults.
- Administration, Events: a citizen multiplier with scope Recruiting or Both changes the citizens per recruit.
- Administration, Ledgers, Recruits: internal and external recruit rows (permission View Analytics).
- Environment: Turnstile switches above.

## Source

- [Recruitment.service.ts](../../src/services/Recruitment.service.ts)
- [recruitmentGuards.ts](../../src/services/recruitmentGuards.ts)
- [RecruitmentCaptcha.service.ts](../../src/services/RecruitmentCaptcha.service.ts)
- [AutoRecruitAccess.service.ts](../../src/services/AutoRecruitAccess.service.ts)
- [Sessions.service.ts](../../src/services/Sessions.service.ts)
- [AutoRecruit.ts](../../src/constants/AutoRecruit.ts)
- [recruit API](../../src/pages/api/recruit) (handleRecruitment, external, status, startSession, getRandomUser, auto-recruit, listSessions, verifySession, endSession, getRecruitHistory)
- [recruit page](../../src/pages/recruit/[id].tsx)
- [runtimeSettings.ts](../../src/constants/runtimeSettings.ts)

## Tests

- [AutoRecruitAccess.service.test.ts](../../src/services/__tests__/AutoRecruitAccess.service.test.ts): the supporter gate in `canAutoRecruit`.
- [Recruitment.service.test.ts](../../src/services/Recruitment.service.test.ts): limits re-checked after waiting for a concurrent recruit, missing sender, other player's session, era boundary, status per target.
- [recruitmentGuards.test.ts](../../src/services/recruitmentGuards.test.ts): session id parsing and the per-recipient lock.
- [RecruitmentCaptcha.service.test.ts](../../src/services/RecruitmentCaptcha.service.test.ts): fail-closed verification and the disable switches.
- [handleRecruitment.api.test.ts](../../src/__tests__/pages/api/recruit/handleRecruitment.api.test.ts): self and anonymous recruits, numeric targets, internal cap, session captcha rules, five-per-day pair limit.
- [externalRecruit.api.test.ts](../../src/__tests__/pages/api/recruit/externalRecruit.api.test.ts): owner credit, IP and total caps, captcha first, configured caps, independence from internal quotas.
- [recruitLink.api.test.ts](../../src/__tests__/pages/api/recruit/recruitLink.api.test.ts): the pre-check route cannot grant anything.
- [startSession.api.test.ts](../../src/__tests__/pages/api/recruit/startSession.api.test.ts): one captcha opens a session.
- [autoRecruitTargets.api.test.ts](../../src/__tests__/pages/api/recruit/autoRecruitTargets.api.test.ts): target selection honors pair and daily limits.
- [recruitmentCaps.test.ts](../../test/integration/recruitmentCaps.test.ts): concurrent external claims stop at the IP and total caps; internal and external stay independent.
- [autoRecruitFlow.test.ts](../../src/utils/autoRecruitFlow.test.ts) and [recruitmentStatus.test.ts](../../src/utils/recruitmentStatus.test.ts): client flow and status helpers.

## Known gaps

- The 250 gold reward is hard-coded in the handler and is not an admin setting.
- The code comment in [startSession.ts](../../src/pages/api/recruit/startSession.ts) says "1 active session per user" but the constant is 2.
- `strategy: 'linkBased'` in `performRecruitment` is never passed by any API route; only `'standard'` is. The service test still exercises both strategies.
- `TARGET_DAILY_CAP_ERROR` and `getTargetDailyCap` exist, and the client still handles `TARGET_DAILY_CAP_REACHED`, but signed-in recruiting never applies a per-target cap (the status API reports an unlimited target cap, and no server code calls `getTargetDailyCap`).
