# Administration audit — 2026-10-09

## Scope and evidence

All 23 entries in `src/components/admin/adminNavConfig.ts`, their pages/APIs, default Admin/Moderator permissions, and additional unlinked staff APIs were reviewed. Two GPT-6-Luna subtasks covered moderation/users and game/content. This is a source and mocked-test audit; **wired does not mean successfully exercised through an authenticated browser or against PostgreSQL**.

The existing local app at `http://localhost:3000` serves its home and login pages. The shared preview was opened at `/account/login`; authenticated Admin/Moderator walkthroughs remain pending user sign-in. No live staff mutation, secret-file read, database migration, or application-code change was performed.

Verification: `bun --no-env-file test src/__tests__/pages/api/admin-users.api.test.ts src/__tests__/pages/api/admin/admin-hardening.api.test.ts` — 48 pass; `bun --no-env-file test src/__tests__/pages/api/appeals/appeals.api.test.ts` — 15 pass. These tests mock dependencies; they do not establish browser or DB integration success.

A synthetic Bun/Zod reproduction additionally confirmed that the alliance schema strips allianceId and the handler rejects the resulting NaN, and that Boolean({enabled:false}) is true. The inline comparison rendered at 728px and 360px with all 23 rows and no console errors.

## Every navigation option

Admin has all permissions. Moderator's preset comes from [permissions.ts](../src/utils/permissions.ts): dashboard, audit, manage users/account status/notes/appeals, review/assign reports, moderate/view chat, and view multi-account/cheat data. Individual grants can extend this. The sidebar checks ANY listed permission.

| Option | Admin | Default Moderator | Implementation and gaps |
|---|---|---|---|
| Dashboard | Allowed | Allowed | DB counts wired. API failure can leave a permanent loader. |
| User Management | Allowed, partial | Visible; APIs reject | Search/list, editor, grants, impersonation wired. User list/detail/save and grants require Admin. Moderator receives an empty-looking list rather than an access error. See editor defects below. |
| Reports | Allowed | Allowed | List/detail, self-assignment, resolve, add note, status and priority changes wired. Permission errors on detail can appear as not-found. |
| Bans | Allowed | Read allowed; lift rejected | Lists penalties. Lift calls Admin-only account-action endpoint. No create-ban/suspend form in this screen. |
| Chat | Allowed | Allowed | Search logs, edit/delete message, mute/unmute, list mutes wired with chat permissions. Still needs seeded browser scenarios. |
| Appeals | Allowed, partial | Allowed, partial | List and decision persistence wired. Acceptance changes appeal status only; it does not lift the underlying account restriction. Latest 200 bounded; no full-history paging UI. |
| Multi-accounts | Allowed, incomplete pipeline | Allowed, incomplete pipeline | Clusters from last 30 days / latest 5,000 login events; profile links. No producer of LoginEvent found in `src`; needs login telemetry before results populate automatically. |
| Cheat signals | Allowed, incomplete pipeline | Allowed, incomplete pipeline | List, acknowledge, dismiss, mark action taken wired. No CheatSignal producer found in `src`. “Take Action” only sets ACTION_TAKEN, with no sanction; all mutations use VIEW_CHEAT_SIGNALS. |
| Events | Allowed, operational placeholder | Hidden | DB create/activate/deactivate implemented. No game/runtime consumer of GameEvent found in `src`; double-XP/gold effects and schedule execution are absent. No edit/delete/config controls in UI. |
| Eras | Allowed | Hidden | List/start wired; destructive reset guarded Admin-only. MANAGE_ERAS-only staff can see start control but cannot run it. |
| Alliances | List allowed; dissolve broken | Hidden | Dissolve sends allianceId, but query schema strips it; handler returns 400 before deletion. |
| Balance simulator | Allowed | Visible; run rejected | Simulation implemented in memory. Sidebar/page accept VIEW_STAFF_DASHBOARD, but API requires Admin. |
| Content | Allowed | Hidden | Blog post list/create/edit/delete persistence wired. |
| Announcements | Allowed, partial | Hidden | Create, toggle, delete wired and public consumer exists. No edit, schedule, or link inputs despite API support for dates/link. |
| Mass messaging | Allowed, partial | Hidden | Transactional message writes wired. “ALL active users” actually selects all users without active/status filter. Failed HTTP responses can be silent. |
| Advisor messages | Allowed | Hidden | List/create/edit/delete persistence wired. |
| Economy | Allowed | Hidden | Read-only aggregate gold/holders/transfers. Failure can leave permanent loader. No adjustments from this screen. |
| Analytics | Allowed | Hidden | Activity/registration/attack counters wired. No date filters or trends; failure can leave permanent loader. |
| Server settings | CRUD allowed; runtime placeholder | Hidden | DB CRUD implemented. No consumers beyond settings API/maintenance page found. Public switch is discarded by API and defaults false in service. No enforced key/type/range registry. |
| Feature flags | CRUD partial; runtime placeholder | Hidden | List/create/toggle DB writes implemented and audited. No feature consumers/evaluator found. No rules editor/delete. API POST recursively calls itself instead of executing upsert. |
| API tokens | Allowed | Hidden | List/issue/revoke wired. One-time secret display; strict pre-issue audit. Listing shows revoked tokens as well as active; expired tokens appear Active because UI only tests revokedAt. API requires Admin rather than the page's capability. |
| Maintenance | Saves; behavior missing | Hidden | Writes MAINTENANCE_MODE JSON; no request/game gate consumes it. Reload uses Boolean(object), so saved `{enabled:false}` becomes checked. Message state exists without an editor. |
| Audit logs | Allowed | Allowed | Action/actor/target filters and pagination wired, including legacy targets. API accepts unbounded/unvalidated limit/offset. Search from a later page calls fetch with stale page state before effect refreshes. |

