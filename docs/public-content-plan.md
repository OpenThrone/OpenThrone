# Public content plan

Issue: Forgejo #9. Prepared 2026-10-06 from repository behavior; this inventory does not assert the deployed site's state.

## Available reading routes

| Route | Purpose | Content/readiness notes |
| --- | --- | --- |
| `/` | Introduce the game | Existing illustrated landing page; verify deployment-specific status claims before publication. |
| `/about` | Origins, operator, development | Existing origin/status content and short project FAQ; release-phase/reset copy needs operator review. |
| `/how-to-play` | Explain core mechanics | Existing army/economy/combat guide; keep numeric bonuses and timing aligned with actual rules and operations. |
| `/faq` | Practical player questions | Added nine original answers, grouped into getting started, kingdom decisions, and account help; English/German/Spanish. Public allowlist, header/mobile navigation, footer and locale namespaces integrated. This overlaps with the FAQ block on `/about`; assess consolidation before adding further FAQ content. |
| `/community/news` and `/community/news/:id` | Updates and longer dispatches | Existing publishing/reading flows; usefulness depends on genuine maintained articles. |
| `/community/stats` | Player leaderboards | Data surface; not a replacement for explanatory content. |
| `/account/password-reset` | Account recovery | Operational page linked from FAQ; avoid treating forms as editorial content. |

FAQ factual anchors: PRODUCT.md (identity and non-affiliation), README.md (Discord/issue support), `Bank.service.ts` (80% deposit cap and account deposit count), `Training.service.ts` and training page (roles/costs), `Armory.service.ts` (equipment), `AttackService.ts` (turns, pillage, losses), password-reset pages (recovery), and public news routes. No reward cadence, reset preservation, upcoming features, or deployment availability is promised. FAQ bank limits must change with the underlying service.

## Prioritized next content

1. **Day-One guide set:** internal source-backed drafts now cover a first-session economy decision, army/equipment/upgrades, and target selection/battle reports: [draft index](day-one-strategy-guides.md). The numerical examples use synthetic data and fallback Era settings only; the live Era can override initial gold, citizens and turns. These are progress artifacts, not yet public pages.
2. **Economy and banking guide:** extend the first-session draft with reviewed screenshots and operator-confirmed timing. Current source anchors support a per-deposit 80% of on-hand limit and a base three deposits in a trailing 24-hour window; the example must continue to be labeled as subject to current Era/economy settings.
3. **Race comparison:** describe implemented bonuses and examples of meaningful choices without declaring one best race. Link directly to maintained constants and review whenever balance changes.
4. **Account troubleshooting and support:** consolidate sign-in/recovery help, a safe bug-report template and a verified contact route. Establish who handles support and how contact details stay current.
5. **Era guide:** publish only after #13 and reset-policy decisions are settled. Explicitly document what resets, what persists and how players are warned.
6. **Development dispatches:** explain actual shipped changes and player consequences. Planned daily activities stay proposals until implemented and reviewed. Spy missions are implemented; mercenary status is pending verification.

These can extend the existing guide/news system instead of creating thin standalone routes for each keyword. Do not copy DarkThrone documentation or invent testimonials/activity statistics.

## Editorial ownership and release decisions

Proposed accountability: operator/product owner approves gameplay, reset and availability claims; the maintainer for each mechanic checks the source; a language reviewer checks German/Spanish; support staff review troubleshooting. Assign actual people before publication. Keep a reviewed-on date and source/version reference with maintained guide material; re-review when the relevant mechanic changes. AIOXperts must approve actual privacy/contact/legal disclosures from its real operating practices; this change invents none.

Before publishing the FAQ, manually check logged-out access, mobile navigation, all three languages, accordion keyboard focus/Enter/Space, browser back navigation and narrow/zoomed text across supported themes. Browser visual validation was unavailable during implementation. The FAQ intentionally has no database fetch, login gate, advertising code, tracking additions or new raster assets; it inherits MainArea, PublicHero, Mantine Accordion and existing public scoped styles. Answers start expanded so their original text is included in the server-rendered page even with zero-duration transitions; visitors can collapse questions. Zero accordion transition duration respects reduced motion without adding a second motion system.

## AdSense readiness

Google emphasizes original useful content and understandable navigation in [Make sure your site's pages are ready for AdSense](https://support.google.com/adsense/answer/7299563?hl=en). There is no approval guarantee or fixed page-count target in this plan. Google checks a submitted site and crawler access as described in [Add a new site to your AdSense sites list](https://support.google.com/adsense/answer/12169212?hl=en). Its [privacy policy URL guidance](https://support.google.com/adsense/answer/10961370?hl=en) calls for actual organization data/cookie information under the EU user consent policy. Review the applicable requirements against the operator's audience and real services before choosing an advertising/consent implementation.

Remaining #9 scope: have gameplay maintainers review the three Day-One drafts; decide whether/how to consolidate the About and dedicated FAQ sections; approve the prioritized editorial backlog and owners; validate the live reading experience; prepare truthful privacy/contact disclosures; evaluate ads/consent and placement separately; request Google's review only when the operator considers the site ready. This implementation neither places ads nor claims approval.
