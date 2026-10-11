ALTER TABLE users
    ALTER COLUMN phone_number DROP NOT NULL;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email VARCHAR(255),
    ADD COLUMN IF NOT EXISTS google_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(100),
    ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS last_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS phone_e164 VARCHAR(16),
    ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

ALTER TABLE country_config
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx
    ON users (email)
    WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_unique_idx
    ON users (google_id)
    WHERE google_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS otp_verifications (
    phone_number VARCHAR(20) PRIMARY KEY,
    code_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    registration_data JSONB
);

ALTER TABLE otp_verifications
    ADD COLUMN IF NOT EXISTS registration_data JSONB,
    ADD COLUMN IF NOT EXISTS channel VARCHAR(10) NOT NULL DEFAULT 'sms';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'otp_verifications_channel_check'
          AND conrelid = 'otp_verifications'::regclass
    ) THEN
        ALTER TABLE otp_verifications
            ADD CONSTRAINT otp_verifications_channel_check
            CHECK (channel IN ('sms', 'email'));
    END IF;
END
$$;

UPDATE users
SET phone_e164 = phone_number
WHERE phone_e164 IS NULL AND phone_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_phone_e164_unique_idx
    ON users (phone_e164)
    WHERE phone_e164 IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique_idx
    ON users (LOWER(email))
    WHERE email IS NOT NULL;
