# UI standardization review — 2026-10-06

## Verdict and coverage

The frontend has a shared design system, but it is not fully standardized. This is a source review of 207 TSX/CSS files under `src/pages` and `src/components` (excluding tests), plus the owner's three screenshots. No browser surface was available in the computer-use runtime, so current desktop/mobile renders, measured contrast, keyboard interaction and all four race captures are not certified. Scores that would imply measured accessibility/performance were not assigned.

The initial source inventory found 49 files with hex color literals. That is a review queue, not 49 confirmed defects: semantic success/danger colors, artwork shading, public stone/parchment palettes and fallback values can be intentional. Screen #2 and #3 already use `GameCard`/`StyledTable`; their displayed eligibility problem came from data selection rather than the frame components.

## Corrections made

| Surface | Cause | Correction |
| --- | --- | --- |
| War Room Intelligence empty state | `StyledNews` passed `goldAccent={false}` only when empty | Use the same ornate `GameCard` frame in both states |
| News entries | Fixed navy backgrounds/borders and gray/gold text | Use existing `--ot-inset`, `--ot-line`, `--ot-body`, `--ot-muted`, `--ot-accent` and heading tokens |
| Dispatch copy | Hardcoded shared English labels | Add English/German/Spanish `home.dispatches` keys |
| Live unit/training and battle-upgrade slots | Fixed slate backgrounds/borders/control text | Replace those repeated values with existing theme surface, line, body, muted and accent variables |

The frame/header CSS and font hierarchy remain in the existing `GameCard`, `Panels.module.css` and `FantasyFrame.module.css` system. Mantine Accordion retains native keyboard handling. No global CSS or animation was added.

## Remaining verified findings

| Priority | Location | Finding and impact | Follow-up |
| --- | --- | --- | --- |
| P2 | `src/pages/home/overview.tsx` | Fixed pale-blue recruiting links and fixed gray text differ from shared token treatment | Replace literal presentation with existing Mantine Anchor/Text tokens; check links in four themes |
| P2 | `src/pages/userprofile/[id].tsx` | Numerous literal colors coexist with race styling | Classify status/decorative colors, move panel/text colors to tokens and capture profile states |
| P2 | `src/components/form.tsx` | Most values already use tokens with fallbacks; submit button still supplies a fixed brown/gold gradient and fixed text/loading colors | Use established Mantine button variant/overrides and verify pending/error/disabled contrast |
| P2 | `src/components/game/WarlordTable.tsx`, `WarRoomLog.tsx`, `UnitTrainingPanel.tsx` | Prototype panels retain navy literals and mock data; log adds a technical grid treatment | Imported by `/test`; do not confuse mock surfaces with live game state. Bring them into the system before reuse |
| P2 | `src/components/game/StyledNews.tsx` | Existing raw HTML Markdown preview uses `rehypeRaw` without the shared sanitized article renderer | Review content trust and reuse sanitized Markdown handling in a separate focused fix |
| P3 | `src/components/game/SidebarScroll.tsx`, `SidebarTablet.tsx` | Theme-derived values have literal fallback colors | Verify missing-theme behavior before classifying fallbacks as drift |

## Intentional variants to verify, not erase

Secondary `goldAccent={false}` uses exist in auto-recruit, battle filters/search, upgrades summaries, commander briefing, chat, mobile sidebar and result panels. They may be subordinate surfaces. A blanket removal would flatten hierarchy. Match each to its purpose before changing it.

Public pages have their own documented Living Chronicle reading surfaces; decorative stone/parchment values are not automatically violations of race-aware in-game styling. Semantic red/green status indicators should retain clear meaning in every theme.

## Release acceptance pass

Capture overview with empty and populated dispatches, attack users and current community stats at desktop and mobile sizes in HUMAN/ELF/UNDEAD/GOBLIN. Check header spacing, frames, table overflow, long translated strings, all relevant hover/loading/disabled/error/empty states, tab navigation and visible focus. Measure text contrast on actual computed surfaces. Check screenshots against DESIGN.md and classify deliberate secondary variants. Until this happens, do not claim the entire frontend passes standardization.

## Check results for this patch

- 21 targeted Bun tests passed across login policy, existing-session validation, denied credential login, player-count API and user-data service suites. Checks ran with automatic env-file loading disabled and mocked data access.
- TypeScript passed for the application. Changed-file ESLint and whitespace checks passed; final checks are recorded in the task response.
- Browser creation also failed with `Browser is not available: iab`; no live visual pass was performed. Remaining work is tracked in [Forgejo issue #12](http://192.168.4.3:3000/dastacomann/OpenThrone/issues/12).
