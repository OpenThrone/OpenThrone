# UI standardization follow-up — 2026-10-06

Scope: the remaining live surfaces identified in Forgejo issue #12 and the [initial source audit](ui-standardization-audit-2026-10-06.md). This is a source and static-check pass; it does not certify the complete frontend.

## Changes and classification

| Surface | Drift corrected | Existing behavior preserved |
| --- | --- | --- |
| Kingdom overview | Recruiting links now use Mantine Anchor; body/supporting text, inset statistics wells, divider lines and highlighted values use existing `--ot-*` variables | Recruiting destination, responsive briefing, resource values, offense breakdown and secondary `goldAccent={false}` hierarchy |
| Player profile | Friend action well and statistics table use shared inset/line variables | Race styling, semantic relationship/status colors, action behavior and copy |
| Authentication form | Submit button inherits the existing filled Mantine theme treatment; label and loading dots inherit its heading color | Submit guard, CAPTCHA state, loading behavior, minimum height and existing label typography |
| War Room dispatch excerpt | Match published article safety approach: GFM, raw HTML parsing, then default `rehype-sanitize`; use a block wrapper and preserve paragraph/list HTML | Four-line excerpt clamp, content, title, badges, read links and empty/populated ornate frame |

The excerpt deliberately keeps its compact renderer rather than embedding `MarkdownArticle`'s full public reading layout. Sanitization runs after raw HTML expansion, preventing scripts, event attributes and unsafe link schemes from surviving the preview. No custom sanitizer allowlist or raw HTML bypass was introduced.

Decorative inset shadows, hero text over artwork, named semantic badge/status colors, authentication input parchment styling and token fallback values were retained. Prototype `/test` panels were not changed. No new global/scoped CSS, shared theme modifications, locale copy or runtime dependencies were added.

## Checks and remaining acceptance work

- Changed-file ESLint passed with `bun --no-env-file`.
- Two targeted Bun SSR tests passed (nine assertions): malicious HTML/URL rejection and preserved safe paragraphs, links and GFM list content. The harness emits an existing next-i18next instance warning; its assertions exercise rendered excerpt HTML rather than translation integration.
- Application TypeScript passed: `bun --no-env-file ./node_modules/typescript/bin/tsc --noEmit --pretty false`.
- Shared Mantine Anchor/Button components retain their existing focus treatment; source review confirms the shared Controls module supplies focus-visible and reduced-motion handling. This does not substitute for exercising keyboard interaction.

Rendered contrast, all four race themes, desktop/mobile layout, loading/error/disabled states, translated content wrapping, actual four-line clipping and keyboard focus remain pending. The available computer-use runtime has no browser surface. Use the initial audit's release acceptance matrix before closing issue #12 as fully visually validated.
