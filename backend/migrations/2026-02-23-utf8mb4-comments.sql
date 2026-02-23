-- Force UTF-8 full unicode support (emoji) on existing tables.
-- Run once on the production database.

ALTER TABLE consent_logs
  CONVERT TO CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

ALTER TABLE article_comments
  CONVERT TO CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
