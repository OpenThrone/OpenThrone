# Legacy production → alpha era import

The pre-era `master` deployment stores gameplay in `users` JSON columns. The
`attack-revert` migration chain drops those columns before creating normalized
relations. Do not restore the old data into staging and then blindly migrate it.
The old `scripts/migrate-eras.ts` and `scripts/migrate-user-json.ts` scripts are
incomplete and are not the entrypoints for this operation.

## Procedure

1. Back up production and alpha with `pg_dump --format=custom --no-owner
   --no-acl --schema=public`. Keep dumps outside the repository with directory
   mode `0700` and file mode `0600`; they contain account credentials and PII.
2. Restore the production dump into an isolated legacy database. A PostgreSQL 18
   dump restored to an older server needs the `SET transaction_timeout = 0`
   statement removed from the SQL restore stream. Supabase's two public triggers
   referencing `storage.update_updated_at_column()` also need their dependency
   resolved in the isolated restore; this rehearsal used the equivalent restored
   `public.update_updated_at_column()` function. Do not modify the original dump.
3. Create an empty `otdev_era_candidate_<date>` database and apply all checked-in
   migrations with `bunx prisma migrate deploy`, explicitly overriding
   `POSTGRES_URL_NON_POOLING` in the process environment.
4. Run `bun scripts/import-legacy-era.ts` with explicit `LEGACY_SOURCE_URL` and
   `LEGACY_TARGET_URL`. Source access is a repeatable-read, read-only transaction.
   The importer refuses populated targets, Supabase targets, and matching source
   and target databases. `--keep-alliance-gold` opts into retaining alliance gold;
   the default retains alliances/memberships and clears their banks.
5. Check account identity/password hashes against the restored source; compare
   every user's archived gold, XP, inventories, and upgrades. Verify counts for
   historical records, all FK constraints, all default armies, and staff roles.
   Run historical stats using the application service against the candidate.
   `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma
   --exit-code` must report no difference.
6. Take another alpha backup immediately before replacement. Dump the verified
   candidate and restore its public schema into `otdev_stage` in one transaction
   (`psql -X --single-transaction --set=ON_ERROR_STOP=1`), dropping the previous
   public schema within that same transaction. A restore failure rolls back the
   replacement. This is a complete replacement, not a merge of alpha test users.
7. Verify the live alpha era list and historical stats with a cache-busting query
   parameter. Deploy the accompanying application code and regenerate Prisma
   before restarting the application. The added optional history fields are
   backward compatible with the previous application.

## Data semantics

- Account IDs, names, emails, password hashes, profiles, recruit links, race,
  class, and locale survive unchanged. Account status history survives unchanged,
  including existing banned statuses; this operation does not repair legacy
  duplicate open status records.
- Legacy `ADMINISTRATOR`/`MODERATOR` grants become `StaffRoleAssignment` rows.
  The current permission expansion applies the existing role presets.
- Era 1 is closed legacy production. Its start is the earliest available account,
  attack, or recruitment timestamp; its end is the import transaction boundary.
  Era 2 starts at that same boundary.
- Each account receives a `UserEra` row with exact end gold, bank gold, combat
  stats, structure levels, final level, achievements, and `snapshotAtEnd` gameplay
  data. Bigint columns are serialized as decimal strings without float conversion.
  Credentials are excluded from snapshots. The old experimental normalized rows
  are also preserved inside the snapshot. Starting inventory is unknown, so
  `unitsAtStart` is empty; the legacy starting level retains the default of 1.
- Current gameplay uses the shared era defaults: 25,000 hand gold, empty bank,
  zero XP, 50 citizens, 50 turns, 100 stamina, and starter structures. Old JSON
  gameplay fields are cleared to prevent stale fallback state. Ranks, stats,
  and legacy strength multipliers reset as well.
- Attack, recruitment, bank, chat, social, and account-status records are retained.
  Historical public stats depend on these records, not only `UserEra` snapshots.
  Source tables with no current equivalent are preserved through snapshots and
  the original full dump; the source migration ledger is not imported.
- Future era snapshots capture final level and inventories/upgrades. Win counts
  are restricted to attacks within the era being closed, avoiding recounting
  legacy wins into future lifetime achievements.

## 2026-10-03 execution

Private backups and restore material:
`/home/tim/backups/openthrone-era-20261003/`.

Rehearsal databases on the alpha PostgreSQL server:
`otdev_legacy_20261003` and `otdev_era_candidate_20261003`.
These are retained for comparison/rollback work, not application databases.

The full production dump imported 287 accounts, 3,440 attack logs, 7,103
recruitment records, 288,222 bank records, 691 account-status records, 2 alliances,
3 alliance memberships, and 3 staff roles. Every account has a closed legacy-era
snapshot and belongs to Era 2. All 39 checked-in migrations applied cleanly.

Validation: account identity/password hashes matched; all archived gold, XP,
inventories, and upgrades matched; all 287 default citizen armies matched;
foreign keys were validated; schema diff was empty; historical leaderboards
were populated; focused Bun tests, type checks, and production build passed.
Production itself was read and backed up, without schema or data writes.
The atomic staging replacement completed successfully. Live alpha's era-list
and historical-stats endpoints returned both eras and populated legacy
leaderboards after the swap. Deployment of the accompanying code changes
requires the alpha application's service/checkout location.
