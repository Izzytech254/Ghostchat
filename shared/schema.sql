-- ============================================================
-- GhostChat Local Schema (SQLite – encrypted on device)
-- ============================================================
-- This schema runs on the USER'S DEVICE only via SQLite.
-- Nothing here is ever sent to a server.
-- The entire DB file is encrypted with AES-256-GCM using a
-- PBKDF2-derived key from the user's passphrase (see storage.ts).
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ── Messages (ephemeral, auto-deleted) ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS messages (
    id              TEXT PRIMARY KEY,
    chat_id         TEXT NOT NULL,
    content         BLOB NOT NULL,      -- Encrypted ciphertext (AES-256-GCM)
    sender_id       TEXT NOT NULL,      -- Anonymous sender ID
    created_at      INTEGER NOT NULL,   -- Unix ms
    expires_at      INTEGER NOT NULL,   -- Unix ms (triggers deletion)
    deletion_type   TEXT NOT NULL CHECK (deletion_type IN ('timed','read_once','burn_on_read')),
    is_read         INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_msg_expires ON messages (expires_at);
CREATE INDEX IF NOT EXISTS idx_msg_chat    ON messages (chat_id, created_at);

-- ── Chats ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chats (
    id                    TEXT PRIMARY KEY,
    type                  TEXT NOT NULL CHECK (type IN ('private','group','ephemeral')),
    name                  TEXT,
    participant_ids       TEXT NOT NULL,    -- JSON array of anonymous IDs
    default_ttl_ms        INTEGER NOT NULL DEFAULT 86400000,  -- 24 h
    created_at            INTEGER NOT NULL,
    expires_at            INTEGER,          -- NULL = no chat expiry
    last_message_at       INTEGER,
    last_message_preview  TEXT
);

-- ── Contacts ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contacts (
    id          TEXT PRIMARY KEY,      -- Anonymous user ID
    username    TEXT NOT NULL,
    public_key  TEXT NOT NULL,         -- base64url identity key
    added_at    INTEGER NOT NULL,
    last_seen   INTEGER
);

-- ── Encryption keys (NEVER leave device) ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS key_store (
    key_id     TEXT PRIMARY KEY,
    key_type   TEXT NOT NULL CHECK (key_type IN ('identity','signed_pre_key','one_time_pre_key','session','device')),
    key_data   BLOB NOT NULL,          -- Encrypted key material
    peer_id    TEXT,                   -- NULL for own keys
    created_at INTEGER NOT NULL,
    expires_at INTEGER                 -- NULL for permanent keys
);

-- ── Meta / app settings ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL               -- JSON encoded
);

INSERT OR IGNORE INTO meta (key, value) VALUES
    ('schema_version',   '"1"'),
    ('screenshot_notify', 'true'),
    ('default_ttl_ms',   '86400000'),
    ('decoy_enabled',    'false');

-- ── Audit log (no content recorded) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    event      TEXT NOT NULL,          -- e.g. 'message_deleted', 'screenshot_detected'
    ref_id     TEXT,                   -- anonymised reference (e.g. message_id hash)
    ts         INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log (ts);
