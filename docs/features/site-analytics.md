# Site analytics and consent

Status: shipped on `feat/site-analytics-consent`.
Last verified against code: 2026-11-12 (alpha 8ffa50de)

Optional, consent-gated Google Analytics 4 (GA4): what visitors allow, what
Google gets, and what staff can see. Everything is off until the environment
variables are set **and** the `ENABLE_SITE_ANALYTICS` admin setting is on;
otherwise there is no banner, no footer link, zero requests to Google, and
the privacy policy shows its wording without analytics.

## Goals

- Know, in aggregate, which pages are visited and how the site is used.
- Nothing reaches Google before the visitor explicitly accepts analytics.
- No personal data ever reaches Google: no account, player name, user id,
  email or player state; URLs are reduced to route patterns so player ids,
  tokens and report ids cannot leak through dynamic segments.
- Visitors keep control: a persistent choice, Global Privacy Control (GPC)
  honored, withdrawal at any time from the footer.

## Configuration

Two layers: environment variables say *how* to reach Google, and one admin
setting says *whether* the feature is live.

### The switch: `ENABLE_SITE_ANALYTICS`

Administration → Server settings → Features → "Site analytics and its
privacy policy wording". Off by default (fallback `false`, no env override),
changes are audited like every runtime setting.

The switch turns on two things together, so the code and the policy never
disagree:

- the consent banner, the footer "Cookie settings" link and the GA loader
  (`ConsentProvider` reads it from `/api/config`, polled every 5 seconds, so
  turning it off stops gtag.js mid-visit through Google's `ga-disable-<id>`
  flag);
- the privacy policy's analytics wording. `/legal/privacy` renders per
  request (`getServerSideProps`) and reads `analyticsSections.<section>.body`
  for `collect`, `use`, `cookies` and `share` instead of
  `sections.<section>.body`, and shows `UPDATED_WITH_ANALYTICS` instead of
  `UPDATED` as its date. If the setting cannot be read, the page falls back
  to the wording without analytics. While the switch is off,
  `analyticsSections` is also left out of the translations the page sends,
  so the unpublished wording is not in the page source (copied, never
  mutated: the loaded resources are shared between requests).

Why: the production policy said "We do not use third-party analytics", and
its "Changes to this policy" section promises to announce important changes
before they take effect. The release can ship with the switch off; on the
announced effective date, set `UPDATED_WITH_ANALYTICS` to that date and turn
the switch on. Tracked in Forgejo #313.

### Environment variables

Names, never values, appear in the admin page's setup state.

| Variable | Side | Meaning |
| --- | --- | --- |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | client | GA4 measurement id, must match `/^G-[A-Z0-9]+$/`. Unset or malformed: the feature is fully inert. |
| `GA_PROPERTY_ID` | server | Numeric GA4 property id for the Data API. |
| `GA_SERVICE_ACCOUNT_EMAIL` | server | Service-account email. |
| `GA_SERVICE_ACCOUNT_PRIVATE_KEY` | server | PEM key; literal `\n` sequences are accepted. Never logged or sent to the client. |

Setup: create a GA4 property, create a Google Cloud service account, enable
the Google Analytics Data API, add the service account email as Viewer on the
property, then set the four variables. Set the property's time zone to the
game's time zone so GA day buckets line up with the consent tally (see Known
gaps).

In the GA4 web stream's Enhanced measurement settings, turn off "Page changes
based on browser history events". The app sends its own sanitized page view on
every navigation; leaving that option on counts each navigation twice.

## Consent

- One first-party cookie `ot_consent`, value `v1.analytics=granted` or
  `v1.analytics=denied`, `Path=/`, `SameSite=Lax`, `Secure` on https, 180
  days. An unknown version or malformed value counts as "no choice yet".
  Parsing and serialization are pure code in [src/utils/consent.ts](../../src/utils/consent.ts).
- `ConsentProvider` ([src/context/ConsentContext.tsx](../../src/context/ConsentContext.tsx))
  mounts inside `MantineProvider` in `_app` and reads the cookie once after
  mount (no hydration mismatch). It exposes
  `{ analytics, setAnalytics, openSettings, measurementConfigured }`.
