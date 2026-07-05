-- Migration D1 ponctuelle pour etendre user_preferences au-dela de tone/theme.
-- A executer une seule fois sur une base existante :
--   wrangler d1 execute digitalblueskye --file=cloudflare/d1/user-preferences-v2.sql -c cloudflare/wrangler.api.toml
--
-- Le Worker applique aussi ces colonnes en best-effort dans ensureSchema()
-- pour proteger les deploiements ou cette migration n'a pas encore ete lancee.

ALTER TABLE user_preferences ADD COLUMN project_style TEXT DEFAULT 'digital_project_manager';
ALTER TABLE user_preferences ADD COLUMN favorite_format TEXT DEFAULT 'action_plan';
ALTER TABLE user_preferences ADD COLUMN detail_level TEXT DEFAULT 'balanced';
ALTER TABLE user_preferences ADD COLUMN preferred_language TEXT DEFAULT 'fr';
ALTER TABLE user_preferences ADD COLUMN companion TEXT DEFAULT 'skye';
ALTER TABLE user_preferences ADD COLUMN ai_voice TEXT DEFAULT 'auto';
ALTER TABLE user_preferences ADD COLUMN voice_auto INTEGER DEFAULT 1;
ALTER TABLE user_preferences ADD COLUMN read_responses_aloud INTEGER DEFAULT 0;
ALTER TABLE user_preferences ADD COLUMN voice_language TEXT DEFAULT 'auto';
ALTER TABLE user_preferences ADD COLUMN show_microphone INTEGER DEFAULT 1;
ALTER TABLE user_preferences ADD COLUMN chat_density TEXT DEFAULT 'comfortable';
ALTER TABLE user_preferences ADD COLUMN show_suggestions INTEGER DEFAULT 1;
ALTER TABLE user_preferences ADD COLUMN show_sources_when_available INTEGER DEFAULT 1;
