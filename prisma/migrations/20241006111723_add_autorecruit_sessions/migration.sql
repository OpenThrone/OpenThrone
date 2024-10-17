-- Create the sequence for the id field
CREATE SEQUENCE "AutoRecruitSession_id_seq";

-- Create the AutoRecruitSession table
CREATE TABLE "AutoRecruitSession" (
  "id" INTEGER NOT NULL DEFAULT nextval('"AutoRecruitSession_id_seq"'::regclass),
  "userId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "lastActivityAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("id")
);

-- Add a foreign key constraint to link sessions to users
ALTER TABLE "AutoRecruitSession"
ADD CONSTRAINT "AutoRecruitSession_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create an index on userId for faster queries
CREATE INDEX "AutoRecruitSession_userId_idx" ON "AutoRecruitSession"("userId");
