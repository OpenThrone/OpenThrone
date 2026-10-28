# Report sharing

Participants control access to battle, intel, assassination and infiltration
reports. A recipient can read a report but cannot grant access, revoke grants,
or make it public, including through chat. Both battle participants may manage
all grants. Public reports can be read without signing in, through the existing
report URL; they use the same allowlist redaction as other shared reports.
Public access is off by default and requires confirmation in the sharing form.

Alliance grants require current membership and `share_reports`. Access follows
current membership rather than a snapshot of the roster. New shares in alliance
chat rooms also create an alliance grant, rather than individual permanent
player grants. Direct player grants remain independent. Revoking one grant does
not override another grant or public access, and cannot recall copied content.
Participants always retain their own access.

The sharing API at `/api/attack/logs/[id]/sharing` supports participant-only GET
and POST operations. It validates the authenticated actor, active era and target
permissions on the server. Grant and revoke operations serialize on the report
row; partial unique indexes make repeated grants idempotent. Revoking an
alliance grant removes the corresponding intelligence feed row. Public and
private report responses and sharing management responses are not cached.

## Rollout

Apply `20261024000000_report_sharing` and regenerate Prisma before starting the
updated app. The migration adds a default-false public flag and deduplicates
identical existing grants before adding unique indexes; it publishes no reports.
Deploy through the normal alpha review and verification workflow.

Historical per-player grants have no recorded source. They remain explicit,
revocable player grants; they cannot safely be inferred to have originated from
an alliance room. Review those grants in the new sharing dialog when restricting
an older report. New alliance-room shares use membership-bound grants.

## Verification

- `bun --no-env-file test src/services/ReportSharing.service.test.ts src/services/AttackLogAccess.service.test.ts src/services/Messaging.service.test.ts src/services/Battle.redaction.test.ts src/components/battle/SharedSpyReports.test.tsx`
- `bash scripts/test-integration.sh test/integration/reportSharing.test.ts test/integration/allianceArtwork.test.ts`
- `/test` includes compact dispatches, sharing, neutral spy reports and artwork
  controls with mock data and actions. It is unavailable in production.
