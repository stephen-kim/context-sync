ALTER TABLE github_webhook_events
  ADD COLUMN IF NOT EXISTS affected_repos_count integer NOT NULL DEFAULT 0;
