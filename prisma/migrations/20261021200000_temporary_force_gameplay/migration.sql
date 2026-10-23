BEGIN;

ALTER TABLE "ForceReserve" ADD COLUMN "woundedQuantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastHealedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ForceReserve" ADD CONSTRAINT "ForceReserve_valid_wounded" CHECK ("woundedQuantity" >= 0 AND "available" + "woundedQuantity" <= 1000000);
ALTER TABLE "ForceContract" ADD COLUMN "requestedExtensionDays" INTEGER;
ALTER TABLE "ForceContract" ADD CONSTRAINT "ForceContract_valid_extension" CHECK ("requestedExtensionDays" IS NULL OR ("status" = 'ACTIVE' AND "requestedExtensionDays" BETWEEN 1 AND 30));

ALTER TABLE "ForceReserve" ADD COLUMN "eraId" INTEGER;
ALTER TABLE "ForceContract" ADD COLUMN "eraId" INTEGER;
CREATE TABLE "ForceLedgerArchive" (
 "id" SERIAL PRIMARY KEY, "allianceId" INTEGER NOT NULL, "snapshot" JSONB NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ForceLedgerArchive_allianceId_idx" ON "ForceLedgerArchive"("allianceId");
CREATE TABLE "ForceObligation" (
 "id" SERIAL PRIMARY KEY, "allianceId" INTEGER NOT NULL, "userId" INTEGER NOT NULL,
 "sourceKey" VARCHAR(128) NOT NULL UNIQUE, "title" VARCHAR(120) NOT NULL,
 "amountGold" BIGINT NOT NULL DEFAULT 0, "paidGold" BIGINT NOT NULL DEFAULT 0,
 "quantity" INTEGER NOT NULL DEFAULT 0, "paidQuantity" INTEGER NOT NULL DEFAULT 0,
 "type" "UnitType", "level" INTEGER, "dueAt" TIMESTAMPTZ(3) NOT NULL,
 "fineGold" BIGINT NOT NULL DEFAULT 0, "paidFineGold" BIGINT NOT NULL DEFAULT 0,
 "fineAssessedAt" TIMESTAMPTZ(3), "reminderAt" TIMESTAMPTZ(3), "cancelledAt" TIMESTAMPTZ(3),
 "collectionUnitId" INTEGER, "collectionEquipment" JSONB,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ForceObligation_valid_amounts" CHECK (
  "amountGold" >= 0 AND "paidGold" BETWEEN 0 AND "amountGold" AND "quantity" BETWEEN 0 AND 1000000
  AND "paidQuantity" BETWEEN 0 AND "quantity" AND "fineGold" >= 0 AND "paidFineGold" BETWEEN 0 AND "fineGold"
  AND (("amountGold" > 0 AND "quantity" = 0 AND "type" IS NULL AND "level" IS NULL)
   OR ("amountGold" = 0 AND "quantity" > 0 AND "type" IN ('OFFENSE','DEFENSE','SPY','SENTRY') AND "level" BETWEEN 1 AND 3))
 )
);
CREATE INDEX "ForceObligation_allianceId_userId_dueAt_idx" ON "ForceObligation"("allianceId","userId","dueAt");
CREATE TABLE "ForceDuesRule" (
 "id" SERIAL PRIMARY KEY, "allianceId" INTEGER NOT NULL, "roleId" INTEGER NOT NULL, "minLevel" INTEGER NOT NULL DEFAULT 1,
 "amountGold" BIGINT NOT NULL DEFAULT 0, "quantity" INTEGER NOT NULL DEFAULT 0, "type" "UnitType", "level" INTEGER,
 "intervalDays" INTEGER NOT NULL DEFAULT 7, "dueDays" INTEGER NOT NULL DEFAULT 3,
 "nextIssueAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
 CONSTRAINT "ForceDuesRule_valid_terms" CHECK ("minLevel" >= 1 AND "intervalDays" BETWEEN 1 AND 365 AND "dueDays" BETWEEN 1 AND 30
  AND (("amountGold" > 0 AND "quantity" = 0 AND "type" IS NULL AND "level" IS NULL)
   OR ("amountGold" = 0 AND "quantity" BETWEEN 1 AND 1000000 AND "type" IN ('OFFENSE','DEFENSE','SPY','SENTRY') AND "level" BETWEEN 1 AND 3)))
);
CREATE UNIQUE INDEX "ForceDuesRule_allianceId_roleId_minLevel_key" ON "ForceDuesRule"("allianceId","roleId","minLevel");
CREATE INDEX "ForceDuesRule_nextIssueAt_enabled_idx" ON "ForceDuesRule"("nextIssueAt","enabled");