- The banner (full-width bar along the bottom, `role="region"`, equal-weight
  Accept/Decline) shows only while the measurement id is configured, no
  choice is stored and the route is not a staff page or `/test`. It sits at
  `z-index` below the docked training order bar so it never covers in-game
  fixed bottom UI, and its entrance animation respects
  `prefers-reduced-motion`.
- GPC: when `navigator.globalPrivacyControl === true` and no choice is
  stored, analytics is treated as denied and the banner is not shown; the
  visitor can still opt in through cookie settings.
- "Cookie settings" in the site footer (public and signed-in pages) opens a
  modal with the current state and a switch to grant or withdraw. Rendered
  only when the measurement id is configured.
- Withdrawal: `gtag('consent','update',{analytics_storage:'denied'})`, no
  further page views, and every `_ga` / `_ga_*` cookie is expired for the
  current host and the registrable parent domain.

## What Google gets

After a grant, `gtag.js` loads (`next/script`, `afterInteractive`) with
Consent Mode v2: `ad_storage`, `ad_user_data`, `ad_personalization` always
denied; `analytics_storage` granted. Config sets `send_page_view: false`,
`anonymize_ip: true`, `allow_google_signals: false`,
`allow_ad_personalization_signals: false`. Page views are sent manually on
first load and on `routeChangeComplete`, sanitized by
[src/utils/analyticsPage.ts](../../src/utils/analyticsPage.ts):

- `page_location` = origin + route pattern (dynamic segments like
  `/userprofile/[id]` replace real ids), locale prefixes kept, no query
  string, no hash;
- `page_title` = the same generic pattern, never `document.title` (titles
  can carry player names);
- `page_referrer` = origin + path only.

The same three values are also set as the defaults (`gtag('set', ...)`) for
any automatic event gtag sends on that page, so those do not report the real
URL either.

While consent is not granted, or on a staff page, the loader sets Google's
`ga-disable-<measurement id>` switch, so a `gtag.js` already loaded earlier in
the visit sends nothing more.

GA is never loaded on `/test` or under `/home/admin` / `/home/moderation`.
No user id, display name, email or player state is ever sent, and there are
no custom events.

## Consent tally (opt-in rate)

`POST /api/consent` ([src/pages/api/consent/index.ts](../../src/pages/api/consent/index.ts)),
public, zod-validated, increments a per-choice counter for the current OT
calendar day in the `consent_tally` table
([prisma/schema.prisma](../../prisma/schema.prisma)). One call per explicit
choice in the banner or settings modal, fire-and-forget; the GPC default
never reports. It stores no IP, no user id, no user agent — the table is a
pure counter with row level security enabled. No per-player state exists, so
admin Edit Player is untouched.

## Admin traffic page

`/home/admin/traffic` ("Site traffic", permission `VIEW_ANALYTICS`), fed by
`GET /api/admin/analytics/traffic?days=7|30|90`
([src/pages/api/admin/analytics/traffic.ts](../../src/pages/api/admin/analytics/traffic.ts)):

- `configured: false` → the page shows the setup state (variable names and
  steps) and the consent card;
- GA block: totals, zero-filled daily trend, top pages, sources, countries,
  devices, realtime active users over the last 30 minutes (`startMinutesAgo` 29 to `endMinutesAgo` 0; GA rejects the reverse order), null when that call fails;
- consent block: daily granted/denied, totals and opt-in rate (null while
  nobody has chosen), always returned — one failed GA call shows an error
  alert with a retry but never hides the consent card.

The GA4 Data API client ([src/services/analytics/GoogleAnalyticsData.service.ts](../../src/services/analytics/GoogleAnalyticsData.service.ts))
uses plain `fetch` with a service-account JWT (RS256 via node:crypto; no
`googleapis` / `google-auth-library` dependency). Access tokens are cached
until shortly before expiry; report responses are cached in memory for five
minutes per range; every fetch times out after 10 s. Errors are logged
without the token or key and surface as a clean `GaDataError`.

