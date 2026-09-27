-- ============================================================
-- Migration: Create paused_bots table
-- Run this once in your Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS paused_bots (
    phone_number  TEXT        PRIMARY KEY,
    paused_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at    TIMESTAMPTZ NOT NULL
);

-- Optional: auto-delete expired rows every hour (requires pg_cron extension)
-- SELECT cron.schedule('cleanup-paused-bots', '0 * * * *',
--   $$DELETE FROM paused_bots WHERE expires_at < NOW()$$);
