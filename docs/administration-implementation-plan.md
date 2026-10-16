# Administration implementation plan

Source: [2026-10-09 audit](administration-audit-2026-10-09.md). Authorized for implementation by the user. Preserve Mantine, race themes, existing services, hierarchy protections and PostgreSQL/Prisma. No production migrations or live destructive tests; no secret-file reads.

## Stages and acceptance

1. **Access and data integrity:** Moderator user inspection/notes; Admin-only editing/grants/impersonation/world resets; capability-based ban/suspend/lift with target hierarchy. Normalize army/items; bank gold persists; XP determines level, rank untouched. Notes visibility/deletion scoped. Alliance dissolution validates ID. Acceptance: role-denial and normalized persistence regression tests; no existing staff protection weakened.
2. **Runtime configuration:** Allowlisted typed nonsecret settings, safe public projection, maximum five-second cache propagation, transactional audit and rollback. Enforce maintenance/login/registration/combat/spy flags on server; mirror safe values in UI. Feature flags evaluated; supported timed gold/XP events consumed by gameplay. Acceptance: invalid/secret-like keys rejected; no arbitrary DB rows exposed; disabled actions denied; cache invalidates; scheduled modifiers bounded.
3. **Moderation outcomes and telemetry:** Appeal acceptance atomically releases only its matching current penalty. Paginated appeals. Hashed successful login telemetry, conservative device-sharing review signals and retention. Separate read/action permissions; no automatic sanctions. Acceptance: stale appeal cannot lift newer restriction; ADMINS_ONLY notes cannot leak; signals deduplicate; raw login identifiers not stored in telemetry.
4. **Missing workflows:** Export, password reset, account reset, vacation controls and bot management. Dangerous actions require explicit confirmations, reason/context and inflight guards. Acceptance: API authority remains decisive; staff takeover/self-lockout restrictions remain; invalid manifests rejected.
5. **Content and reporting:** Announcement edits/scheduling/links; correct active message recipients; bounded audit filters; token expiry; analytics dates/trends. All staff pages show API errors/retry instead of false empty states/stuck loaders. New text localized; keyboard and responsive Mantine controls preserved.
6. **Verification:** Targeted Bun tests, whole configured Bun suite, type checks, scoped ESLint, available browser checks at desktop/mobile. Record verified results and remaining environment limitations without claiming mocked tests prove database integration.

## Execution ownership

- Primary: user editor/APIs, navigation/role integration, runtime server/client consumers, gameplay event consumers, regression updates, final review and verification.
- Luna moderation: penalties/appeals/notes and moderation screens.
- Luna content: content workflows, dashboard reliability, audit filters and token display.
- Luna game: alliances/events/analytics and Admin-only era/simulator controls.
- Luna operations: user operation controls, export and bot screen.
- Luna settings: runtime registry/services/settings APIs/public hook and system screens.
- Luna telemetry: hashed login producers, investigation signals and abuse screens.

Workers own disjoint files and separate translation namespaces. Parent integrates public interfaces and reviews high-risk authorization/transaction code. Execution results are appended below as stages land.

## Results

Implementation completed in the workspace with eight Luna workers for scoped implementation and follow-up checks. No schema migration was necessary: runtime configuration, moderation and telemetry reuse existing PostgreSQL/Prisma tables.

### Delivered

| Area | Result |
|---|---|
| Dashboard / economy | Explicit loading failures and retry controls replace stuck loaders or false empty states. |
| User management | Moderators can inspect users, manage permitted notes and request password resets. Admin-only profile/resources/staff edits, grants, exports and impersonation remain protected. Unit/item edits preserve composite identities; bank gold uses exact integer strings; level derives from XP and rank remains untouched. |
| Reports / chat | Clear request errors and accessible, guarded action controls. |
| Bans / appeals | Create/lift controls follow account-status capability and target hierarchy. Appeals paginate; acceptance releases only its matching latest active penalty, including timed restrictions, within the audited transaction. Stale appeals fail with 409. |
| Notes | Admin-only visibility is enforced for reads and deletes; deletion also matches the target user. DELETE input is validated explicitly. |
| Multi-accounts / cheat signals | Genuine successful logins produce salted identifier hashes. Shared network/browser patterns across at least three accounts produce conservative review signals with deduplication and 30-day telemetry retention. Viewing and action permissions are distinct; marking action taken does not apply a sanction. |
| Alliances | Dissolution validates the route/query identifier and requires confirmation. |
| Events | Edit/delete/scheduling controls; supported active gold income and combat XP modifiers affect gameplay within their time window, with bounded multipliers. Unsupported legacy event types remain read-only and cannot be activated. |
| Eras / simulator | Era-start authority remains Admin-only; simulator navigation and page access require Administrator authority. |
| Analytics | Validated 7/30/90-day date ranges and real retained registration/attack counts. Latest-activity buckets are labelled explicitly; they are not historical daily-active-user counts. |
| Content / advisor messages | Shared reliable request handling and visible retryable failures. |
| Announcements | Editing, start/end schedules and validated HTTP(S) links. |
| Mass messages | Current effective status determines all-active recipients; explicit recipients are deduplicated and validated. |
| API tokens | Expiry input and distinct expired/revoked/active states. |
| Settings / flags / maintenance | Typed nonsecret allowlist, safe public endpoint, audited transactional updates and rollback. Runtime flags affect server action policy and corresponding UI. Maintenance blocks player gameplay and registration, with Admin/Moderator recovery access. |
| Audit logs | Bounded validated filters/pagination and correct submitted search state. |
| User operations / bots | Existing export, password/account reset, vacation and bot APIs now have staff controls with confirmation and inflight guards; bot manifests must come from the approved registry. |

