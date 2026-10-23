---
version: 1
slug: "src-pages-battle-mercenaries-tsx"
primary_target: "src/pages/battle/mercenaries.tsx"
related_targets: ["src/components/game/MercenaryBarracks.tsx"]
---

# Mercenaries

Mode: Operate. Returning players prepare a temporary army; new players must see the price, expiry and permanent consequences before submitting. The user explicitly selected the gameplay rules and requested immediate implementation. Inherit OpenThrone's committed race themes, Mantine controls, GameCard framing and existing fonts.

## Direction contract

THESIS: A barracks order form above a contract ledger makes hiring and expiry management available together.

OWN-WORLD: Use the existing race-aware game surfaces, gold frame, MedievalSharp card headings and Mantine form styling. No new visual identity or assets.

STORY: Choose role/tier, quantity and term, review the exact gold price, hire, then inspect survivors, wounds, expiry and extension cost. Dismissal requires an inline irreversible-loss acknowledgement.

FIRST VIEWPORT: Page title, concise rules, three labelled order fields and a priced hire action. Contract rows follow immediately. Mobile fields stack; the contract ledger scrolls horizontally within its frame.

FORM: Existing game form and ledger extension; pinned gameplay and incumbent visual system, no concept selection required.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Implementation evidence — 2026-10-21

The live page and mock-only `/test` specimen share `MercenaryBarracks`. It uses existing GameCard framing and Mantine labelled selects, integer quantity input, priced actions, badges and a horizontally contained contract table. Mobile fields stack; expiry, wounds and survivor-only extension prices remain part of the ledger. Dismissal reveals an inline loss warning and confirmation. `ForceDuesNotice` remains a live-only component, identified as such in the alliance showcase section.

Reviewed `.impeccable/review/member-mercenaries-desktop.png`, `member-mercenaries-mobile.png`, `mercenary-active-desktop.png` and `mercenary-active-mobile.png`: empty and active states preserve the incumbent stone-and-gold frame, race-colored shell, readable body copy and card heading hierarchy. These are local verification captures, not new shipping artwork. No new raster assets or shared design tokens were introduced; DESIGN.md and its sidecar remain unchanged for this ordinary extension. Gameplay rules and operational verification belong in `docs/features/temporary-forces.md`.
