-- Add INACTIVE status and anti-abuse shadow table
ALTER TYPE "AccountStatus" ADD VALUE IF NOT EXISTS 'INACTIVE';

CREATE TABLE IF NOT EXISTS "AntiAbuseShadow" (
  "id" SERIAL PRIMARY KEY,
  "hash" TEXT NOT NULL UNIQUE,
  "reason" TEXT,
  "ipHash" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3)
);
