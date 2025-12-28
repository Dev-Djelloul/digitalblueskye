CREATE TABLE IF NOT EXISTS consent_logs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  consent_id VARCHAR(64) NOT NULL,
  analytics TINYINT(1) NOT NULL DEFAULT 0,
  marketing TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(45) NOT NULL,
  user_agent VARCHAR(255) NOT NULL,
  page_url VARCHAR(255) NOT NULL
);

CREATE INDEX idx_consent_id ON consent_logs (consent_id);

CREATE TABLE IF NOT EXISTS article_comments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  article_slug VARCHAR(160) NOT NULL,
  page_url VARCHAR(255) NOT NULL,
  author_name VARCHAR(80) NOT NULL,
  author_email VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  status ENUM('approved','pending') NOT NULL DEFAULT 'approved',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(45) NOT NULL,
  user_agent VARCHAR(255) NOT NULL
);

CREATE INDEX idx_article_slug ON article_comments (article_slug);
CREATE INDEX idx_status_created ON article_comments (status, created_at);