ALTER TABLE "ForceObligation" ADD COLUMN "eraId" INTEGER, ADD COLUMN "enforcement" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "ForceObligation" ADD CONSTRAINT "ForceObligation_allianceId_fkey" FOREIGN KEY ("allianceId") REFERENCES "alliances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ForceObligation" ADD CONSTRAINT "ForceObligation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ForceDuesRule" ADD CONSTRAINT "ForceDuesRule_allianceId_fkey" FOREIGN KEY ("allianceId") REFERENCES "alliances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing inactive-ledger records belong to the current era, not a free future pool.
UPDATE "ForceReserve" SET "eraId" = (SELECT id FROM "Era" WHERE "endDate" IS NULL ORDER BY id DESC LIMIT 1);
UPDATE "ForceContract" c SET "eraId" = u."currentEraId" FROM users u WHERE u.id = c."userId";
-- Grandfather legacy mercenaries into seven-day equipped contracts, without charging gold
-- or minting personal inventory. Unknown stacks abort instead of being silently discarded.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "UserUnit" WHERE "isMercenary" AND ("type" NOT IN ('OFFENSE','DEFENSE','SPY','SENTRY') OR "level" NOT BETWEEN 1 AND 3 OR "quantity" < 0 OR "quantity" > 1000000)) THEN
  RAISE EXCEPTION 'Unsupported legacy mercenary stack; resolve before deploying gameplay';
 END IF;
 IF EXISTS (
  SELECT 1 FROM users p CROSS JOIN LATERAL jsonb_array_elements(
   CASE WHEN jsonb_typeof(p.wounded_units) = 'array' THEN p.wounded_units ELSE '[]'::jsonb END
  ) w WHERE w->>'isMercenary' = 'true' AND NOT (w ? 'forceContractId') AND (
   COALESCE(w->>'type','') NOT IN ('OFFENSE','DEFENSE','SPY','SENTRY')
   OR COALESCE(w->>'level','') NOT IN ('1','2','3')
   OR COALESCE(w->>'quantity','') !~ '^[0-9]{1,7}$'
  )
 ) THEN RAISE EXCEPTION 'Unsupported legacy mercenary wounds; resolve before deploying gameplay'; END IF;
