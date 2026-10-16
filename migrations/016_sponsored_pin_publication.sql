ALTER TABLE sponsored_pins
    ADD COLUMN IF NOT EXISTS caption VARCHAR(300) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS marketplace_item_id UUID
        REFERENCES marketplace_items(id) ON DELETE SET NULL;
