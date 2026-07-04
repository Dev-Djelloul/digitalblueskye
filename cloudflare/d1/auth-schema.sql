-- Schema D1 pour l'authentification serveur OAuth (Digital Blue Skye).
-- Applique via :
--   wrangler d1 execute digitalblueskye --file=cloudflare/d1/auth-schema.sql -c cloudflare/wrangler.api.toml
--
-- Le Worker (cloudflare/auth.js -> ensureSchema) cree aussi ces tables de
-- maniere idempotente au premier appel, mais appliquer ce fichier explicitement
-- est recommande pour maitriser le schema en production.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS user_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  email TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(provider, provider_user_id)
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  user_agent TEXT,
  ip_hash TEXT
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY,
  tone TEXT DEFAULT 'standard',
  theme TEXT DEFAULT 'system',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  session_id TEXT,
  ip_hash TEXT,
  model TEXT,
  prompt_chars INTEGER,
  response_chars INTEGER,
  created_at TEXT NOT NULL,
  status TEXT,
  error_code TEXT
);

CREATE TABLE IF NOT EXISTS ai_rate_limits (
  rate_key TEXT PRIMARY KEY,
  window_start TEXT NOT NULL,
  count INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_hash ON user_sessions(session_hash);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_identities_user ON user_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON ai_usage_events(user_id);