## Confirmed defects and important missing behavior

1. **Moderator capability/UI mismatch.** [User APIs](../src/pages/api/admin/users/index.ts), [detail API](../src/pages/api/admin/users/[userId].ts), [grant API](../src/pages/api/admin/grantPermission.ts), [account action](../src/pages/api/admin/account-action.ts), and [simulator](../src/pages/api/admin/simulation/run.ts) require Admin. Moderator can see User Management, grant controls, Lift Ban, and simulator but cannot complete those operations. Notes are inside the rejected user editor, so the Moderator notes permission has no usable normal UI path. Preserve deliberate staff hierarchy restrictions; scope a Moderator user-inspection/notes surface or hide unsupported controls.
2. **User editor targets old data and mislabels stats.** [User detail/save](../src/pages/api/admin/users/[userId].ts) reads/writes `users.units/items`, retained migration JSON. Current gameplay uses normalized UserUnit/UserItem relations ([User.service.ts](../src/services/User.service.ts), [UserLoader.service.ts](../src/services/UserLoader.service.ts)). Bank gold is returned/editable but never written on save. GET omits level; PUT writes the level input to `rank`, not a level progression value. Unit/item IDs are type-only, so levels/usages collide. Profile status is displayed/editable but not applied by this save. Move edits to existing normalized services, validate bounds, and define level/XP behavior.
3. **Alliance dissolution deterministically rejects.** [alliances API](../src/pages/api/admin/game/alliances.ts) schema lines 11–15 omits allianceId; apiGuard passes parsed query data, stripping the ID. Add separate validated DELETE query schema and regression coverage.
4. **Runtime controls save without effect.** [ServerSetting service](../src/services/ServerSetting.service.ts), [feature API](../src/pages/api/admin/system/feature-flags.ts), and [event service](../src/services/GameEvent.service.ts) implement records, without gameplay integration. Setting copy promises immediate changes, feature copy promises toggles, and maintenance promises a blocking page; those promises are currently unsupported. Maintenance additionally misreads disabled JSON state.
5. **Appeal acceptance and cheat action do not enforce decisions.** [reviewBanAppeal](../src/services/Moderation.service.ts) only updates the appeal; [takeAction](../src/services/CheatDetection.service.ts) only updates a signal. Decide whether these are bookkeeping actions and label accordingly, or implement explicitly authorized account actions with hierarchy checks and audit transactions.
6. **Abuse feeds need producers.** Repository search for loginEvent/cheatSignal found reads and signal updates, but no login-event creation or signal generation under `src`. External producers were not verified. Add privacy-preserving login/device event capture, detection jobs, thresholds, and retention before treating empty queues as evidence of no abuse.
7. **Settings contract is inconsistent.** [settings page](../src/pages/home/admin/settings.tsx) submits isPublic; [API](../src/pages/api/admin/system/server-settings.ts) drops it, and service defaults it false. isRuntimeEditable/validation metadata exists but is not enforced. Arbitrary key/value/type combinations can be saved. Add an allowlisted typed registry and transactional audit with old/new nonsecret values.
8. **Errors are frequently hidden.** Several fetch handlers ignore non-OK responses, masking forbidden/validation/rate-limit errors as empty tables or perpetual loading. Add explicit error states/retry, in-flight mutation guards, translated copy, and labels on icon controls/unlabelled switches. No full accessibility/race-theme browser verification has been completed.
9. **Notes visibility and target scope are not enforced.** [getModeratorNotes](../src/services/Moderation.service.ts) filters userId/deletedAt but not ADMINS_ONLY visibility. The notes API allows any MANAGE_MODERATOR_NOTES holder to read that result. Delete uses only noteId, without matching the route userId. Validate visibility by actor and scope deletion to the target user; the current UI creates STAFF notes only, so this gap affects API-created restricted notes.

