ALTER TABLE marketplace_items
    ADD COLUMN IF NOT EXISTS item_type VARCHAR(20) NOT NULL DEFAULT 'listing'
    CHECK (item_type IN ('listing', 'local', 'service'));

CREATE TABLE IF NOT EXISTS map_markers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(30) NOT NULL CHECK (
        category IN ('POWER_OUTAGE', 'WATER_OUTAGE', 'ROAD_HAZARD')
    ),
    title VARCHAR(150) NOT NULL,
    description TEXT,
    location GEOMETRY(Point, 4326) NOT NULL,
    radius_impact_m INTEGER NOT NULL DEFAULT 500 CHECK (radius_impact_m > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'CONFIRMING'
        CHECK (status IN ('CONFIRMING', 'ACTIVE', 'RESOLVED', 'EXPIRED')),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP + INTERVAL '24 hours',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_map_markers_active_location
    ON map_markers USING GIST (location)
    WHERE status IN ('CONFIRMING', 'ACTIVE');

CREATE TABLE IF NOT EXISTS map_marker_confirmations (
    marker_id UUID NOT NULL REFERENCES map_markers(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    location GEOMETRY(Point, 4326) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (marker_id, user_id)
);

CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversation_participants (
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_read_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS private_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_private_messages_conversation_created
    ON private_messages (conversation_id, created_at DESC);
