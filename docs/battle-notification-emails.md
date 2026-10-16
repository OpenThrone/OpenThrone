# Battle notification emails

Players can opt in under **Settings → Email notifications → Battle alerts**.
The preference defaults to off, and “Unsubscribe from all non-essential email”
overrides it. Each successful attack queues one alert for the defender, including
the defender's victory/defeat outcome and a link to the existing access-controlled
battle report. Spy missions do not trigger alerts.

Alerts use the recipient's saved locale (English, Spanish, or German, with English
fallback), escaped HTML, plain text, preference links, and signed one-click
unsubscribe. The self-service data export includes the battle-alert preference.

The combat transaction inserts the outbox record before committing. A database
or template failure aborts that transaction; it must not be swallowed after a
PostgreSQL statement failure. SMTP runs asynchronously through the existing email
outbox worker, so SMTP failure does not reverse a committed battle. A unique event
key prevents duplicate queue records for the same attack and defender. The worker
rechecks opt-in, global opt-out, address changes, suppression, and closed-account
status before each delivery, including retries. Existing bounded retries apply.
SMTP delivery retains the existing worker's at-least-once behavior if a process
dies after provider acceptance but before recording success.

Before enabling this feature in a deployed environment, follow the deployment
workflow in `AGENTS.md`, apply both additive
migrations (`20261014010614_add_attack_notification_emails` and
`20261014120000_battle_alert_outbox`), and regenerate the Prisma client. Use the
existing SMTP, HTTPS site-root, identity-hashing and unsubscribe-secret
configuration. The existing `email.outbox.enabled` runtime gate must be enabled
for queued alerts to send. No new worker or provider is required.

Verification covers combat-to-outbox integration, template escaping and locale
fallbacks, opt-in/defaults, delivery-time opt-out, unsubscribe, and migration
deduplication/rollback on a disposable PostgreSQL instance. Browser checks use
the exact settings section with synthetic state, existing Mantine controls and
themes; they do not replace an authenticated staging delivery smoke test. No
real email was sent as part of these checks.
