CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    location GEOGRAPHY(Point, 4326),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sos_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    location GEOGRAPHY(Point, 4326) NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE pro_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id),
    business_name TEXT NOT NULL,
    location GEOGRAPHY(Point, 4326),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
    CREATE TYPE marker_category AS ENUM (
        'POWER_OUTAGE',
        'WATER_OUTAGE',
        'ROAD_HAZARD',
        'MERCHANT_PRO',
        'PUBLIC_POI',
        'MUTUAL_AID',
        'COMMUNITY_EVENT'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE map_markers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    category marker_category NOT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    catalog_url TEXT,
    location GEOGRAPHY(Point, 4326) NOT NULL,
    radius_impact_m INT NOT NULL DEFAULT 500 CHECK (radius_impact_m >= 0),
    is_sponsored BOOLEAN NOT NULL DEFAULT FALSE,
    confirmations_count INT NOT NULL DEFAULT 0 CHECK (confirmations_count >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('CONFIRMING', 'ACTIVE', 'RESOLVED', 'EXPIRED')),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (NOT is_sponsored OR category = 'MERCHANT_PRO'),
    CHECK (
        category NOT IN ('POWER_OUTAGE', 'WATER_OUTAGE')
        OR status <> 'ACTIVE'
        OR confirmations_count >= 3
    )
);

CREATE TABLE map_marker_confirmations (
    marker_id UUID NOT NULL REFERENCES map_markers(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (marker_id, user_id)
);

CREATE INDEX map_markers_location_gist_idx
    ON map_markers USING GIST (location);
CREATE INDEX map_markers_category_idx ON map_markers (category);
CREATE INDEX map_markers_status_created_idx
    ON map_markers (status, created_at);
CREATE INDEX map_marker_confirmations_recent_idx
    ON map_marker_confirmations (marker_id, confirmed_at);

CREATE FUNCTION confirm_map_outage(
    p_marker_id UUID,
    p_user_id UUID,
    p_confirming_location GEOGRAPHY
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    marker map_markers%ROWTYPE;
    recent_confirmations INTEGER;
BEGIN
    SELECT * INTO marker
    FROM map_markers
    WHERE id = p_marker_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Map marker % does not exist', p_marker_id;
    END IF;
    IF marker.category NOT IN ('POWER_OUTAGE', 'WATER_OUTAGE') THEN
        RAISE EXCEPTION 'Only outage markers can be confirmed';
    END IF;
    IF p_user_id IS NULL OR p_user_id = marker.user_id THEN
        RAISE EXCEPTION 'The reporter cannot confirm their own outage marker';
    END IF;
    IF marker.status <> 'CONFIRMING'
       OR marker.created_at < NOW() - INTERVAL '30 minutes' THEN
        RAISE EXCEPTION 'Outage marker is no longer accepting confirmations';
    END IF;
    IF p_confirming_location IS NULL
       OR ST_Distance(marker.location, p_confirming_location) > 500 THEN
        RAISE EXCEPTION 'Confirmation must come from within 500 metres';
    END IF;

    INSERT INTO map_marker_confirmations (marker_id, user_id)
    VALUES (p_marker_id, p_user_id);

    SELECT COUNT(*)::INTEGER INTO recent_confirmations
    FROM map_marker_confirmations
    WHERE marker_id = p_marker_id
      AND confirmed_at >= NOW() - INTERVAL '30 minutes';

    UPDATE map_markers
    SET confirmations_count = recent_confirmations,
        status = CASE
            WHEN recent_confirmations >= 3 THEN 'ACTIVE'
            ELSE 'CONFIRMING'
        END
    WHERE id = p_marker_id;

    RETURN recent_confirmations;
END;
$$;

CREATE FUNCTION expire_unconfirmed_map_outages() RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE map_markers
    SET status = 'EXPIRED'
    WHERE category IN ('POWER_OUTAGE', 'WATER_OUTAGE')
      AND status = 'CONFIRMING'
      AND created_at < NOW() - INTERVAL '30 minutes';

    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RETURN expired_count;
END;
$$;

CREATE INDEX users_location_gist_idx ON users USING GIST (location);
CREATE INDEX sos_alerts_location_gist_idx ON sos_alerts USING GIST (location);
CREATE INDEX pro_accounts_location_gist_idx ON pro_accounts USING GIST (location);
