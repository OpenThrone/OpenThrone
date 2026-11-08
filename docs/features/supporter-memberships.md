# Supporter memberships and payments

Status: prototype on `feat/supporter-memberships`. Not merged into `alpha`.
Tracks issue #181.

## Goals

- Players can pay for a Supporter membership, gift one, or chip in to an
  alliance sponsorship. None of it changes combat math, caps, or regen
  (#181's no-pay-to-win rule).
- **No card data touches OpenThrone.** Card entry happens on the payment
  provider's hosted pages. We store provider IDs, amounts, status and dates
  only. That keeps us at PCI SAQ A (the lightest self-assessment), with no
  card numbers, CVCs or bank details in our database, logs or backups.
- Every membership, payment and admin action is traceable from the admin UI.

## Provider

**Stripe**, using only hosted surfaces:

| Need                                         | Stripe surface                                        | What we store                                                       |
| -------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------- |
| Subscribe / buy a gift / sponsor an alliance | Checkout (hosted page, redirect)                      | Checkout session ID, then payment/subscription IDs from the webhook |
| Update card, cancel, see invoices            | Customer Portal (hosted)                              | Nothing new; we just open a portal session                          |
| Renewals, failed-payment retries, receipts   | Billing + Smart Retries + Stripe emails               | Status and period end, from webhooks                                |
| Refunds                                      | Admin action -> Refunds API (or the Stripe dashboard) | Refund ID, amount, reason                                           |
| Disputes                                     | Webhook only                                          | Dispute ID, status                                                  |
| Sales tax / VAT                              | US-only at launch, below state thresholds; revisit    | Billing country and state per payment                               |

Open decision for the owner before production: Stripe + Stripe Tax keeps us
as the seller (we file the taxes). A merchant of record (Paddle, Lemon
Squeezy) becomes the seller and files tax for us, at a higher fee. The code
goes through a `PaymentProvider` interface, so switching later only adds an
adapter.

A `mock` provider implements the same interface for local runs and the alpha
prototype: "checkout" is an in-app confirmation page that fires the same
internal events a Stripe webhook would. It is refused when
`NODE_ENV === 'production'` and the site URL is `openthrone.dev`.

## Products

Code defaults live in `SUPPORTER_PLANS`; `SupporterPlanPrice` rows override
prices for new checkouts. Stripe Price IDs are stored with the override, and
`getSupporterPlans()` supplies the current catalog to checkout and display.

Prices below are code defaults. Administrators can override plan prices in **Supporters → Plans & prices**. Changes apply to new purchases only; existing monthly subscribers keep their agreed price. Plan kinds, grants, and the alliance pool conversion rate remain fixed. The admin audit trail records every price change.


| Product                 | Kind                         | Default price           | Grants                                                                                           |
| ----------------------- | ---------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------ |
| Supporter monthly       | Subscription                 | $4.99/mo                | `SUPPORTER` tier while active                                                                    |
| Supporter era pass      | One-time                     | $12.99                  | `SUPPORTER` until 100 days after purchase                                                        |
| Gift: 1 / 3 / 12 months | One-time                     | $4.99 / $13.99 / $49.99 | A gift code for that many months                                                                 |
| Alliance sponsorship    | One-time, any amount from $5 | n/a                     | Adds to the alliance's sponsorship pool; each $4.99 in the pool is one month of premium alliance |

Membership is account-level, not era-level: it survives era resets.

## Data model (Prisma)

All amounts are integer cents. No card fields exist anywhere.

- `SupporterMembership`: one row per user (unique `userId`). `tier`
  (`SUPPORTER`), `status` (`ACTIVE`, `PAST_DUE`, `CANCELED`, `EXPIRED`),
  `source` (`SUBSCRIPTION`, `ONE_TIME`, `GIFT`, `COMP`), `provider`,
  `providerCustomerId`, `providerSubscriptionId`, `currentPeriodEnd`,
  `cancelAtPeriodEnd`, `startedAt`, `updatedAt`, `badgeVisible` (player can
  hide their badge).
- `users.supporter_until` (timestamp, nullable): denormalized "active until",
  so every player list can render badges without a join. Written only by the
  entitlement service.
- `Payment`: one row per completed charge or refund. `userId`, `allianceId?`,
  `kind` (`SUBSCRIPTION`, `ONE_TIME`, `GIFT`, `ALLIANCE_SPONSORSHIP`),
  `status` (`SUCCEEDED`, `REFUNDED`, `PARTIALLY_REFUNDED`, `DISPUTED`,
  `FAILED`), `amountCents`, `currency`, `taxCents`, `refundedCents`,
  `provider`, `providerPaymentId` (unique), `providerInvoiceId?`,
  `description`, `createdAt`.
- `PaymentRefund`: individual refund amount, reason, provider refund ID, administrator ID and date; legacy refund dates are estimated from payment creation because payments have no update timestamp.
- `PaymentEvent`: webhook inbox. `provider`, `providerEventId` (unique, for
  idempotency), `type`, `status` (`RECEIVED`, `PROCESSED`, `FAILED`,
  `IGNORED`), `error?`, `summary` (sanitized JSON: IDs, amounts, status; never
  the raw payload), `receivedAt`, `processedAt?`.
- `GiftCode`: `codeHash` (unique; the plain code is shown once to the buyer),
  `codePrefix` (first 4 chars, for support lookups), `months`,
  `purchaserUserId`, `paymentId`, `recipientUserId?`, `redeemedByUserId?`,
  `redeemedAt?`, `expiresAt`, `revokedAt?`.
- `AllianceSponsorship`: one row per alliance (unique `allianceId`).
  `poolCents`, `activeUntil?`, `updatedAt`. Contributions are `Payment` rows
  with `kind = ALLIANCE_SPONSORSHIP`.
- `DiscordLink`: `userId` (unique), `discordUserId` (unique),
  `discordUsername`, `linkedAt`, `notifyPrefs` (JSON). `DiscordLinkCode`:
  `codeHash`, `userId`, `expiresAt`, `usedAt?`. The bot itself is phase 3.
- New permission `MANAGE_SUPPORTERS`.
- New runtime setting `ENABLE_SUPPORTER` (default off) and
  `PAYMENT_PROVIDER` env (`mock` | `stripe`).

## Entitlements

`src/services/supporter/Entitlement.service.ts` is the only writer of
membership state and `users.supporter_until`.

- `getSupporterStatus(userId)` returns `SupporterStatus` (see
  `src/types/supporter.ts`).
- Active = `status in (ACTIVE, PAST_DUE, CANCELED)` and `currentPeriodEnd > now`.
  `PAST_DUE` keeps perks for 7 days from the first failed renewal attempt;
  later retries do not extend it.
- Stacking: a gift or era pass on top of an active subscription extends
  `currentPeriodEnd` and pauses nothing; a subscription started while a gift
  is running begins billing at once (the terms and consent step say so).
- Perks read `isSupporter(user)`; they never read provider state.

## Flows

0. **Consent**: every Buy opens a consent step (price, renewal or one-time,
   how to cancel, 18+ or a parent buying, US resident, terms). The unticked
   box must be ticked; the checkout API refuses requests without it
   (`consent.version` = `CONSENT_VERSION`). The exact text, locale and version
   are stored in `PurchaseConsent` with the checkout session id, repeated on
   Stripe's page beside the pay button, and emailed in the receipt. Keep these
   records at least three years (California).
1. **Subscribe**: `/supporter` -> `POST /api/supporter/checkout` -> provider
   checkout URL -> player pays on the hosted page -> provider redirects to
   `/home/supporter?checkout=success` -> webhook `checkout.session.completed`
   and `customer.subscription.created` -> membership `ACTIVE`, `Payment`
   row, badge shows.
2. **Renew**: `invoice.paid` -> extend `currentPeriodEnd`, add `Payment`.
3. **Payment fails**: `invoice.payment_failed` -> `PAST_DUE`, in-game banner
   with a "Update payment method" button (portal link). Stripe sends dunning
   emails. After the final retry, `customer.subscription.deleted` ->
   `CANCELED` (perks remain until the recorded period end).
4. **Cancel**: through the portal -> `cancelAtPeriodEnd = true`; perks run to
   period end, then `CANCELED`.
5. **Gift**: buyer checks out a gift product -> webhook creates a
   `GiftCode`, shows the code once on the success page, and optionally sends
   an in-game message to a named recipient. Redeem at `/home/supporter`.
   Paid codes stay valid 5 years, and never expire when the billing state is
   in `NO_EXPIRY_GIFT_STATES` or unknown (counsel to confirm the list). A full
   refund revokes an unused code; a partial refund does not.
6. **Alliance sponsorship**: any member (or outsider) contributes from the
   alliance page -> `Payment` (`ALLIANCE_SPONSORSHIP`) -> pool grows and
   whole $4.99 steps convert to 30 days at once (the daily job catches
   leftovers). Money goes to
   OpenThrone, never to the alliance or its leader.
7. **Refund** (admin): admin picks a payment -> refund full or partial ->
   provider refund -> `charge.refunded` webhook -> `Payment.status`. Each
   paid membership or pass records the access window it bought
   (`accessFrom`/`accessUntil`); a full refund removes only the unused part
   of that window, a partial refund changes no access, and a refund never
   cancels a subscription unless the admin ticks "Also cancel the
   subscription now".
8. **Dispute**: `charge.dispute.created` -> `Payment.status = DISPUTED`;
   only the unused access that payment bought is removed and recorded in
   `disputeRemovedSeconds`. Won -> that time is given back; lost -> it stays
   removed. Other purchases are untouched.
8a. **Receipts**: a successful checkout queues a transactional receipt (plan,
   price, renewal terms, the stored consent, links to cancel, terms and
   refunds); the first time a subscription stops renewing, a cancellation
   notice. Stripe's own receipts can stay on as well.
8b. **Sales switched off**: status, payment history and the billing portal
   stay available (`requireSupporter(..., { whenSalesOff: true })`), the
   Patronage menu shows only for a subscription that will still renew (so
   the player can cancel or fix a card; `showPatronageLink`), and
   `/home/supporter`, still reachable by URL and email links, shows billing
   without plans.
9. **Comp** (admin): grant N days with a reason, no payment. Audited.

## Webhook handling

- `POST /api/supporter/webhook/stripe`: raw body, verify signature with
  `STRIPE_WEBHOOK_SECRET`, insert `PaymentEvent` (unique `providerEventId`
  makes retries no-ops), process inside a transaction, mark `PROCESSED` or
  `FAILED` with the error. Always 200 after a verified insert so Stripe stops
  retrying; failed events are replayed from admin.
- Never log or store the raw payload; `summary` keeps IDs, amounts and
  status only.
- Events handled: `checkout.session.completed`,
  `customer.subscription.created|updated|deleted`, `invoice.paid`,
  `invoice.payment_failed`, `charge.refunded`, `charge.dispute.created`,
  `charge.dispute.closed`. Everything else -> `IGNORED`.

## Scheduled jobs

`runSupporterDaily` (`src/services/supporter/SupporterDaily.service.ts`) runs
from the existing daily cron (`/api/cronJobs/daily`) after the game's daily
pass, and its failures never fail that pass:

- **Alliance pool**: whole months (499 cents = 30 days) of each sponsorship
  pool become premium time. Contributions also convert at once on payment,
  so this only catches leftovers.
- **Lapsed memberships**: ACTIVE or PAST_DUE memberships past
  `currentPeriodEnd` become EXPIRED (CANCELED if set to cancel) and their
  badge is cleared.
- **Reconcile** (Stripe only): re-applies the last 3 days of checkouts,
  invoices, refunds, disputes and subscription drift the webhook missed.
- **Gift expiry**: no job; redemption checks `expiresAt` and the status is
  derived for display.
- **Past-due grace**: a failed renewal keeps perks for 7 days
  (`PAST_DUE_GRACE_DAYS`) while Stripe retries; the next paid invoice or the
  subscription's deletion settles it.
- Mock pending checkout events are marked processed on confirmation and
  ignored after 24 hours when an admin reads the event list.
- **Failed-event alert**: count of `FAILED` `PaymentEvent`s on the admin
  overview.

## Pages

Public (logged out):

- `/supporter`: what Supporter gives, the no-pay-to-win pledge (what we will
  never sell), plans and prices, gift and alliance options, FAQ, links to
  terms and the refund policy.
- `/legal/terms` (patronage terms, including payment data and Stripe as
  processor) and `/legal/refunds`. Written; the owner reviews the wording
  before go-live.

In game:

- Home menu: a Patronage entry, shown while `ENABLE_SUPPORTER` is on (and,
  with sales off, to players whose subscription still renews).
- `/home/supporter`: current status card (tier, renews/expires, source),
  manage billing (portal), subscribe / buy era pass / buy gift, redeem gift
  code, payment history, gifts bought (with status), badge visibility toggle.
- Settings: Discord link card (generate code, linked state, unlink,
  notification preferences; instant alerts marked Supporter).
- Alliance page: sponsorship panel (pool, active until, top contributors,
  contribute button) and the premium alliance mark.
- Badge (`SupporterBadge`) beside player names: profile hero, player lists
  (`/battle/users`), alliance roster, chat sender name, mobile sidebar.
- Banners: `PAST_DUE` (update payment), expiring soon (7 days), checkout
  success.

Admin:

- `/home/admin/supporters`: KPIs (active supporters, MRR, revenue this
  month, refunds, failed events), memberships table (filter by status and
  source), payments table, webhook event log with replay, gift codes,
  alliance sponsorships. Links to the provider dashboard per record.
- Edit Player: Supporter panel (status, period end, source, provider IDs as
  dashboard links, payments; actions: comp N days, revoke, refund a payment,
  toggle badge). Every action writes the admin audit log.
- Admin nav entry gated by `MANAGE_SUPPORTERS`.

## Housekeeping

- **Secrets**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price IDs in
  env only. Alpha uses Stripe test mode keys; production uses live keys.
- **Account deletion / anonymization**: the subscription is cancelled at
  once and perks end (no refund); `Payment` rows stay for tax records,
  linked to the pseudonymized account; the Discord link, link codes and
  queued DMs are deleted in the anonymization transaction.
- **Bans and closures**: a ban or closure from the admin account action
  sets cancel-at-period-end at the provider (no auto refund); admins can
  refund from the panel.
- Both run right after the action commits (`endSupporterBillingSoon`), and
  the daily supporter job sweeps any renewing subscription on a deleted,
  banned or closed account in case that call failed.
- **Multi-account enforcement**: unchanged; paying does not exempt anyone.
- **Era reset**: no effect on memberships; sponsorship pools carry over.
- **Privacy**: `/legal/terms` names Stripe as the processor and lists the
  fields we keep. The site has no general privacy policy page yet.
- **Receipts**: Stripe sends them; we link to invoices through the portal.
- **Exports**: CSV of payments for bookkeeping (admin).

## Testing

- Unit: entitlement math (stacking, grace, expiry), webhook idempotency,
  event mapping, gift redemption rules, sponsorship pool conversion.
- Local: `PAYMENT_PROVIDER=mock` against the throwaway database; walk every
  flow in the browser.
- Alpha: Stripe test mode, `stripe listen --forward-to` for webhooks, test
  cards (`4242...`, `4000 0000 0000 0341` for failures), test clocks for
  renewals and dunning.

## Phases

1. **Prototype (done)**: data model, entitlement service, mock provider,
   every page above with real APIs, badges, admin, `/test` specimens.
   Feature flag off by default.
2. **Stripe test mode (done)**: Stripe adapter, signed webhooks,
   return-page fulfillment, refunds, disputes, reconciliation and the daily
   job, verified against a sandbox. Alpha uses test keys once merged.
3. **Perks (done)**: auto-recruit for supporters (the normal 250/day
   recruiter cap), Discord bot (link codes, read-only commands, daily digest,
   instant alerts), premium alliance war alerts.
4. **Go-live**: Stripe Tax or merchant-of-record decision, legal copy, live
   keys, `ENABLE_SUPPORTER` on in production.

## Touchpoints (AGENTS.md section 14)

1. Data model + migration: done (supporter models, refunds, subscription
   period, dispute restore; additive, no backfill needed for players).
2. Game logic / API: done for payments, entitlements and perks (see
   Perks below). Era reset: memberships are real-money and carry across
   eras. Bans, closures and account deletion stop renewals (see
   Housekeeping).
3. Player UI: done (`/supporter`, `/home/supporter`, Patronage menu entry,
   badges, alliance sponsorship, Discord link card, `/auto-recruit` for
   supporters, `/legal/terms`, `/legal/refunds`).
4. Admin view + edit: done (Supporters admin page, Edit Player supporter
   tab with comp, revoke, refund, badge toggle, and the Discord link with
   its alert settings, DM counts and an unlink action).
5. Admin audit trail: done (`ADMIN_SUPPORTER_UPDATE`).
6. `/test` specimens: done.
7. i18n: done (en, es, de), including the bot's replies and DMs
   (`discord.json`). The patronage FAQ is on `/supporter`; the CHANGELOG
   entry is drafted under Go-live and lands in the release PR that turns
   the flag on.
8. Tests: done (entitlements, inbox, Stripe mapping, webhook signatures,
   reconciliation, daily job, billing stop, product sync, Discord signature
   checks, alert rules, outbox delivery, /link, auto-recruit access).

The mock provider exercises every event type through
`POST /api/admin/supporters/events/mock` (supporter admin permission and
`assertMockAllowed`). Unknown events are ignored.

Renewals preserve banked gift or pass time using `subscriptionPeriodEnd`.
Time banked before that migration cannot be reconstructed automatically
(no production data exists yet).

## Running with Stripe test mode

Set `PAYMENT_PROVIDER=stripe`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
and `NEXTAUTH_URL` in your local runtime. Run
`bun --no-env-file scripts/stripe-sync-products.ts` (add `--dry-run` to preview),
and reconcile with `bun --no-env-file scripts/stripe-reconcile.ts [--days N] [--dry-run]`.
Forward local events with `stripe listen --forward-to localhost:<port>/api/supporter/webhook/stripe`;
put its printed whsec in `STRIPE_WEBHOOK_SECRET`. The return path calls
`POST /api/supporter/checkout/complete`, allowing local fulfillment without webhooks.

Test cards: `4242 4242 4242 4242` succeeds, `4000 0000 0000 0002` declines,
`4000 0000 0000 3220` requires 3DS, and `4000 0000 0000 0259` opens a
chargeback after payment (submit evidence `winning_evidence` or
`losing_evidence` to close it). Live keys are refused unless
`SUPPORTER_ALLOW_LIVE=1` is explicitly set in production.

Optional settings: `STRIPE_PORTAL_CONFIGURATION` (otherwise the portal
configuration the sync script tags `ot_supporter` is used; a new account has
no default) and `GIFT_CODE_SECRET` (gift codes are derived from the payment
and this secret, falling back to `NEXTAUTH_SECRET`, so a buyer can see the
code even when the webhook fulfilled the purchase first; rotating the secret
hides, but does not invalidate, unredeemed codes).

Webhook endpoint events (alpha and production endpoints subscribe to exactly
these): `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`,
`customer.subscription.deleted`, `charge.refunded`, `refund.created`,
`refund.updated`, `charge.dispute.created`, `charge.dispute.closed`.

Idempotency: internal event ids come from the business object
(`stripe:checkout:<cs>`, `stripe:invoice.paid:<in>`, `stripe:refund:<re>`,
`stripe:dispute:<dp>:created|closed`), so the return page, webhook retries and
reconciliation apply each purchase once. Signature checks use
`constructEventAsync` because the server runs on Bun. Dispute rule: opening a
chargeback revokes the perks it paid for and records their end; a won dispute
restores them to that end and re-enables a gift code it revoked; a lost one
keeps them revoked; inquiries (`warning_*`) revoke nothing.

Renewals can be exercised with a Stripe test clock: create a customer on a
clock, set it as the player's `providerCustomerId`, subscribe through
checkout, then advance the clock past the period end. Stripe list calls skip
test-clock objects, so reconciliation does not scan them.

Verified end to end against the sandbox on 2026-10-28: decline and cancel,
monthly, gift (code shown although the webhook fulfilled first), billing
portal, alliance sponsorship, chargeback opened and won, test-clock renewal
keeping 30 banked gift days, cancel at period end, admin partial refund
recorded once across its three webhooks, and a reconciliation dry run with
nothing to apply.

## Perks

Perks read `isSupporter` (or the alliance's `activeUntil`), never provider
state.

- **Auto-recruit**: `/auto-recruit` and its APIs open for active supporters
  while `ENABLE_SUPPORTER` is on (`canAutoRecruit`). It uses the same daily
  recruiter cap as recruiting by hand, so it saves clicks without raising
  the ceiling. The global `AUTO_RECRUIT_ENABLED` still opens it to everyone.
- **Discord bot** (HTTP interactions; no gateway process):
  - Free: `/link`, `/profile`, `/stats`, `/leaderboard`, `/fort`, `/myclan`,
    `/war` (ephemeral replies) and the daily digest DM.
  - Supporters: instant DMs for attacks, spy missions, war declarations and
    full stamina (attack turns have no cap; stamina refills on a wall
    clock, so each turn run queues the DM for the time stamina will be full,
    and the sender drops it if the player has spent stamina since). Quiet hours (UTC) hold DMs until they
    end.
  - Premium alliances: every member who links Discord can turn on war
    alerts.
  - DMs go through the `DiscordOutbox` table: alerts are queued inside the
    game transaction (idempotent `eventKey`), a worker in the custom server
    sends about four a second, honours Discord's `retry_after`, skips
    players who block DMs or have unlinked, and retries other failures
    five times. Sent rows are pruned after 14 days by the daily job.
  - Spy alerts never name the spy; they say no more than the report.

### Running the Discord bot

1. Create an application in the Discord developer portal and add a bot.
2. Set `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY` and
   `DISCORD_BOT_TOKEN` in the runtime. Without the public key the
   interactions endpoint answers 404; without the token nothing is queued
   or sent.
3. Set the Interactions Endpoint URL to
   `https://<host>/api/discord/interactions`. Discord checks it with a
   signed PING; unsigned or stale requests get 401.
4. Register the commands:
   `DISCORD_APPLICATION_ID=... DISCORD_BOT_TOKEN=... [DISCORD_GUILD_ID=...] bun --no-env-file scripts/discord-register-commands.ts`
   (with a guild id they appear in that server at once; use it for alpha).
5. Invite the bot to the server with the `applications.commands` and `bot`
   scopes (no permissions needed). DMs need the player to share a server
   with the bot and to allow DMs from that server's members; otherwise
   Discord answers 403 (50007 or 50278) and the outbox skips the message.
   The Settings card tells players to allow it. Verified 2026-10-29 with
   OpenThroneBot in the test server: a real alert DM was delivered once the
   recipient allowed DMs.

## Go-live

- Sales are US-only at launch (owner decision 2026-10-29): consent asks for
  US residence, Checkout collects the billing address, and admins see a red
  badge on any non-US payment to review and refund. If Radar for Fraud Teams
  is available, add a rule blocking non-US cards. Revisit EU/UK (VAT,
  withdrawal rights and an online withdrawal function) before selling there.
- Buyers must be 18+ (or a parent buying); sign-up is 16+.
- Counsel review: `/legal/terms`, `/legal/refunds` (reviewed by Sol
  2026-10-29), the no-expiry state list, product classification, and any
  general Terms of Service for the game.
- Publish a monitored support address (currently privacy@openthrone.dev)
  and, if counsel advises, a business mailing address on both legal pages.
- Merge the privacy policy branch (`/legal/privacy`) before this one goes
  live; the terms link to it.
- Live Stripe products (`stripe-sync-products.ts` with live keys), the
  production webhook endpoint with the events above, `SUPPORTER_ALLOW_LIVE=1`,
  one real purchase and refund.
- The production Discord application and its command registration.
- CHANGELOG entry for that release (draft):

  ```
  ### Added
  - **Patronage:** support OpenThrone with a monthly membership, an era
    pass, gift codes, or a sponsorship for your alliance. Patrons get a
    crown badge, Discord alerts and auto-recruit; nothing gives combat
    power. Payments run on Stripe; OpenThrone never sees your card.
  - **Discord:** link your account in Settings for bot commands and a daily
    digest.
  ```
