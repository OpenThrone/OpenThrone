ALTER TABLE "PasswordReset" ADD COLUMN "type" TEXT DEFAULT 'PASSWORD';

ALTER TABLE "PasswordReset" ADD COLUMN "oldEmail" TEXT DEFAULT NULL;
