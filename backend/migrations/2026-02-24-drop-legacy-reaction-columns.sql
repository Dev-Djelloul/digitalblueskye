-- Keep only the selected positive/neutral reaction set.
-- Run once on production after backup.

START TRANSACTION;

-- Preserve legacy counts before dropping old columns.
UPDATE article_comments
SET
  reactions_thumbsup = GREATEST(reactions_thumbsup, COALESCE(reactions_like, 0), COALESCE(likes_count, 0)),
  reactions_wink = GREATEST(reactions_wink, COALESCE(reactions_smile, 0)),
  reactions_purpleheart = GREATEST(reactions_purpleheart, COALESCE(reactions_blueheart, 0)),
  reactions_idea = GREATEST(reactions_idea, COALESCE(reactions_clap, 0));

ALTER TABLE article_comments
  DROP COLUMN reactions_like,
  DROP COLUMN reactions_smile,
  DROP COLUMN reactions_dislike,
  DROP COLUMN reactions_clap,
  DROP COLUMN reactions_blueheart;

COMMIT;
