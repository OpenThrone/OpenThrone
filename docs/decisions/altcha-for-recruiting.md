# Recruiting uses a self-hosted check, behind an admin switch

Date: 2026-11-12. Rules: [Recruitment](../mechanics/recruitment.md#captcha).

## Decision

The recruit links and auto-recruit use ALTCHA, a proof-of-work check hosted by us that runs in the player's browser, instead of Cloudflare Turnstile. The provider is the setting `recruit.captchaProvider` (`altcha` by default, or `turnstile`), so staff can fall back to Turnstile without a deploy. Sign-up, sign-in and appeals keep Turnstile. No recruiting limit, cost or reward changed.

## Reason given

Players reported Turnstile taking up to about 20 seconds when recruiting. The code shows why it is slow there in particular: every recruit link is a full page load, so the Turnstile script loads and a new challenge runs each time, and the server then waits on Cloudflare's verification (5 second timeout). ALTCHA solves in the browser while the page loads and is verified locally by the server, with no third-party request.

Keeping Turnstile selectable was part of the request: a new check on a path that pays gold and citizens should be reversible from the admin page.

## What follows from it

- `ALTCHA_HMAC_KEY` is a required server secret for ALTCHA. Without it (or with a key under 16 characters) recruiting falls back to Turnstile when a Turnstile secret is set, so a host deployed before its key is set keeps working; with no Turnstile secret either, the check fails closed (logged once) rather than letting recruits through.
- `DISABLE_TURNSTILE` and `NEXT_PUBLIC_DISABLE_TURNSTILE` switch off Turnstile only, not ALTCHA; `NEXT_PUBLIC_USE_CAPTCHA=false` still switches off both. Alpha keeps Turnstile off so sign-in stays open to its test accounts, and recruiting there still needs to run ALTCHA to be tested (2026-11-13).
- Each solved challenge is accepted once, from a small table of used challenge nonces that is purged as they expire.
- The privacy policy says recruiting uses a check that sends nothing to a third party, and that Turnstile still protects sign-up and sign-in. Cloudflare stays on the list of processors.
- Difficulty is the setting `recruit.altchaDifficulty`. The default is a starting estimate, not a measured value for players' phones; adjust it if players report waiting or bots get through.
