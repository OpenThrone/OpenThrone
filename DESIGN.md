---
name: OpenThrone
description: Dark-fantasy text MMO — four race worlds over one carved stone-and-gold chassis.
colors:
  throne-gold: "#EAAE2B"
  candle-flame: "#FFE87A"
  herald-gold: "#FDE265"
  beacon-amber: "#EC9B00"
  royal-amber: "#DD953F"
  court-yellow: "#FFFF5C"
  header-parchment: "#F4E7B3"
  advisor-parchment: "#B5A565"
  elf-brand-deep: "#004D26"
  human-brand-deep: "#002F4D"
  undead-brand-deep: "#0D0D0D"
  goblin-brand-deep: "#4D0000"
  stone-void: "#05070A"
  stone-deep: "#0B1016"
  stone-raised-top: "#171F29"
  stone-raised-bottom: "#0D1117"
  stone-edge: "#1F2937"
  stone-chrome: "#374151"
  table-stripe-odd: "#2C3034"
  table-stripe-even: "#212529"
  alert-error-bg: "#74261E"
  alert-error-text: "#EE8277"
  alert-success-bg: "#005E46"
  alert-success-text: "#4DD0AF"
typography:
  display:
    fontFamily: "Chomsky, MedievalSharp, serif"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "0.5px"
  headline:
    fontFamily: "Chomsky, MedievalSharp, serif"
    fontWeight: 400
    lineHeight: 1.35
  body:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "MedievalSharp, serif"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  xs: "2px"
  sm: "4px"
  md: "8px"
  lg: "16px"
  xl: "32px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  panel-stone:
    backgroundColor: "{colors.stone-raised-bottom}"
    textColor: "{colors.candle-flame}"
    rounded: "{rounded.sm}"
  input-field:
    backgroundColor: "{colors.stone-void}"
    textColor: "#E5E7EB"
    rounded: "{rounded.sm}"
  nav-link:
    textColor: "{colors.herald-gold}"
  nav-link-active:
    textColor: "{colors.beacon-amber}"
  display-title:
    textColor: "{colors.header-parchment}"
  advisor-note:
    backgroundColor: "{colors.advisor-parchment}"
    textColor: "#000000"
---

# Design System: OpenThrone

Reviewed against the working tree on **2026-10-02**. The front matter is a palette and type reference, not a runtime theme definition. Runtime values live in the sources below; do not copy this inventory into a second theme system.

## Direction

**The Living Chronicle:** dark stone, restrained gold, race-colored accents, and readable ledgers. Use ornamental type and framing to establish the game world; give resources, forms, and battle results a clear hierarchy.

Keep the existing identity when refining a surface. These guidelines describe a preferred direction alongside current implementation; they do not require a repo-wide reskin. [AGENTS.md](AGENTS.md) governs implementation constraints and [PRODUCT.md](PRODUCT.md) explains the intended player experience.

## Current Sources

| Concern | Source of truth |
| --- | --- |
| Race palettes and Mantine component overrides | [themes.tsx](src/styles/themes.tsx) |
| Form/interactive state styles | [Controls.module.css](src/styles/Controls.module.css) |
| Card and ledger composition | [Panels.module.css](src/components/game/Panels.module.css) |
| Active Mantine theme selection | [_app.tsx](src/pages/_app.tsx) |
| Layout variables and desktop shell | [Layout.tsx](src/components/Layout.tsx) |
| Shared surfaces, typography utilities, focus, and motion | [global.css](src/styles/global.css) |
| Tailwind tokens and breakpoints | [tailwind.config.js](tailwind.config.js) |
| Framed game cards | [GameCard.tsx](src/components/game/GameCard.tsx) |
| Shared ornamental corners | [FantasyFrame.module.css](src/components/game/FantasyFrame.module.css) |
| Illustrated public heroes | [PublicHero.tsx](src/components/public/PublicHero.tsx) |
| Shared public authentication layout | [PublicAuthLayout.tsx](src/components/public/PublicAuthLayout.tsx) |
| Public chronicle layouts | [PublicPages.module.css](src/components/public/PublicPages.module.css) |
| Visual guide: every component with mock data (`/test`, dev only) | [test.tsx](src/pages/test.tsx), [showcase/](src/components/showcase/) |

