-- Add threaded replies and likes support for comments.
-- Run once on an existing production database.

ALTER TABLE article_comments
  ADD COLUMN parent_id INT UNSIGNED NULL AFTER page_url,
  ADD COLUMN likes_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER message;

CREATE INDEX idx_parent_created ON article_comments (parent_id, created_at);