END $$;
CREATE TEMP TABLE legacy_mercenary_contracts (
 id INTEGER, "userId" INTEGER, type "UnitType", level INTEGER, quantity INTEGER
) ON COMMIT DROP;
WITH offers(type, level, equipment, price) AS (VALUES ('OFFENSE'::"UnitType", 1, '[{"type":"WEAPON","level":1},{"type":"HELM","level":1},{"type":"ARMOR","level":1},{"type":"BOOTS","level":1},{"type":"BRACERS","level":1},{"type":"SHIELD","level":1}]'::jsonb, 1850::bigint),
('OFFENSE'::"UnitType", 2, '[{"type":"WEAPON","level":2},{"type":"HELM","level":2},{"type":"ARMOR","level":2},{"type":"BOOTS","level":2},{"type":"BRACERS","level":2},{"type":"SHIELD","level":2}]'::jsonb, 4050::bigint),
('OFFENSE'::"UnitType", 3, '[{"type":"WEAPON","level":3},{"type":"HELM","level":3},{"type":"ARMOR","level":3},{"type":"BOOTS","level":3},{"type":"BRACERS","level":3},{"type":"SHIELD","level":3}]'::jsonb, 8375::bigint),
('DEFENSE'::"UnitType", 1, '[{"type":"WEAPON","level":1},{"type":"HELM","level":1},{"type":"ARMOR","level":1},{"type":"BOOTS","level":1},{"type":"BRACERS","level":1},{"type":"SHIELD","level":1}]'::jsonb, 1850::bigint),
('DEFENSE'::"UnitType", 2, '[{"type":"WEAPON","level":2},{"type":"HELM","level":2},{"type":"ARMOR","level":2},{"type":"BOOTS","level":2},{"type":"BRACERS","level":2},{"type":"SHIELD","level":2}]'::jsonb, 4050::bigint),
('DEFENSE'::"UnitType", 3, '[{"type":"WEAPON","level":3},{"type":"HELM","level":3},{"type":"ARMOR","level":3},{"type":"BOOTS","level":3},{"type":"BRACERS","level":3},{"type":"SHIELD","level":3}]'::jsonb, 8375::bigint),
('SPY'::"UnitType", 1, '[{"type":"WEAPON","level":1},{"type":"HELM","level":1},{"type":"ARMOR","level":1},{"type":"BOOTS","level":1},{"type":"BRACERS","level":1}]'::jsonb, 1550::bigint),
('SPY'::"UnitType", 2, '[{"type":"WEAPON","level":2},{"type":"HELM","level":2},{"type":"ARMOR","level":2},{"type":"BOOTS","level":2},{"type":"BRACERS","level":2}]'::jsonb, 3425::bigint),
('SPY'::"UnitType", 3, '[{"type":"WEAPON","level":3},{"type":"HELM","level":3},{"type":"ARMOR","level":3},{"type":"BOOTS","level":3},{"type":"BRACERS","level":3}]'::jsonb, 7125::bigint),
('SENTRY'::"UnitType", 1, '[{"type":"WEAPON","level":1},{"type":"HELM","level":1},{"type":"ARMOR","level":1},{"type":"BOOTS","level":1},{"type":"BRACERS","level":1},{"type":"SHIELD","level":1}]'::jsonb, 1850::bigint),
('SENTRY'::"UnitType", 2, '[{"type":"WEAPON","level":2},{"type":"HELM","level":2},{"type":"ARMOR","level":2},{"type":"BOOTS","level":2},{"type":"BRACERS","level":2},{"type":"SHIELD","level":2}]'::jsonb, 4050::bigint),
('SENTRY'::"UnitType", 3, '[{"type":"WEAPON","level":3},{"type":"HELM","level":3},{"type":"ARMOR","level":3},{"type":"BOOTS","level":3},{"type":"BRACERS","level":3},{"type":"SHIELD","level":3}]'::jsonb, 8375::bigint)), legacy AS (
 SELECT "userId",type,level,SUM(quantity)::integer AS quantity FROM (
  SELECT "userId",type,level,quantity FROM "UserUnit" WHERE "isMercenary"
  UNION ALL
  SELECT p.id,(w->>'type')::"UnitType",(w->>'level')::integer,(w->>'quantity')::integer
  FROM users p CROSS JOIN LATERAL jsonb_array_elements(
   CASE WHEN jsonb_typeof(p.wounded_units) = 'array' THEN p.wounded_units ELSE '[]'::jsonb END
  ) w WHERE w->>'isMercenary' = 'true' AND NOT (w ? 'forceContractId')
 ) stacks GROUP BY "userId",type,level
), migrated AS (
 INSERT INTO "ForceContract" (kind,status,"userId","eraId",type,level,equipment,"initialQuantity","survivingQuantity","termDays","startsAt","expiresAt","unitPriceGold","updatedAt")
 SELECT 'MERCENARY','ACTIVE',u."userId",p."currentEraId",u.type,u.level,o.equipment,u.quantity,u.quantity,7,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP + INTERVAL '7 days',o.price,CURRENT_TIMESTAMP
 FROM legacy u JOIN users p ON p.id=u."userId" JOIN offers o ON o.type=u.type AND o.level=u.level
 WHERE u.quantity > 0
 RETURNING id,"userId",type,level,"initialQuantity"
)
INSERT INTO legacy_mercenary_contracts SELECT id,"userId",type,level,"initialQuantity" FROM migrated;
INSERT INTO "ForceEvent" ("operationKey","contractId","actorId",action,quantity,details)
 SELECT 'legacy-mercenary:' || id,id,"userId",'LEGACY_CONTRACT',quantity,'{"migration":"equipped-seven-day-contract"}'::jsonb FROM legacy_mercenary_contracts;
-- Keep wound groups attached to their temporary company, including wounded-only stacks.
UPDATE users p SET wounded_units = (
 SELECT COALESCE(jsonb_agg(
  CASE WHEN m.id IS NOT NULL THEN w || jsonb_build_object('forceContractId',m.id) ELSE w END
  ORDER BY ordinal
 ),'[]'::jsonb)
 FROM jsonb_array_elements(p.wounded_units) WITH ORDINALITY AS wound(w,ordinal)
 LEFT JOIN legacy_mercenary_contracts m ON m."userId"=p.id
  AND m.type::text=w->>'type' AND m.level::text=w->>'level'
  AND w->>'isMercenary'='true' AND NOT (w ? 'forceContractId')
 WHERE NOT (COALESCE(w->>'isMercenary','false')='true' AND NOT (w ? 'forceContractId') AND w->>'quantity'='0')
) WHERE jsonb_typeof(p.wounded_units)='array' AND EXISTS (
 SELECT 1 FROM jsonb_array_elements(p.wounded_units) w
 WHERE w->>'isMercenary'='true' AND NOT (w ? 'forceContractId')
);
DELETE FROM "UserUnit" WHERE "isMercenary";

ALTER TABLE "ForceObligation" ADD CONSTRAINT "ForceObligation_valid_enforcement" CHECK (jsonb_typeof("enforcement") = 'object');

COMMIT;
