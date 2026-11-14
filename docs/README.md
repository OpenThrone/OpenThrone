# Documentation

## Start here

| Document | Purpose |
| --- | --- |
| [Game mechanics](mechanics/README.md) | How every game system works today |
| [Decisions](decisions/README.md) | Why the game works the way it does |
| [Ideas](ideas.md) | Future work and where it stands |
| [README](../README.md) | Setup, commands, development seeding |
| [Contributing](../CONTRIBUTING.md) | Contribution workflow |
| [AGENTS.md](../AGENTS.md) | Coding agent rules, including when docs must be updated (section 16) |

## Guides

| Document | Purpose |
| --- | --- |
| [Operations](operations.md) | Cron endpoints and bot setup |
| [Battle and spy source guide](battle-spy-workflow-reference.md) | Where the code lives |
| [API v1 compatibility](api-v1-compat-matrix.md) | Wrapper routes and inherited behavior |
| [Git workflow](git-workflow.md) | Branches, worktrees, merging, cleanup, releases and the opt-in GitHub mirror |
| [Credential privacy](credential-privacy.md) | Current access limits and proposed secret isolation |
| [Optional artwork](artwork.md) | Cloudflare R2 artwork, CSS/icon fallback, and source migration |
| [Abuse signals](abuse-signals.md) | How abuse detection reports to staff |
| [Decision models](features/decision-models.md) | Typed decision providers and shadow-mode chat moderation |
| [Privacy self-service](privacy-self-service.md) | Player data export and erasure |
| [Report sharing](report-sharing.md) | Sharing battle and spy reports |
| [Battle notification emails](battle-notification-emails.md) | Battle email behavior |
| [Legacy era import](legacy-era-import.md) | Importing past era data |

## Plans

| Document | Purpose |
| --- | --- |
| [Public content plan](public-content-plan.md) | FAQ, guide priorities and editorial/advertising readiness |
| [Email and account lifecycle plan](email-and-account-lifecycle-plan.md) | Email and account lifecycle work |
| [Administration implementation plan](administration-implementation-plan.md) | Administration work |

## Dated reports

Each describes the code at its date. They are context, not current rules.

| Document | Purpose |
| --- | --- |
| [Administration audit](administration-audit-2026-10-09.md) | Administration findings |
| [Administration investigation signals](administration-investigation-signals.md) | Investigation signal review |
| [Anti-abuse assessment](anti-abuse-assessment.md) | Verified gaps and moderation-policy limits |
| [Attack and spy era readiness](attack-spy-era-readiness-findings.md) | Era readiness findings |
| [Era progression stress test](era-progression-stress-test.md) | Forecast and stress-test plan |
| [Issue triage](issue-triage-2026-10-06.md) | Backlog readiness at that date |
| [Security audit](security-audit-2026-10-08.md) | Security findings |
| [UI browser validation](ui-browser-validation-2026-10-06.md) | Browser validation results |
| [UI review](ui-standardization-audit-2026-10-06.md) | Coverage, corrections and remaining standardization work |
| [UI follow-up](ui-standardization-followup-2026-10-06.md) | Live-surface consistency and sanitized dispatch previews |

[PRODUCT.md](../PRODUCT.md) and [DESIGN.md](../DESIGN.md) provide product/design context. They are not deployment runbooks or proof of implemented behavior; verify technical claims against source.

## Generated output

- `bun run docs:api` generates TypeDoc HTML in `docs/api/`.
- `bun run docs:api:json` generates `docs/api.json`.
- `bun run map:deps` and `bun run map:graph` generate JSON in `.ai/`; they do not regenerate Markdown code maps.
- `api-surface-inventory.json` is a checked-in snapshot, not a live route registry. Inspect `src/pages/api/` for the current surface.

Generated TypeDoc and analysis JSON outputs are ignored by Git. Regenerate them when needed rather than treating old output as authoritative.

## Keeping this current

`bun run docs:check` finds dead links and incomplete mechanics docs. When changing behavior, update its current guide or source links. Files under `plans/` and `.sisyphus/` are ignored local drafts, not maintained documentation. Keep test counts, line-number findings, deployment status, and one-off simulation results in dated reports rather than evergreen setup docs.
