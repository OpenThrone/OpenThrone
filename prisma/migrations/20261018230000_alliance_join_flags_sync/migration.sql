-- Legacy join flags were only set when an alliance was created, so switching
-- join mode later left them stale (an alliance switched to Open still refused
-- joins as "private"). Re-derive them from join_mode.
UPDATE "alliances"
SET "is_public" = ("join_mode" <> 'INVITE_ONLY'),
    "closed_enrollment" = ("join_mode" = 'INVITE_ONLY'),
    "require_auth" = ("join_mode" = 'REQUEST_TO_JOIN');
