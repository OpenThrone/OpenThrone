-- Aggregate cookie-consent choices per OT calendar day, for the admin
-- opt-in rate. No IP, no user id, no user agent: a pure counter, so nothing
-- here can identify a visitor.
CREATE TABLE "consent_tally" (
    "day" DATE NOT NULL,
    "choice" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "consent_tally_pkey" PRIMARY KEY ("day", "choice")
);

ALTER TABLE "consent_tally" ENABLE ROW LEVEL SECURITY;
