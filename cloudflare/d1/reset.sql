-- Full data reset for D1 (keeps schema)
-- Apply with: wrangler d1 execute <DB_NAME> --file=cloudflare/d1/reset.sql

DELETE FROM ai_assistant_events;
DELETE FROM article_comments;
DELETE FROM consent_logs;
DELETE FROM contact_messages;

DELETE FROM sqlite_sequence WHERE name IN (
  'ai_assistant_events',
  'article_comments',
  'consent_logs',
  'contact_messages'
);
