# Recruitment

Last verified against code: 2026-11-13 (alpha 7b8a6a5a)

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

Recruiting has its own captcha, separate from the Turnstile check on sign-up, sign-in and appeals. The provider is the server setting `recruit.captchaProvider`: `altcha` (default) or `turnstile`. An administrator can switch it in Administration, System: Runtime Settings, group Recruiting, and it takes effect within seconds, without a deploy.

- **When it is required.** `NEXT_PUBLIC_USE_CAPTCHA=false` turns off the recruit captcha entirely, for either provider. `DISABLE_TURNSTILE` and `NEXT_PUBLIC_DISABLE_TURNSTILE` turn off Turnstile only: with Turnstile selected recruiting needs no captcha, and ALTCHA keeps running, so a host can keep sign-in captcha-free and still check recruits. Otherwise it is required once a usable provider is configured: `ALTCHA_HMAC_KEY`, a Turnstile secret that is not switched off, or `NEXT_PUBLIC_USE_CAPTCHA=true`. If ALTCHA is selected but `ALTCHA_HMAC_KEY` is missing or shorter than 16 characters, recruiting uses Turnstile when it is usable; otherwise a required provider that lacks its secret fails closed.
- **ALTCHA** is self-hosted proof of work: no third party, no cookies. `GET /api/recruit/captcha-challenge` (rate limited per IP, open to anonymous visitors) issues a PBKDF2 challenge signed with `ALTCHA_HMAC_KEY` (at least 16 characters) that expires after 5 minutes. It answers 409 `ALTCHA_NOT_IN_USE` when ALTCHA is not the active provider (including the Turnstile fallback), and 503 `CAPTCHA_UNAVAILABLE` when ALTCHA is selected without a usable key. The server hides the answer's counter between half of `recruit.altchaDifficulty` and the full value (default 4000), so the work is steady and verification is a single HMAC check, done locally with no network call. The widget starts solving as the page loads (`auto="onload"`); a solved payload goes to the same submit as the old Turnstile token (`captchaToken`).
- **Replay.** Each verified payload records its challenge nonce in `altcha_used_challenges` until it expires; a second use is refused with `CAPTCHA_FAILED`. Only verified payloads write rows, expired rows are purged opportunistically, and the table has row level security.
- **Turnstile** is the fallback: the token is verified on the reward request itself with a 5 second provider timeout, and only the recruit pages load the Cloudflare script when it is the provider.
- Both providers verify on the reward request itself (or `startSession` for auto-recruit), single use. Missing key or secret, missing token, a token of the other provider or a provider failure all fail closed. A missing or short `ALTCHA_HMAC_KEY` is logged once, when ALTCHA tries to issue or check a challenge without it.
- Eligibility responses (`GET /api/recruit/<link>`, `GET /api/recruit/external/<link>`) and the `startSession` refusal carry `captchaProvider` so the client renders the right widget; the client never reads the provider from a build variable.
- A failed, expired or refused ALTCHA check ends the attempt with a translated message and a retry button. Neither the recruit page nor auto-recruit solves again by itself after a refusal, so a persistent refusal cannot loop.

### Auto-recruit

- The feature flag `AUTO_RECRUIT_ENABLED` is `false`. While it is off, only active supporters can use auto-recruit, and only while `ENABLE_SUPPORTER` is on. Everyone else gets HTTP 503 with `AUTO_RECRUIT_DISABLED` on every auto-recruit endpoint.
- It does not raise the ceiling: the same pair limit and the internal daily cap apply.
- A session is opened with one captcha check (`POST /api/recruit/startSession`; ALTCHA or Turnstile by the setting). Recruits inside a live session skip the per-recruit captcha. A player may hold at most 2 active sessions; sessions idle for 5 minutes are deleted on the next start. A recruit through a session is refused ("Session expired") if the session had no activity for 1 minute.
- A numeric target is only accepted inside a session. Targets are picked at random from players who are not the recruiter, were created before the start of today's game day, have an ACTIVE latest status, and still have pair allowance. When the recruiter's cap is reached, the list is empty and the client stops.

## Why it works this way

- Rewards always go to the signed-in recruiter; anonymous visits "must never credit gold" (comment in the handler, test "rejects an anonymous link visit before any gold is credited").
- External and internal quotas are separate on purpose: the CHANGELOG records "signed-in recruitment and external recruitment links now have separate daily limits, including per-IP and global connection caps."
- Other recruiters do not use up one recruiter's per-target allowance (service comment).
- Captcha is checked on the reward endpoint, never in an earlier call, so a token cannot be reused for a different action (service comment).
- The recruit page pre-checks limits so players never solve a captcha for a refusal (route comment).
- ALTCHA replaced Turnstile on this path because players waited up to about 20 seconds on it; Turnstile stays selectable ([decision](../decisions/altcha-for-recruiting.md)).

## Admin and settings

- Administration, System: Runtime Settings, group Recruiting: `recruit.internalDailyCap`, `recruit.dailyCap`, `recruit.externalIpDailyCap`. Each accepts 0 to 1000; invalid stored values fall back to the defaults. `recruit.captchaProvider` (`altcha` or `turnstile`) picks the captcha and `recruit.altchaDifficulty` (100 to 200000, default 4000) sets how long ALTCHA takes to solve; neither changes any limit or reward.
- Administration, Events: a citizen multiplier with scope Recruiting or Both changes the citizens per recruit.
- Administration, Ledgers, Recruits: internal and external recruit rows (permission View Analytics).
- Environment: `ALTCHA_HMAC_KEY` (server secret, at least 16 characters; until it is set, recruiting falls back to Turnstile), the Turnstile switches above.

## Source

- [Recruitment.service.ts](../../src/services/Recruitment.service.ts)
- [recruitmentGuards.ts](../../src/services/recruitmentGuards.ts)
- [RecruitmentCaptcha.service.ts](../../src/services/RecruitmentCaptcha.service.ts)
- [AltchaCaptcha.service.ts](../../src/services/AltchaCaptcha.service.ts)
- [AltchaChallenge.tsx](../../src/components/AltchaChallenge.tsx)
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
- [RecruitmentCaptcha.service.test.ts](../../src/services/RecruitmentCaptcha.service.test.ts): the provider switch, the Turnstile fallback when the ALTCHA key is missing or too short, fail-closed verification for both providers and the disable switches.
- [AltchaCaptcha.service.test.ts](../../src/services/AltchaCaptcha.service.test.ts): challenge issue, expiry, forged signature, wrong key and scope, and one-time use.
- [altchaRecruit.api.test.ts](../../src/__tests__/pages/api/recruit/altchaRecruit.api.test.ts) and [captchaChallenge.api.test.ts](../../src/__tests__/pages/api/recruit/captchaChallenge.api.test.ts): the recruit endpoints refuse missing, forged and reused ALTCHA payloads; the challenge route, including 409 after the Turnstile fallback and 503 when neither provider has a secret.
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