## Privacy copy

The privacy policy ([legal/privacy](../../src/pages/legal/privacy.tsx),
locales `privacy.json`) describes the optional analytics truthfully: what is
and is not sent, the `_ga` cookies (up to 2 years), `ot_consent` (180 days),
Google as processor, withdrawal via Cookie settings, and GPC. That wording
lives in `analyticsSections` and shows only while `ENABLE_SITE_ANALYTICS` is
on; `sections` keeps the wording without analytics (see Configuration).

## Source

- [src/utils/consent.ts](../../src/utils/consent.ts) — cookie, visibility, GPC, GA-cookie clearing (pure)
- [src/utils/analyticsPage.ts](../../src/utils/analyticsPage.ts) — page-view sanitizer (pure)
- [src/context/ConsentContext.tsx](../../src/context/ConsentContext.tsx) — provider, banner, settings modal, withdrawal
- [src/components/analytics/](../../src/components/analytics) — banner view, settings view/modal, footer link, GA loader
- [src/pages/api/consent/index.ts](../../src/pages/api/consent/index.ts) — tally endpoint
- [src/pages/api/admin/analytics/traffic.ts](../../src/pages/api/admin/analytics/traffic.ts) — admin API
- [src/services/analytics/GoogleAnalyticsData.service.ts](../../src/services/analytics/GoogleAnalyticsData.service.ts) — GA4 Data API client
- [src/pages/home/admin/traffic.tsx](../../src/pages/home/admin/traffic.tsx) — admin page
- [src/pages/legal/privacy.tsx](../../src/pages/legal/privacy.tsx) — policy page, picks the wording from the switch
- [src/constants/runtimeSettings.ts](../../src/constants/runtimeSettings.ts) — `ENABLE_SITE_ANALYTICS`

## Tests

- [src/utils/consent.test.ts](../../src/utils/consent.test.ts) — cookie parse/serialize, visibility (configured/unset/GPC/staff pages), `_ga` clear targets, measurement-id check
- [src/utils/analyticsPage.test.ts](../../src/utils/analyticsPage.test.ts) — sanitizer: token query, hash, dynamic route, locale prefix, referrer
- [src/services/analytics/GoogleAnalyticsData.test.ts](../../src/services/analytics/GoogleAnalyticsData.test.ts) — fixture mapping, JWT claims, not-configured detection, request builders
- [src/__tests__/pages/api/consent.api.test.ts](../../src/__tests__/pages/api/consent.api.test.ts) — guard, validation, upsert, soft failure
- [src/__tests__/pages/api/admin/traffic.api.test.ts](../../src/__tests__/pages/api/admin/traffic.api.test.ts) — permission guard, not-configured response, consent aggregation, GA failure isolation
- [src/__tests__/pages/legal/privacy-site-analytics.test.ts](../../src/__tests__/pages/legal/privacy-site-analytics.test.ts) — policy wording follows the switch, falls back without analytics on error; every locale has both wordings
- [src/__tests__/migrations-row-level-security.test.ts](../../src/__tests__/migrations-row-level-security.test.ts) — RLS on `consent_tally`

## Known gaps

- GA's `date` dimension uses the property's time zone; the consent tally
  uses OT calendar days. Set the property time zone to the game's zone or
  day boundaries drift by hours.
- The report cache is per server process; a restart refetches.
- The tally counts explicit choices only, so GPC-implied denials and
  returning visitors who never re-choose are not counted; the opt-in rate
  is "choices made", not "visitors seen".
- GA itself only counts visitors who accepted, so its totals undercount
  traffic; the admin page says so on the consent card.
- The admin Site Traffic page reports the environment setup only; it does
  not say whether `ENABLE_SITE_ANALYTICS` is on. Check Server settings.
- Realtime numbers can lag a minute or two behind reality.
- On `/battle` training pages the docked order bar draws over the banner
  (by design, so the banner never covers in-game fixed bottom UI); the
  banner reappears on any other page.
