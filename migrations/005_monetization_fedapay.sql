CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fedapay_tx_id VARCHAR(100) NOT NULL UNIQUE,
    amount INT NOT NULL CHECK (amount > 0),
    currency CHAR(3) NOT NULL DEFAULT 'XOF',
    status VARCHAR(10) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'APPROVED', 'FAILED', 'CANCELED')),
    payment_type VARCHAR(20) NOT NULL
        CHECK (payment_type IN ('ALLIANCE_PRO', 'SPONSORED_PIN', 'TICKET')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_created
    ON transactions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_type VARCHAR(50) NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'EXPIRED')),
    starts_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_user_plan_unique_idx
    ON subscriptions (user_id, plan_type);

CREATE TABLE IF NOT EXISTS sponsored_pins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    location GEOGRAPHY(Point, 4326) NOT NULL,
    icon_url TEXT,
    starts_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_sponsored_pins_location
    ON sponsored_pins USING GIST (location);

CREATE INDEX IF NOT EXISTS idx_sponsored_pins_active_expiry
    ON sponsored_pins (expires_at) WHERE is_active = TRUE;

ALTER TABLE users ADD COLUMN IF NOT EXISTS badge VARCHAR(100);
