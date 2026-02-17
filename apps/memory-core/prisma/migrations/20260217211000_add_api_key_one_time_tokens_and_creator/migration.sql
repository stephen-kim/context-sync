CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE "api_keys"
  ADD COLUMN IF NOT EXISTS "created_by_user_id" TEXT;

UPDATE "api_keys"
SET "created_by_user_id" = COALESCE("created_by_user_id", "user_id")
WHERE "created_by_user_id" IS NULL;

ALTER TABLE "api_keys"
  ADD CONSTRAINT "api_keys_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id")
  REFERENCES "users"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "api_keys_created_by_user_id_idx"
ON "api_keys" ("created_by_user_id");

CREATE TABLE IF NOT EXISTS "api_key_one_time_tokens" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "api_key_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL UNIQUE,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at" TIMESTAMP(3),
  "created_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "api_key_one_time_tokens_api_key_id_fkey"
    FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "api_key_one_time_tokens_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "api_key_one_time_tokens_api_key_id_idx"
ON "api_key_one_time_tokens" ("api_key_id");
