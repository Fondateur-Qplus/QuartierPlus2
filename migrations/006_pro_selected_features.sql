ALTER TABLE transactions
    DROP CONSTRAINT IF EXISTS transactions_payment_type_check;

ALTER TABLE transactions
    ADD CONSTRAINT transactions_payment_type_check
    CHECK (payment_type IN (
        'ALLIANCE_PRO',
        'SPONSORED_PIN',
        'SYNDIC',
        'TOWN_HALL',
        'SECURITY_AGENT',
        'TICKET'
    ));

CREATE TABLE IF NOT EXISTS residences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS residence_members (
    residence_id UUID NOT NULL REFERENCES residences(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'MEMBER'
        CHECK (role IN ('MEMBER', 'MANAGER')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (residence_id, user_id)
);

CREATE TABLE IF NOT EXISTS municipalities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL,
    center_location GEOGRAPHY(Point, 4326),
    radius_km DOUBLE PRECISION NOT NULL DEFAULT 30 CHECK (radius_km > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS municipality_members (
    municipality_id UUID NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (municipality_id, user_id)
);

CREATE TABLE IF NOT EXISTS flash_sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    discount_percent INT NOT NULL CHECK (discount_percent BETWEEN 1 AND 100),
    expires_at TIMESTAMPTZ NOT NULL,
    radius_km DOUBLE PRECISION NOT NULL DEFAULT 0.8
        CHECK (radius_km > 0 AND radius_km <= 0.8),
    location GEOGRAPHY(Point, 4326) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS flash_sales_location_gist_idx
    ON flash_sales USING GIST (location);
CREATE INDEX IF NOT EXISTS flash_sales_expiry_idx
    ON flash_sales (expires_at);

CREATE TABLE IF NOT EXISTS residence_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    residence_id UUID NOT NULL REFERENCES residences(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 5000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS residence_posts_residence_created_idx
    ON residence_posts (residence_id, created_at DESC);

CREATE TABLE IF NOT EXISTS residence_votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    residence_id UUID NOT NULL REFERENCES residences(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(250) NOT NULL,
    options JSONB NOT NULL CHECK (jsonb_typeof(options) = 'array'),
    status VARCHAR(10) NOT NULL DEFAULT 'OPEN'
        CHECK (status IN ('OPEN', 'CLOSED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS residence_vote_responses (
    vote_id UUID NOT NULL REFERENCES residence_votes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    option_index INT NOT NULL CHECK (option_index >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (vote_id, user_id)
);

CREATE TABLE IF NOT EXISTS craftsmen (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL,
    trade VARCHAR(100) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    rating NUMERIC(2, 1) NOT NULL DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),
    residence_id UUID NOT NULL REFERENCES residences(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS craftsmen_residence_rating_idx
    ON craftsmen (residence_id, rating DESC);

CREATE TABLE IF NOT EXISTS smart_report_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category VARCHAR(30) NOT NULL,
    centroid_location GEOGRAPHY(Point, 4326) NOT NULL,
    report_count INT NOT NULL DEFAULT 0 CHECK (report_count >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    grid_key VARCHAR(100) NOT NULL UNIQUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS smart_report_groups_location_gist_idx
    ON smart_report_groups USING GIST (centroid_location);

CREATE TABLE IF NOT EXISTS citizen_consultations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    municipality_id UUID NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question VARCHAR(500) NOT NULL,
    options JSONB NOT NULL CHECK (jsonb_typeof(options) = 'array'),
    ends_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS citizen_consultation_responses (
    consultation_id UUID NOT NULL REFERENCES citizen_consultations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    option_index INT NOT NULL CHECK (option_index >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (consultation_id, user_id)
);

CREATE TABLE IF NOT EXISTS official_news (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    municipality_id UUID NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(250) NOT NULL,
    body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 10000),
    is_certified BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS emergency_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    medical_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS interventions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sos_id UUID NOT NULL UNIQUE REFERENCES sos_alerts(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    patient_medical_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'ACCEPTED',
    route_coordinates JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS neighbor_responders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    is_certified_first_aider BOOLEAN NOT NULL DEFAULT FALSE,
    radius_coverage_m INT NOT NULL DEFAULT 800 CHECK (radius_coverage_m > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS neighbor_responders_certified_idx
    ON neighbor_responders (radius_coverage_m) WHERE is_certified_first_aider = TRUE;
