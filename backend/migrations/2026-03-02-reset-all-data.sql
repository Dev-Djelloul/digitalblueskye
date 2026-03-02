-- Reset all collected data (keep schema, clear rows)
-- Run only when you explicitly want a full reset.

SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE ai_assistant_events;
TRUNCATE TABLE article_comments;
TRUNCATE TABLE consent_logs;
TRUNCATE TABLE contact_messages;

SET FOREIGN_KEY_CHECKS = 1;
