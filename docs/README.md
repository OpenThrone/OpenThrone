# Documentation

## Current guidance

| Document | Purpose |
| --- | --- |
| [README](../README.md) | Setup, commands, development seeding |
| [Contributing](../CONTRIBUTING.md) | Contribution workflow |
| [AGENTS.md](../AGENTS.md) | Coding agent rules |
| [Repository source map](../.ai/project-map.md) | Architecture entry points and analysis tools |
| [Internal review workflow](internal-review-workflow.md) | Forgejo review and public GitHub promotion proposal |
| [Credential privacy](credential-privacy.md) | Current access limits and proposed secret isolation |
| [Optional artwork](artwork.md) | Cloudflare R2 artwork, CSS/icon fallback, and source migration |
| [UI review](ui-standardization-audit-2026-10-06.md) | Dated coverage, corrections and remaining standardization work |
| [UI follow-up](ui-standardization-followup-2026-10-06.md) | Live-surface consistency and sanitized dispatch previews |
| [Public content plan](public-content-plan.md) | FAQ, guide priorities and editorial/advertising readiness |
| [Anti-abuse assessment](anti-abuse-assessment.md) | Verified gaps, corrections and moderation-policy limits |
| [Issue triage](issue-triage-2026-10-06.md) | Backlog readiness, parallel scope and remaining decisions |
| [Operations](operations.md) | Cron endpoints and bot setup |
| [Battle and spy source guide](battle-spy-workflow-reference.md) | Current implementation entry points |
| [API v1 compatibility](api-v1-compat-matrix.md) | Wrapper routes and inherited behavior |

[PRODUCT.md](../PRODUCT.md) and [DESIGN.md](../DESIGN.md) provide product/design context. They are not deployment runbooks or proof of implemented behavior; verify technical claims against source.

## Generated output

- `bun run docs:api` generates TypeDoc HTML in `docs/api/`.
- `bun run docs:api:json` generates `docs/api.json`.
- `bun run map:deps` and `bun run map:graph` generate JSON in `.ai/`; they do not regenerate Markdown code maps.
- `api-surface-inventory.json` is a checked-in snapshot, not a live route registry. Inspect `src/pages/api/` for the current surface.

Generated TypeDoc and analysis JSON outputs are ignored by Git. Regenerate them when needed rather than treating old output as authoritative.

## Plans

See the [maintained plan index](../plans/README.md) for retained proposals, follow-up candidates, and archived plan dispositions.

## Historical material

[Archive](archive/README.md) contains old audits, forecasts, proposals, and the superseded combat narrative. Preserve them as context, not current specifications, instructions, or release gates. Additional ignored files under `plans/`, `.sisyphus/`, and tool reports may contain drafts; those are not maintained documentation.

When changing behavior, update its current guide or source links. Keep test counts, line-number findings, deployment status, and one-off simulation results in dated reports rather than evergreen setup docs.
