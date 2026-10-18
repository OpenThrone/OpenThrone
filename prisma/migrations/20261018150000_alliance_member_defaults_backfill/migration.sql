-- Alliance member defaults (#66): existing default "Member" roles predate the
-- request_gold and share_reports permissions, so grant them here to match new alliances.
-- Other permission keys are preserved; NULL permissions start from an empty object.
UPDATE "alliance_roles"
SET "permissions" = (COALESCE("permissions"::jsonb, '{}'::jsonb) || '{"request_gold": true, "share_reports": true}'::jsonb)::json
WHERE "name" = 'Member';