### Configuration policy

Keep using the existing database. Supported runtime keys are `ENABLE_ATTACKING`, `ATTACK_LEVEL_RANGE`, the infiltration/assassination/intel/social/enemy enable flags, `DISABLE_LOGIN`, `DISABLE_REGISTRATION` and structured `MAINTENANCE_MODE`. Existing deployment values remain bootstrap fallbacks; database settings override them, and registered feature-flag rows override boolean settings. Nonempty feature-rule objects are rejected rather than presented as functional targeting rules.

The public `/api/config` projection contains these nonsecret controls only. Settings outside the allowlist are read-only with their values redacted. Cache reads deduplicate; invalidation has an epoch guard; other processes pick up changes on the next five-second refresh. A database outage may reuse the last successful snapshot for at most 30 seconds (plus the one-second retry cache), then protected actions fail unavailable.

Server CAPTCHA consumers prefer `TURNSTILE_SECRET`, with the legacy public-prefixed name retained temporarily for compatibility. Operators still need to provision the server-only secret and remove the legacy deployment variable. Database/auth/SMTP credentials, trusted origins, scheduler configuration and other bootstrap infrastructure remain deployment configuration; they were not copied into staff settings.

Maintenance permits sign-in, appeals and account recovery so users can reach the downtime/recovery experience; `DISABLE_LOGIN` is a separate control for preventing ordinary sessions. Secret-protected operator jobs are not frozen by the player maintenance boundary. Automatic background gameplay and destructive world-reset operator policy should be decided separately before using maintenance as a whole-world freeze.

### Verification

- Configured Bun suite: **1,458 passed, 3 skipped, 0 failed**, across 150 files. Skipped tests require the PostgreSQL integration fixture; mocked tests do not prove real database transactions.
- DOM-only Jest suites: **3 suites / 5 tests passed** with scoped coverage disabled. Their first scoped run also passed assertions but exited on the repository-wide 30% coverage threshold; this was not an assertion failure.
- `bun --no-env-file run check-types`: passed (application and Cypress projects).
- Scoped ESLint on changed TypeScript files: passed after formatting/import fixes. Translation JSON validated for 24 namespace files; `git diff --check` passed.
- Local collaborative browser: `/api/config` returned 200 with the ten allowlisted projection fields; signed-out user/notes APIs returned 401; `/home/admin` redirected to sign-in. Login layout had no horizontal overflow at 1280px and 390px. An existing login focus-style console warning remains outside the staff changes.
- Two new tests were moved outside `src/pages` to prevent Next from registering them as API routes. A stale generated Next validator was moved aside; source tests are no longer route files.
- Usage endpoint returned 200. It exposes provider quota information, not attributable cost for this implementation; no per-task token/cost figure is claimed.

### Remaining acceptance and follow-up

1. **Authenticated disposable-data walkthrough:** the shared preview remains signed out. Admin and Moderator action-by-action browser verification, reload/persistence checks, keyboard focus, race-theme coverage and destructive-action scenarios remain pending synthetic staff sign-in. No live staff mutations were performed.
2. **Real PostgreSQL integration:** run the skipped database tests and verify transactional rollback, concurrent appeal decisions/settings updates and telemetry deduplication against disposable fixtures. No production migration or deployment was performed.
3. **Historical reporting:** durable daily activity/economy aggregates and retention-aware long-term attack reporting need a separate schema/retention design; last-active fields cannot reconstruct historical DAU. The UI now states this limitation.
4. **Future rule/event types:** conditional feature targeting and turn/unit/build/PvP event consumers are intentionally not offered as working controls. Add explicit server consumers and tests before enabling them.
5. **Operational secret migration:** provision server-only CAPTCHA secrets through the deployment secret manager and remove the compatibility variable after validation. No secret file was read or edited.

The original audit is retained as the before-state record; this document records the implemented after-state and its verification limits.

## Follow-up — current-era launch reset (2026-10-10)

Added an Administrator-only **Reset current era & enable logins** flow in Era Management, with links from the login settings. It preserves the era identity and saved starting settings, resets staff/player and alliance progress, and atomically opens logins only after the reset and required audit succeed. Era/login changes serialize through a common lifecycle lock, stale confirmations are rejected, old cron queue entries are discarded, and recruitment quota windows respect the refreshed era start.

See [current-era reset operations](current-era-reset.md) for the exact retained/deleted scope and launch steps. No live reset or login-state change was executed while implementing this flow.