The implementation contains overlapping Mantine, Tailwind, CSS-variable, and legacy styles. They are not interchangeable, and their presence is not approval to extend every pattern. Prefer the existing component used on the target surface; avoid another parallel styling system.

## Color and Surfaces

**Current implementation:** ELF green, HUMAN blue, UNDEAD gray, and GOBLIN red palettes share a dark shell. Mantine brand and secondary ramps supply component colors; the shared CSS-variable resolver in `themes.tsx` supplies `--ot-accent`, `--ot-surface`, `--ot-surface-2`, `--ot-text`, and `--ot-border`. Some layout variables remain shared across races rather than fully retinted.

**Preferred guidance:**

- Use race accents for identity and gold for small highlights, headings, and focus. Keep large reading surfaces dark and quiet.
- Use the active Mantine theme, layout variables, or existing race classes. Do not hard-code a race palette inside a feature.
- Reserve semantic colors for success, danger, and warnings. Meaning must also be conveyed by text or icons, not color alone.
- Check text and controls in all four themes: body text and placeholders need at least 4.5:1 contrast; large text needs 3:1. Theme membership alone does not guarantee contrast.
- Preserve existing background art where it belongs, with sufficient separation for readable foreground content. Do not add texture or layered gradients to every container.

Legacy Bootstrap-dark colors, parchment imagery, and isolated social gradients remain in the repository. Preserve functioning existing surfaces when out of scope; use current theme primitives for new work instead of reproducing legacy styling.

## Typography

**Current implementation:** Inter is the body font; Mantine headings use Chomsky with MedievalSharp/serif fallbacks. MedievalSharp appears in card headings and short in-world labels; shared form input text uses Inter. Exact sizes differ by component.

**Preferred guidance:**

- Use Chomsky for prominent page titles and short section headings where it remains readable. Several section headings may appear on one screen; avoid turning every label into a display treatment.
- Use Inter for body copy, resource values, dense tables, instructions, and longer explanations. MedievalSharp may mark short in-world headings or labels where existing components already use it.
- Headings inside a card use `SectionHeading` (MedievalSharp, the card-title face one step down), not Mantine `Title`, which renders Chomsky. Chomsky stays on page titles and hero lines.
- Keep ornate type out of dense data and long instructions. Do not force a font overhaul into a local change.
- Use Mantine's type scale and the existing surface hierarchy rather than copying fixed sizes from this document.
- Allow translated headings to wrap. Preserve the distinction between title, description, value, and supporting label without relying on uppercase or letter spacing alone.

## Layout and Responsive Behavior

**Current implementation:** Layout has a header, content row, and footer. Its desktop sidebar becomes visible at Tailwind `lg` (**1024px**), with a 260px width and a percentage width at `xl`. Individual components also use 768px media queries; there is no single universal mobile switch point. Admin pages use their own layout.

**Preferred guidance:**

- Reuse the page's existing layout and spacing rhythm. Group related controls closely and separate different decisions visibly.
- Keep primary actions near their relevant content. Preserve header actions when refining shared cards.
- On narrow screens, stack form groups and let headers/actions wrap. Labels, validation, and submit controls must remain visible and usable.
- Keep essential navigation and actions available when desktop chrome is hidden. Verify the actual drawer trigger and its keyboard behavior on the affected surface.
- Dense tables may scroll horizontally within a labeled region; avoid page-wide overflow. Keep units and column meanings clear and use tabular numerals when comparing quantities.
- Check long translations, large values, text zoom, and real empty or error states as well as the default desktop view.

## Depth and Decoration

**Current implementation:** Paper and game cards use gradients, inset highlights, and restrained blurred resting shadows. Filled buttons use a pressed shadow treatment. Shared cards stay still on hover; `.bg-rpg-dark` includes grain.

