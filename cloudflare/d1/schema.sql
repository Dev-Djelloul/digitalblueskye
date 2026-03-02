-- D1 schema for Cloudflare Worker API
-- Apply with: wrangler d1 execute <DB_NAME> --file=cloudflare/d1/schema.sql

CREATE TABLE IF NOT EXISTS consent_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  consent_id TEXT NOT NULL,
  consent_given TEXT NOT NULL DEFAULT 'no',
  analytics INTEGER NOT NULL DEFAULT 0,
  marketing INTEGER NOT NULL DEFAULT 0,
  language TEXT,
  theme TEXT,
  viewport_width INTEGER,
  viewport_height INTEGER,
  device_pixel_ratio REAL,
  screen_width INTEGER,
  screen_height INTEGER,
  navigator_language TEXT,
  ua_data TEXT,
  in_app_browser INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  ip_address TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  page_url TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_consent_id ON consent_logs (consent_id);

CREATE TABLE IF NOT EXISTS article_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_slug TEXT NOT NULL,
  page_url TEXT NOT NULL,
  parent_id INTEGER,
  author_name TEXT NOT NULL,
  author_email TEXT NOT NULL,
  message TEXT NOT NULL,
  likes_count INTEGER NOT NULL DEFAULT 0,
  reactions_thumbsup INTEGER NOT NULL DEFAULT 0,
  reactions_purpleheart INTEGER NOT NULL DEFAULT 0,
  reactions_wink INTEGER NOT NULL DEFAULT 0,
  reactions_sweatsmile INTEGER NOT NULL DEFAULT 0,
  reactions_nerd INTEGER NOT NULL DEFAULT 0,
  reactions_idea INTEGER NOT NULL DEFAULT 0,
  reactions_robot INTEGER NOT NULL DEFAULT 0,
  reactions_mobile INTEGER NOT NULL DEFAULT 0,
  reactions_laptop INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'approved',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  ip_address TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  FOREIGN KEY(parent_id) REFERENCES article_comments(id)
);

CREATE INDEX IF NOT EXISTS idx_article_slug ON article_comments (article_slug);
CREATE INDEX IF NOT EXISTS idx_status_created ON article_comments (status, created_at);
CREATE INDEX IF NOT EXISTS idx_parent_created ON article_comments (parent_id, created_at);

CREATE TABLE IF NOT EXISTS contact_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  contact_consent TEXT NOT NULL DEFAULT 'no',
  ip_address TEXT,
  user_agent TEXT,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_assistant_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  event_type TEXT NOT NULL,
  event_value TEXT,
  language TEXT,
  page_url TEXT,
  meta TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  ip_address TEXT NOT NULL,
  user_agent TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_assistant_session_created ON ai_assistant_events (session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_assistant_event_created ON ai_assistant_events (event_type, created_at);
