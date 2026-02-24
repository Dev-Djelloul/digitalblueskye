-- Positive/neutral reactions palette (comments + article UI).
-- Run once on an existing production database.

ALTER TABLE article_comments
  ADD COLUMN reactions_thumbsup INT UNSIGNED NOT NULL DEFAULT 0 AFTER reactions_blueheart,
  ADD COLUMN reactions_purpleheart INT UNSIGNED NOT NULL DEFAULT 0 AFTER reactions_thumbsup,
  ADD COLUMN reactions_wink INT UNSIGNED NOT NULL DEFAULT 0 AFTER reactions_purpleheart,
  ADD COLUMN reactions_sweatsmile INT UNSIGNED NOT NULL DEFAULT 0 AFTER reactions_wink,
  ADD COLUMN reactions_nerd INT UNSIGNED NOT NULL DEFAULT 0 AFTER reactions_sweatsmile,
  ADD COLUMN reactions_idea INT UNSIGNED NOT NULL DEFAULT 0 AFTER reactions_nerd,
  ADD COLUMN reactions_robot INT UNSIGNED NOT NULL DEFAULT 0 AFTER reactions_idea,
  ADD COLUMN reactions_mobile INT UNSIGNED NOT NULL DEFAULT 0 AFTER reactions_robot,
  ADD COLUMN reactions_laptop INT UNSIGNED NOT NULL DEFAULT 0 AFTER reactions_mobile;

-- Preserve existing likes into new thumbsup bucket.
UPDATE article_comments
SET reactions_thumbsup = likes_count
WHERE reactions_thumbsup = 0 AND likes_count > 0;
