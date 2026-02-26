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
