# Anti-abuse assessment — Forgejo #6

Date: 2026-10-06. Source review and synthetic tests only; no production database, player records, credentials, or network services were accessed.

## Policy boundary

Multiple accounts are allowed. Shared IPs and shared devices are investigation context, never sufficient grounds for a ban. A household, VPN exit, school, or shared device can legitimately connect unrelated players. Review exploitation and resource movement rather than account count alone. This work does not add automated sanctions or change that policy.

## Verified defects corrected

### Gold request authorization, replay, and transaction boundaries

Before this change, `Social.service.ts::respondToGoldRequest(userId, data)` did not pass its authenticated actor to `FriendTransfer.service.ts`. The latter fetched the request by ID, did not verify the actor was the requested payer, did not require pending status or check expiry, and invoked `transferGoldToFriend` in a separate transaction. An authenticated caller could respond to another player's known request ID; an old request could be accepted again after the existing transfer cooldown. A failure recording completion could leave a committed transfer and a still-pending request. These are verified source defects; whether anybody exploited them is unknown.

Corrections:

- Pass and validate the authenticated actor, then require the actor to match the request recipient.
- Lock the request row before reading it, require pending status and a valid future expiry, and hold the lock until commit/rollback. Cancellation takes the same row lock to coordinate with acceptance/decline.
- Run debit, credit, bank history and request completion in one transaction. The private transfer helper uses the caller's transaction; there is no independently committed inner transfer.
- Lock participant account rows in ID order before checking balances and transfer cooldown. Cooldown reads now use that transaction; balance updates use increments/decrements.
- Require balance to cover the transfer plus its existing fee. The previous check covered only the principal and could produce negative Gold; an existing test actually expected that outcome and has been corrected.

Legacy requests missing valid expiry metadata now fail closed. Staff may need to have those requests cancelled and recreated. Existing fee, friendship, feature-enable, and cooldown rules remain in effect.

Sources: `src/services/Social.service.ts`, `src/services/FriendTransfer.service.ts`, `src/pages/api/social/gold-requests/[requestId]/respond.ts`.

### Recruitment limit concurrency and malformed sessions

`Recruitment.service.ts::performRecruitment` previously counted history and created rewards without serializing concurrent count/check/write operations. Multiple requests could each see four prior records and all grant a fifth reward. Both mutation endpoints call this shared service.

The service now acquires a PostgreSQL transaction advisory lock on the history recipient before checking the limit. Both endpoint transactions explicitly use Read Committed so the count after waiting sees the previous transaction's committed history. The history recipient remains the lock key even when `selfRecruit` selects a different reward recipient. All history and reward writes remain in the same transaction. This coordinates across app processes; it does not depend on an in-memory lock.

`handleRecruitment.ts` previously used `parseInt`, accepting a numeric prefix such as `12extra` and converting invalid/zero supplied session IDs into manual requests. Supplied IDs now must be positive decimal PostgreSQL integers; malformed IDs return the existing validation error response. Omitted IDs still select manual recruitment. Session lookup already scopes sessions to the actor; that behavior is retained and tested.

Sources: `src/services/Recruitment.service.ts`, `src/services/recruitmentGuards.ts`, `src/pages/api/recruit/handleRecruitment.ts`, `src/pages/api/recruit/[id].ts`.