## APIs implemented without current staff UI controls

Repository searches of components and home pages found no consumers for user export, password reset, account reset, vacation, or bot status/provision/run-now. These are missing UI options, not absent backend implementations:

- `/api/admin/users/export`: Admin-only, audited export; avoid returning unnecessary private fields.
- `/api/admin/users/reset-password`: MANAGE_USERS; target hierarchy enforced.
- `/api/admin/account-reset`, `/api/admin/vacation`: Admin-only, protected/audited.
- `/api/admin/bots/{status,provision,run-now}`: Admin-only; manifest/schedule operations implemented.

Impersonation start is exposed in User Management; stop uses the existing impersonation flow and must be tested after switching context. Staff targets are refused in tests. Do not remove those restrictions to resolve UI mismatches.

## Configuration direction

**Reuse the existing PostgreSQL/Prisma database.** It already stores game/accounts, ServerSetting, FeatureFlag, GameEvent, reports/notes/appeals, audit logs and API tokens. A second DB is unnecessary for this problem. The missing layer is a validated configuration reader and its consumers.

| Configuration | Proposed home | Examples |
|---|---|---|
| Nonsecret runtime gameplay controls | Existing ServerSetting/FeatureFlag tables | Attack enable/range, mission enables, social feature flags, registration/login availability, maintenance message/state |
| Operational/bootstrap configuration | Deployment environment | Database endpoint, site/socket origins, ports, trusted proxies, asset endpoints, scheduler setup |
| Credentials/signing/encryption material | Deployment secret manager with server-only injection | Auth/JWT secret, DB credentials, SMTP password, token pepper, Turnstile verification secret |

Build a typed key registry with validation/defaults, server-authoritative access, a small public projection, cached reads with revision/invalidation across processes, change audit, and rollback. Wire controls into APIs first and UI second; avoid a DB query for every component or hot gameplay step. Define fail-safe behavior for maintenance/login switches and ensure staff recovery access.

`NEXT_PUBLIC_*` browser values are bundled at build time, so mutable runtime controls need a dedicated safe configuration endpoint rather than build-time env reads ([Next.js documentation](https://nextjs.org/docs/pages/guides/environment-variables)). Credentials should not go through arbitrary staff setting rows; centralize least-privilege secret handling ([OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)). A source reference currently names Turnstile's verification secret NEXT_PUBLIC_TURNSTILE_SECRET; migrate to a server-only name through operator-managed configuration. This is a naming risk, not proof a secret was emitted.

Suggested implementation order: (1) role/control alignment and normalized user editor; (2) alliance bug and visible API errors; (3) maintenance/typed configuration consumers; (4) abuse producers and meaningful appeal/signal outcomes; (5) missing staff tools and content scheduling; (6) analytics trends.

## Browser scenarios still to complete

After synthetic Admin sign-in: open all 23 pages; seed harmless disposable report/chat/appeal/content/event/settings records; exercise each allowed action; reload and verify persistence/effect; verify errors and keyboard focus. Test destructive alliance/account/era actions only against explicitly disposable records or a disposable whole-world fixture. Token workflows must keep secrets out of snapshots/log output.

After switching to synthetic Moderator: check the 10 visible entries (dashboard, users, six moderation entries, simulator, audit), repeat permitted moderation actions, confirm expected denials on hidden Admin routes, and verify blocked UI controls report a clear reason. Record API status and user-visible outcome separately.

## Usage

The supplied `https://ai.aioxhost.com/api/usage` endpoint returned 200 via a minimal request. At the time sampled, Codex reported quota entries at 6% and 63% used; these are provider-wide quota snapshots, not attributable task token/cost totals. Two Luna subtasks were used. No per-task accounting was inferred.
