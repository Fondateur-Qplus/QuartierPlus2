CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organizer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL CHECK (length(title) > 0),
    description TEXT NOT NULL DEFAULT '',
    location_name VARCHAR(200) NOT NULL,
    location_coords GEOGRAPHY(Point, 4326),
    event_date TIMESTAMPTZ NOT NULL,
    ticket_price INT NOT NULL DEFAULT 0 CHECK (ticket_price >= 0),
    total_capacity INT NOT NULL CHECK (total_capacity > 0),
    tickets_sold INT NOT NULL DEFAULT 0
        CHECK (tickets_sold >= 0 AND tickets_sold <= total_capacity),
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS events_published_date_idx
    ON events (event_date) WHERE is_published = TRUE;
CREATE INDEX IF NOT EXISTS events_organizer_date_idx
    ON events (organizer_id, event_date DESC);
CREATE INDEX IF NOT EXISTS events_location_gist_idx
    ON events USING GIST (location_coords);

CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    qr_code_signature VARCHAR(64) NOT NULL UNIQUE,
    status VARCHAR(10) NOT NULL DEFAULT 'VALID'
        CHECK (status IN ('VALID', 'USED', 'CANCELLED')),
    purchased_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    scanned_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS tickets_user_purchased_idx
    ON tickets (user_id, purchased_at DESC);
CREATE INDEX IF NOT EXISTS tickets_event_status_idx
    ON tickets (event_id, status);

CREATE TABLE IF NOT EXISTS event_ticket_reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transaction_id UUID UNIQUE REFERENCES transactions(id) ON DELETE SET NULL,
    status VARCHAR(12) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'APPROVED', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS event_ticket_reservations_capacity_idx
    ON event_ticket_reservations (event_id)
    WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS event_ticket_reservations_user_idx
    ON event_ticket_reservations (user_id, event_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS event_ticket_reservations_pending_user_idx
    ON event_ticket_reservations (event_id, user_id)
    WHERE status = 'PENDING';