**Preferred guidance:**

- Use inset wells, clear edges, and modest shadows to distinguish surfaces. Resting shadows are allowed when they clarify grouping or elevation; blurred shadows are not limited to hover.
- Keep ornament at the frame, header, or a deliberate focal point. Do not stack borders, halos, textures, and heavy shadows without a clear hierarchy.
- Use existing tight corner treatments. Existing components vary within roughly 2–8px; no document-level rule overrides their props or theme behavior.
- An informational card does not need to move to communicate hover. Avoid adding motion that suggests a static panel is clickable.
- Existing grain, gradients, and decorative assets are optional tools, not mandatory recipes. Prefer CSS-driven details and avoid costly large blurs or repeated effects.

## Public Pages

All seven public navigation pages and account recovery extend the Living Chronicle with custom painted throne-room artwork, existing ornamental frames, and heraldic shields. Hero copy sits on a dark readability overlay; mobile layouts retain a visible area of the painting above the copy. The About page pairs an origin passage with a framed development-status ledger, followed by development information and an FAQ. Decoration is static, and layouts stack on narrow screens. Login, registration, and password recovery share `PublicAuthLayout`, pairing the painted entrance with an inset form. How to Play uses a chapter index and continuous guide sections, while leaderboards use framed data ledgers beneath the war-table illustration. News uses a single dispatch header and spacious article reading surfaces, with localized dates and read controls. Exact composition and sizing live in the public-page sources above.

## Components and Interaction

Use Mantine primitives where available, styled through the existing theme and component patterns.

| Surface | Guidance |
| --- | --- |
| Cards | Keep title, optional header action, and content distinct. Render children once; preserve caller props and styles. The page title appears once, in `MainArea`; card titles are one section level below it and never repeat it. `goldAccent` (the default) marks a page's primary, standalone or actionable card and a report's outcome card; supporting panels use `goldAccent={false}`. Do not toggle it to show which side won. |
| Buttons | Name the action. Distinguish primary, secondary, and destructive actions through wording and established variants. Prevent double submission and show pending state. |
| Inputs | Keep visible labels, relevant units, and accessible validation. Do not rely on placeholders to explain a field. Preserve entered values after recoverable errors. |
| Tables and reports | Explain quantities, costs, losses, and uncertainty. Distinguish unknown information from zero, especially in spy reports. |
| Alerts | State the problem or result and the useful next step. Avoid using ornament to compete with the message. Public and account error alerts use a filled red `Alert` with a title and `role="alert"`. |
| Navigation | Show the current location and provide a clear keyboard focus state. Keep essential actions reachable on small screens. Routed in-page tabs use `game/TabBar`. |
| Destructive flows | State what will be lost and what persists. Use a confirmation step for consequential irreversible actions; follow existing authentication and authorization policy. |

## States and Accessibility

- Use semantic headings and landmarks. Do not make decorative frames or icons interactive unless they have a real action.
- Preserve keyboard navigation and visible focus. Reuse the established gold focus treatment; never remove an outline without an equally clear replacement.
- Use existing skeletons for loading, an explanation and next action for empty states, and an accessible error message with recovery guidance for failures.
- Disabled and pending controls should remain legible and explain their state where it is not obvious.
- Use translation keys for shared user-facing copy and test layouts with longer text.
- Respect both `prefers-reduced-motion` and the existing `body.reduced-motion` convention where applicable. `public-rise` already supports these; its timing and stagger are implementation details, not a requirement to animate every card. Do not assume other hover effects inherit that protection.

## Scope and Maintenance

This document records visual identity, current sources, and preferred guidance. It is not a claim that the existing UI passes every accessibility or responsive check.

For each change, inspect the target's current implementation and verify the affected states and screen sizes. Update source references and guidance when a shared pattern changes. Keep exact color ramps, shadow recipes, breakpoint behavior, and component APIs in their runtime sources to reduce drift.

