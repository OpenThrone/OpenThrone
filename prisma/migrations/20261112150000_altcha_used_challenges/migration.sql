-- Replay protection for the self-hosted ALTCHA recruitment captcha: each solved
-- challenge nonce is stored until it expires and is accepted only once.
CREATE TABLE "altcha_used_challenges" (
    "nonce" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "altcha_used_challenges_pkey" PRIMARY KEY ("nonce")
);

CREATE INDEX "altcha_used_challenges_expiresAt_idx" ON "altcha_used_challenges"("expiresAt");

ALTER TABLE "altcha_used_challenges" ENABLE ROW LEVEL SECURITY;
