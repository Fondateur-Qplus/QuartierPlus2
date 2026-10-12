CREATE TABLE IF NOT EXISTS posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope VARCHAR(20) NOT NULL CHECK (
        scope IN ('neighborhood', 'region', 'country', 'international')
    ),
    country_code VARCHAR(3) REFERENCES country_config(code),
    location GEOMETRY(Point, 4326),
    caption VARCHAR(1000) NOT NULL DEFAULT '',
    media_public_id VARCHAR(255) NOT NULL UNIQUE,
    media_url TEXT NOT NULL,
    media_type VARCHAR(10) NOT NULL CHECK (media_type IN ('image', 'video')),
    media_format VARCHAR(10) NOT NULL CHECK (
        media_format IN ('jpg', 'jpeg', 'png', 'webp', 'mp4')
    ),
    media_bytes BIGINT NOT NULL CHECK (media_bytes > 0),
    media_duration_seconds NUMERIC(8, 2),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (
        status IN ('ACTIVE', 'HIDDEN', 'DELETED')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (
        (scope NOT IN ('neighborhood', 'region')) OR location IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_posts_created_active
    ON posts (created_at DESC)
    WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_posts_author_created
    ON posts (author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_country
    ON posts (country_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_location
    ON posts USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_reports_pending_post
    ON reports (target_id, status)
    WHERE target_type = 'POST';
