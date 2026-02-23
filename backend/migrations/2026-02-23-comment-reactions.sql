-- Add multi-reaction counters for comments.
-- Run once on an existing production database.

ALTER TABLE article_comments
  ADD COLUMN reactions_like INT UNSIGNED NOT NULL DEFAULT 0 AFTER likes_count,
  ADD COLUMN reactions_smile INT UNSIGNED NOT NULL DEFAULT 0 AFTER reactions_like,
  ADD COLUMN reactions_dislike INT UNSIGNED NOT NULL DEFAULT 0 AFTER reactions_smile,
  ADD COLUMN reactions_clap INT UNSIGNED NOT NULL DEFAULT 0 AFTER reactions_dislike,
  ADD COLUMN reactions_blueheart INT UNSIGNED NOT NULL DEFAULT 0 AFTER reactions_clap;

-- Keep compatibility for existing like counter.
UPDATE article_comments
SET reactions_like = likes_count
WHERE reactions_like = 0 AND likes_count > 0;
