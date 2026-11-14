-- LoginEvent kinds: SIGN_IN (existing rows, backfilled by the default),
-- SIGN_UP (registration fingerprint) and SEEN (once-a-day activity record).
ALTER TABLE "LoginEvent" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'SIGN_IN';
