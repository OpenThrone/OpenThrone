---
version: 1
slug: "src-pages-alliances-id-forces-tsx"
primary_target: "src/pages/alliances/[id]/forces.tsx"
related_targets: ["src/components/alliance/AllianceForces.tsx","src/components/alliance/AllianceDues.tsx"]
---

# Alliance troops and dues

Mode: Operate. Members contribute existing fully equipped troops, borrow reserve troops and settle obligations. Leaders approve, recall and configure permissions and contribution requirements. The user chose the policy model and asked for immediate implementation; preserve the incumbent game identity.

## Direction contract

THESIS: A reserve and loan ledger precedes contribution and policy forms; dues retain a separate accounting frame with visible obligations and deadlines.

OWN-WORLD: Extend GameCard, Mantine forms, race tokens and the existing serif game headings. Reuse the alliance page's navigation and frame.

STORY: Inspect reserve stock and recovery, request troops, approve or recall, contribute permanent equipped troops, and pay gold or unit dues. Policy states distinguish manual approval from preapproved role allowances. Accepted enforcement terms stay visible on each demand.

FIRST VIEWPORT: Alliance return link, shared reserve rules, quantity and term controls, stock/equipment table. Contributions, loans, leadership settings and dues follow in explicit game frames. Mobile forms stack and data tables scroll inside their own frames.

FORM: Existing alliance operations extended with game forms and accounting tables; fixed visual system and user-selected mechanics.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Implementation evidence — 2026-10-21

The page composes `AllianceForces` and `AllianceDues` in existing GameCards. Mantine supplies labelled controls, acknowledgement checkboxes, actions, semantic alerts and horizontally contained ledger tables. Mobile form grids stack. Reserve, permanent contribution, loan, leadership policy and dues decisions retain separate frames. The mock-only `/test` section uses these same components and records `ForceDuesNotice` as live-only.

Reviewed `.impeccable/review/captain-alliance-desktop.png`, `captain-alliance-mobile.png`, `alliance-active-desktop.png` and `alliance-active-mobile.png`: leadership and active-loan states extend the incumbent race shell and stone-and-gold framing. The finish-review finding was offscreen dues failure feedback: `error-before-mobile.png` records the payment area without visible failure feedback; `error-after-mobile.png` shows the insufficient-gold alert in view. The page now focuses and scrolls the semantic error summary into view when an error arrives.

These are local verification captures, not new shipping artwork. No new rasters or shared tokens were introduced. DESIGN.md and its sidecar remain unchanged for this ordinary extension; gameplay rules and operational verification belong in `docs/features/temporary-forces.md`.
