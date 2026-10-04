ALTER TABLE users
    ALTER COLUMN phone_number DROP NOT NULL;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email VARCHAR(255),
    ADD COLUMN IF NOT EXISTS google_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(100);

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
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
