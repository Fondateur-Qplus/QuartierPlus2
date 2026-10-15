ALTER TABLE map_markers
    DROP CONSTRAINT IF EXISTS map_markers_category_check;

ALTER TABLE map_markers
    ADD CONSTRAINT map_markers_category_check
    CHECK (category IN (
        'POWER_OUTAGE',
        'WATER_OUTAGE',
        'ROAD_HAZARD',
        'LOST_ITEM'
    ));
