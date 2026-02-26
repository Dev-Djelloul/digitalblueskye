CREATE TABLE IF NOT EXISTS consent_logs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  consent_id VARCHAR(64) NOT NULL,
  consent_given VARCHAR(3) NOT NULL DEFAULT 'no',
  analytics TINYINT(1) NOT NULL DEFAULT 0,
  marketing TINYINT(1) NOT NULL DEFAULT 0,
  language VARCHAR(8) DEFAULT NULL,
  theme VARCHAR(16) DEFAULT NULL,
  viewport_width SMALLINT UNSIGNED DEFAULT NULL,
  viewport_height SMALLINT UNSIGNED DEFAULT NULL,
  device_pixel_ratio DECIMAL(4,2) DEFAULT NULL,
  screen_width SMALLINT UNSIGNED DEFAULT NULL,
  screen_height SMALLINT UNSIGNED DEFAULT NULL,
  navigator_language VARCHAR(16) DEFAULT NULL,
  ua_data TEXT DEFAULT NULL,
  in_app_browser TINYINT(1) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(45) NOT NULL,
  user_agent VARCHAR(255) NOT NULL,
  page_url VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_consent_id ON consent_logs (consent_id);

CREATE TABLE IF NOT EXISTS article_comments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  article_slug VARCHAR(160) NOT NULL,
  page_url VARCHAR(255) NOT NULL,
  parent_id INT UNSIGNED NULL,
  author_name VARCHAR(80) NOT NULL,
  author_email VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  likes_count INT UNSIGNED NOT NULL DEFAULT 0,
  reactions_thumbsup INT UNSIGNED NOT NULL DEFAULT 0,
  reactions_purpleheart INT UNSIGNED NOT NULL DEFAULT 0,
  reactions_wink INT UNSIGNED NOT NULL DEFAULT 0,
  reactions_sweatsmile INT UNSIGNED NOT NULL DEFAULT 0,
  reactions_nerd INT UNSIGNED NOT NULL DEFAULT 0,
  reactions_idea INT UNSIGNED NOT NULL DEFAULT 0,
  reactions_robot INT UNSIGNED NOT NULL DEFAULT 0,
  reactions_mobile INT UNSIGNED NOT NULL DEFAULT 0,
  reactions_laptop INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('approved','pending') NOT NULL DEFAULT 'approved',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(45) NOT NULL,
  user_agent VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_article_slug ON article_comments (article_slug);
CREATE INDEX idx_status_created ON article_comments (status, created_at);
CREATE INDEX idx_parent_created ON article_comments (parent_id, created_at);

CREATE TABLE IF NOT EXISTS ai_assistant_events (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(64) DEFAULT NULL,
  event_type VARCHAR(64) NOT NULL,
  event_value VARCHAR(500) DEFAULT NULL,
  language VARCHAR(8) DEFAULT NULL,
  page_url VARCHAR(255) DEFAULT NULL,
  meta JSON DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(45) NOT NULL,
  user_agent VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_assistant_session_created ON ai_assistant_events (session_id, created_at);
CREATE INDEX idx_assistant_event_created ON ai_assistant_events (event_type, created_at);
