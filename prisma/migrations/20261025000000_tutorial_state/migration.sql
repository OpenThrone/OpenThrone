-- Tutorial progress lives on the account so clearing cookies or storage cannot replay it.
ALTER TABLE "users" ADD COLUMN "tutorial_state" JSONB;
