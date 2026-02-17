ALTER TABLE "workspace_settings"
  ADD COLUMN IF NOT EXISTS "search_type_weights" JSONB NOT NULL DEFAULT '{"decision":1.5,"constraint":1.35,"goal":1.2,"activity":1.05,"active_work":1.1,"summary":1.2,"note":1.0,"problem":1.0,"caveat":0.95}'::jsonb,
  ADD COLUMN IF NOT EXISTS "search_recency_half_life_days" DOUBLE PRECISION NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS "search_subpath_boost_weight" DOUBLE PRECISION NOT NULL DEFAULT 1.5;
