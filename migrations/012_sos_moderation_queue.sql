CREATE TABLE IF NOT EXISTS sos_moderation_queue (
        sos_id UUID PRIMARY KEY REFERENCES sos_alerts(id) ON DELETE CASCADE,
            status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING', 'REVIEWED', 'DISMISSED')),
                        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
                        );