The `/test` visual guide is where identity changes are proposed and reviewed: change it first, check it across race themes and backdrops, then apply the change to game pages. Adding or removing a component updates the guide in the same change (see [AGENTS.md](AGENTS.md), "Visual Guide").

### Public action and reading hierarchy

Public actions use Mantine buttons with beveled metal borders, inset highlights, offset shadows, and MedievalSharp lettering. Filled actions advance the main task; outlined actions navigate to a secondary destination, including Discord, GitHub, and news. Public action rows do not use plain light/subtle defaults. Chapter-index controls remain subtle intentionally: they are in-page navigation, visually subordinate to content and destination actions. Ordinary prose links remain links with visible keyboard focus.

Chomsky headings use offset carved-letter shadows; Inter body copy remains the readable book face. Warm parchment-derived ink sits on shaded stone reading surfaces, with smaller supporting notes rather than uniformly bright text. Artwork remains behind hero copy under a dark scrim.

News previews and published articles share `MarkdownArticle`. Article-body headings preserve Markdown's six semantic levels with a descending Inter type scale; Chomsky remains on the dispatch title and composer heading. Scoped article styles explicitly restore bullet and numbered lists against CSS resets and define nested lists, quotations, code blocks, tables, and task lists without relying on Tailwind typography utilities. Markdown syntax remains standard: headings require a space after `#`, and soft line breaks remain within a paragraph.

In-game `MainArea` page titles retain Chomsky, the metallic gold gradient, and beveled drop shadows. The clipped gradient spans the complete text box with `background-size: 100% 100%` and `background-repeat: no-repeat`; a repeating `1em` fill creates a bright restart seam through descenders.

### Account settings hierarchy

In `src/pages/home/settings.tsx`, the current email uses a semantic label/value pair: a smaller muted label and a larger semibold address that can wrap without overflowing. The new-email label and confirmation note belong to the Mantine input. Vacation Mode preserves the original introduction and four original rule sentences in their original order, followed by the requested gold-production and remaining-vacations sentences. Visible bullets, spacing, and bold emphasis within each sentence improve scanning without label prefixes, shorthand, columns, or row dividers. Mantine list styles explicitly preserve disc markers against CSS resets, and text wraps on narrow screens. The remaining-vacations sentence uses translated singular and plural forms.

Gold production continues through the existing turn processor. The remaining count loads from the authenticated, uncached `/api/account/vacation-availability` endpoint; the read and activation paths share `AccountService.getVacationAvailability`. Starting vacation is disabled while the count is unknown or exhausted, and a failed load displays a reload instruction. The restored original copy says once every quarter; the existing backend instead enforces four vacations per calendar year. This copy restoration does not change that backend policy. The game-card framing, two-week duration, and early-return behavior remain unchanged.

### Dispatch archive, report access, and alliance artwork

The news archive reuses the War Room dispatch accordion: pinned-first titles,
category/date/read metadata, a four-line preview and a link to the full article.
Public visitors do not receive unread badges. Read-state changes retain their
open accordion and expose pending and error states.

Battle and spy reports use the actual viewer's role. Participants receive
personal wording; shared and public readers receive neutral participant names
and no combat follow-up controls. A single participant-only sharing dialog
manages player, membership-bound alliance, and explicitly confirmed public
access. Alliance notes and target calls remain available from that dialog.
Revoking access retains the participants' inherent access and any independent
grants. The artwork editor uses Mantine file inputs and previews with a separate
save action, available to leaders and roles holding `edit_profile`. Uploaded
images use bounded dimensions, content-derived formats and hashed filenames.

Alliance photos and banners preserve their source image and store a bounded
focal point and zoom using the existing `#frame=x,y,zoom` convention. Crop
previews support pointer dragging, labelled zoom/position sliders, arrow keys,
reset and cancel. Applying a crop only updates the local preview; Save artwork
persists it. Profiles, alliance browse cards and diplomacy avatars honor that
framing, including when an existing image is reframed without a new upload.
