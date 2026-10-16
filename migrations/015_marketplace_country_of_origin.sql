ALTER TABLE marketplace_items
    ADD COLUMN IF NOT EXISTS country_of_origin VARCHAR(3);
