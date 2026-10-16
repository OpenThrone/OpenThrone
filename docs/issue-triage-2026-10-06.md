# Forgejo issue triage — 2026-10-06

The owner authorized committing the previous maintenance/activity/UI patch and working on at least three actionable issues in parallel. Approved prior work was committed locally as `67bd99b` on `attack-revert`. This review distinguishes implementable work from a whole issue's completion; it is not a production deployment or issue-closing decision.

## Evaluation

| Issue | Can act now? | Work and remaining decisions |
| --- | --- | --- |
| #1 Return-news draft | Editorial review available | Publication needs the author's final wording and accurate deployment/feature claims. This batch does not edit or publish the personal announcement. |
| #6 Anti-cheat / anti-bot | Yes: source-backed assessment and localized fixes | Inspect existing request ownership, request replay and recruitment concurrency. Preserve permitted multiaccounts and avoid treating shared IPs as guilt. Broad signal collection, limits and moderation policies remain design work. |
| #7 Daily quests / random events | Design proposal available; gameplay needs rules | Choose XP/Gold budgets, reset cadence, claim rules and morale/event thresholds. Persistent kingdom morale is separate from existing combat fatigue/stamina mechanics. |
| #8 Timed scouting / activities | Design proposal available; gameplay needs rules | Define scenarios, unit requirements, risk/reward and duration; build durable reservation/resolution semantics and coordinate mercenary expiry. |
| #9 Public pages / AdSense | Yes: substantive public FAQ and content plan | Reuse current public page patterns, verified mechanics and translations. Editorial priorities/owners, actual operator disclosures and advertising/consent decisions remain open. |
| #10 Timed mercenaries | Design proposal available; gameplay needs contracts | `UserUnit.isMercenary` already exists; time-bound contract storage/expiry and balance rules still need specification. Coordinate with missions before introducing expiry behavior. |
| #11 Production activity/reward correction | Evidence preparation available; data correction needs private operator review | Existing activity and LOGIN logs were contaminated by the old ordering. Establish the maintenance window and affected records before proposing account-specific changes; do not infer a bulk reset from non-staff status. |
| #12 Frontend standardization | Yes: remaining live-source fixes | Correct real token drift and unsafe dispatch previews while preserving deliberate variants. Full visual/theme/contrast/keyboard acceptance remains a separate required pass. |
| #13 Alliances across eras | Design proposal available; lifecycle implementation needs policy | Preserve alliance identity during ordinary rollover; define reserved membership limits, leader succession, feature permissions and reactivation level/cost/objective. Factory restore is a separate destructive administrator operation. |

## Parallel responsibilities and delivered scope

Three workers own disjoint areas:

- **#6:** backend anti-abuse paths and their localized tests; [assessment](anti-abuse-assessment.md). Verified Gold-request ownership/replay and recruitment concurrency gaps are corrected through existing service/transaction patterns.
- **#9:** FAQ route, three translations, public navigation/route access and locale routing; [content plan](public-content-plan.md).
- **#12:** kingdom overview, profile, authentication form, dispatch Markdown preview and sanitization tests; [follow-up review](ui-standardization-followup-2026-10-06.md).

The parent reviews the combined diff, runs scoped regression/type/lint checks and commits the reviewed changes. No automatic multiaccount bans, advertising integration, economy values, production corrections or public announcements are approved by this batch. Broad issues remain open for their documented remaining scope; source-only verification cannot certify browser visuals or PostgreSQL concurrent behavior.

## Recommended next sequence

1. Deploy the reviewed maintenance/anti-abuse fixes to staging and exercise login ownership, Gold request replay/concurrency, recruitment limits and current-era reward selection with synthetic accounts.
2. Complete visual acceptance for the FAQ and corrected game surfaces in all supported themes/languages at desktop/mobile sizes.
3. Privately review #11's production remediation proposal before reopening login; retain backups and audit evidence.
4. Settle #13's activation/membership rules and the timed mission/mercenary lifecycle (#8/#10). Then settle #7's reward/event budget so new recurring income fits the economy.
5. Continue useful public guides under #9 with actual editorial ownership and factual review; evaluate advertising separately.

## Integration evidence

- 64 targeted tests passed across scoped Bun runs: 21 maintenance/session/user-data/player-count regressions, 32 FriendTransfer tests, seven recruitment tests, two dispatch sanitization tests and two public-route tests. Synthetic/mocked tests made no database connections.
- Application and Cypress TypeScript checks passed; changed-file ESLint had no errors, with eight existing unused-declaration warnings in backend service files. Whitespace checks passed.
- A separate read-only backend review found no concrete introduced blocker in actor ownership, request/account locking, same-transaction acceptance, recruitment lock ordering or expiry rechecks. This is source evidence, not proof of production behavior.
- Real PostgreSQL concurrency/rollback and browser desktop/mobile/theme/keyboard/contrast checks remain pending. Existing Gold requests without valid future expiry metadata now fail closed; cancel/recreate them through an operator-reviewed process when necessary.
- Automatic env-file loading was disabled for code-only checks. Documentation hook checks were invoked directly with that setting before the scoped commits, avoiding the hook's unqualified Bun invocations.
