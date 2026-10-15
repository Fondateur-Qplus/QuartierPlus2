ALTER TABLE sos_alerts
    ADD COLUMN IF NOT EXISTS emergency_audio_url TEXT;
