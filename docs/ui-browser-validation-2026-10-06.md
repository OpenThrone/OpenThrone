# Browser validation — 2026-10-06

Issue #12 remains open pending authenticated game-surface acceptance. Issue #1 stays open for the owner's manual editorial review.

## Executed checks

Used installed Fedora Chromium through Playwright against localhost:3000 with a fresh logged-out context and reduced motion enabled. Checked About, player FAQ, login and registration at 390, 1024 and 1440 CSS pixels in English, German and Spanish (36 page/viewport/locale combinations). All loaded with HTTP 200, with no document horizontal overflow and no unlabeled visible inputs detected by the bounded DOM check. Nine FAQ keyboard Enter checks toggled expanded controls to collapsed. These checks are not a full accessibility certification or performance assessment.

Inspected English mobile login and player FAQ screenshots: form fields and the revised themed submit button fit the narrow layout; the FAQ content remains readable within its column. Desktop public navigation was separately checked at 1024, 1440 and 2048px: grouped submenu hover/focus, order and absence of document overflow. Existing development inspection overlays are visible in screenshots and are not product styling.

Artifacts: `dogfood-output/ui-review-2026-10-06/results.json` and English desktop/mobile screenshots in that directory. Local artifacts are uncommitted.

## Remaining coverage

Overview, training and upgrades redirect the fresh context to login. Profile and attack URLs did not immediately redirect, but this does not prove their authenticated data states rendered. No authenticated staff session, private gameplay state or four-race captures were available to this browser pass. Empty/populated War Room dispatches, profile actions, in-game table behavior, four themes, loading/error/disabled states, measured contrast and complete keyboard traversal remain unverified. Requested a safe local test sign-in/session; do not bypass authorization or use production credentials to fill this gap.

## Issue #9 assessment

About already includes three project FAQ questions; the new player FAQ adds nine gameplay/support questions. They differ in subject, but two FAQ surfaces add unnecessary editorial overlap. Treat consolidation into one help destination or integration into How to Play as remaining scope. Prioritize original worked beginner/economy/battle-report guides and truthful operator/privacy/support disclosures. A second FAQ is not evidence of AdSense readiness; Google emphasizes unique relevant content and understandable navigation: https://support.google.com/adsense/answer/7299563?hl=en.

No issue was closed and no additional FAQ content was published by this validation.
