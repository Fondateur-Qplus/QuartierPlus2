ALTER TABLE country_config
    ADD COLUMN IF NOT EXISTS default_radius_m INTEGER NOT NULL DEFAULT 5000;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'country_config_default_radius_m_positive'
    ) THEN
        ALTER TABLE country_config
            ADD CONSTRAINT country_config_default_radius_m_positive
            CHECK (default_radius_m > 0);
    END IF;
END $$;
