ALTER TABLE channels
    ADD COLUMN IF NOT EXISTS country_code VARCHAR(3)
        REFERENCES country_config(code) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS channels_country_kind_unique_idx
    ON channels (country_code, kind)
    WHERE country_code IS NOT NULL;
