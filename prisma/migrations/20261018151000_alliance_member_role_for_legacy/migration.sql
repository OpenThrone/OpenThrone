-- Legacy alliances (#66): alliances created before the default rank existed have
-- no role named 'Member', but joining and accepting requests assign that role by
-- name, so nobody could join them. Give each such alliance a 'Member' rank below
-- every existing rank, with the same permissions new alliances' Member rank gets.
INSERT INTO "alliance_roles" ("name", "alliance_id", "rank_order", "permissions", "created_at", "updated_at")
SELECT
  'Member',
  a."id",
  COALESCE((SELECT MAX(r."rank_order") FROM "alliance_roles" r WHERE r."alliance_id" = a."id"), -1) + 1,
  '{"invite_member": false, "grant_access": false, "edit_ranks": false, "kick_member": false, "declare_war": false, "manage_bank": false, "request_gold": true, "send_messages": true, "post_announcements": false, "edit_profile": false, "manage_allies": false, "manage_enemies": false, "edit_list": false, "view_list": true, "share_reports": true, "call_targets": false}'::json,
  NOW(),
  NOW()
FROM "alliances" a
WHERE NOT EXISTS (
  SELECT 1 FROM "alliance_roles" r WHERE r."alliance_id" = a."id" AND r."name" = 'Member'
);