PostgreSQL transaction advisory locks release automatically at transaction end and require cooperating writers; future recruitment writers must also call this service. See [PostgreSQL locking documentation](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS). The tagged SQL uses bound values rather than string concatenation; unsupported result types are cast to text as described in [Prisma raw query documentation](https://www.prisma.io/docs/orm/v7/prisma-client/using-raw-sql/raw-queries).

## Verified gaps remaining

| Area | Source evidence | Next step |
| --- | --- | --- |
| Captcha enforcement | `src/pages/recruit/[id].tsx` calls captcha verification first, then makes a separate recruitment request. Neither recruitment mutation endpoint verifies a captcha token or consumes a server-side proof of successful verification. A client can omit the first request. | Integrate verification into the reward mutation or consume a short-lived server-side proof scoped to the action/actor. Coordinate manual versus explicitly enabled auto-recruit behavior before implementing. |
| Rate-limit race | `src/lib/postgres-rate-limiter.ts` aggregates counts and separately upserts the bucket. Concurrent requests can all pass the pre-write check. | Implement an atomic shared-database limiter and concurrency tests against a disposable database. |
| Rate-limit key stability | `src/middleware/apiGuard.ts` includes `req.url` in its key. Different query strings can select different buckets for the same logical endpoint. | Key on normalized route/action plus actor and trusted client network identity; avoid client-controlled query text. |
| Client-IP trust | `src/utils/ipUtils.ts` trusts incoming `cf-connecting-ip`/`x-forwarded-for`, returning the full forwarding string. `highRiskLimiter` bypasses localhost values. Source contains no trusted-proxy boundary in those helpers. | Verify ingress strips/replaces these headers and restricts direct origin access; then centralize trusted-proxy parsing. External spoofability cannot be concluded from source alone. |
| Missing detection producers | Repository source search found consumers/updaters for `loginEvent` and `cheatSignal`, but no corresponding create calls. Successful credential login writes an audit `LOGIN`; that is a different data source. | Confirm whether an external service populates these tables; otherwise add privacy-conscious producers before relying on the admin clusters/signals. |
| Recruitment semantics | The two endpoints use different history direction/IP strategies; `selfRecruit` changes reward destination while quota records keep the original pair. GET eligibility and POST limit checks do not use identical direction/logic. No single global daily recipient cap is enforced by the shared mutation service. | Decide intended self-recruit/manual/guest behavior and global/per-pair caps, then unify eligibility and mutation rules. Do not infer a ban policy or change advertised limits during this fix. |
| Session creation limits | `startSession.ts` counts and creates sessions without serialized ownership locking; verification and mutation use different expiry rules. | Serialize session creation, align expiry, and test parallel creation/end/recruit scenarios. |

## Farm and automation investigation plan

These are hypotheses to investigate, not accusations or proven production activity:

1. Define permitted manual multiaccount use, assisted play, external automation, and resource pooling explicitly. Distinguish the built-in auto-recruit feature from unauthorized bots.
2. Use a separately enforced, sanitized operation service to return aggregate request timing, recruitment pairs, successful gameplay actions, and Gold transfer edges. Never supply raw production records, IPs, auth headers, emails or credential-bearing errors to an agent.
3. Review repeated requests immediately after failures, implausibly regular action intervals, large recruitment bursts, and repeated one-way transfers from low-interaction accounts. IP/device overlap adds context; it cannot establish common ownership or abuse alone.
4. Correlate rewards with successful participation and existing audit events. Do not equate an account appearing in rankings with successful login; activity eligibility is handled separately by the login/current-era work.
5. Present evidence and uncertainty to staff, with dismissal and appeal paths, before sanctions. Record reviewed decisions without exposing sensitive identifiers publicly.

## Validation and scope

- `bun --no-env-file test src/services/recruitmentGuards.test.ts src/services/Recruitment.service.test.ts`: seven tests for strict session IDs, parameterized lock keys, invalid recipients, simulated concurrent recruitment at the quota boundary for both strategies, and foreign-session rejection.
- `bun --no-env-file test src/services/__tests__/friendTransfer.service.test.ts`: 32 tests, including actor authorization, completed/cancelled replay, invalid/expired metadata (including expiry while waiting for balance locks), simulated duplicate acceptance, one transaction for completion and money writes, fee affordability, and existing transfers/history/cancellation behavior.
- ESLint on changed backend/test files: no errors; eight pre-existing unused declarations remain in existing service files.

The concurrency tests simulate transaction lock waits with mocked clients. They verify service ordering and mutation behavior, not a real PostgreSQL server's locking/rollback execution. Staging should validate concurrent recruitment, concurrent accept/cancel, and injected completion failure using disposable accounts and a backed-up synthetic database. No real database integration test or production cleanup was performed here.

Issue #6 remains open for captcha enforcement, limiter correctness, telemetry producers, deployment/proxy verification, and policy decisions. These fixes address verified defects without creating a broad account-scoring or blocking system.
