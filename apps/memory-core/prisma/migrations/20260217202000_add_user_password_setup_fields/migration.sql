ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "password_hash" TEXT;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "must_change_password" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "email_verified" BOOLEAN NOT NULL DEFAULT false;

-- Existing deployments should not be locked out after migration.
UPDATE "users"
SET "must_change_password" = false
WHERE "must_change_password" IS NULL OR "must_change_password" = true;

UPDATE "users"
SET "email_verified" = true
WHERE "email_verified" IS NULL OR "email_verified" = false;
