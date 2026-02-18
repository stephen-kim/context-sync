-- Keep plaintext API key column nullable so only key_hash is persisted.
ALTER TABLE "api_keys"
  ALTER COLUMN "key" DROP NOT NULL;
