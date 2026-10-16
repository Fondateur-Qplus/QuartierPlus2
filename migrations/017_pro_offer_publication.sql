ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS publication JSONB NOT NULL DEFAULT '{}'::jsonb;
