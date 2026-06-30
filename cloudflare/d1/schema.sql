-- D1 schema for Cloudflare Worker API
-- Apply with: wrangler d1 execute <DB_NAME> --file=cloudflare/d1/schema.sql

-- Texte complet des chunks indexes pour le RAG vectoriel (cloudflare/ragPipeline.js).
-- Le vector store (Vectorize ou autre demain) ne stocke que des vecteurs +
-- metadata compacte ; le texte complet reste toujours ici, quel que soit le
-- backend vectoriel choisi.
CREATE TABLE IF NOT EXISTS rag_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  project_id TEXT,
  document_name TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  locator TEXT,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rag_chunks_document ON rag_chunks (document_id);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_project ON rag_chunks (project_id);

CREATE TABLE IF NOT EXISTS consent_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  consent_id TEXT NOT NULL,
  consent_given TEXT NOT NULL DEFAULT 'no',
  analytics INTEGER NOT NULL DEFAULT 0,
  marketing INTEGER NOT NULL DEFAULT 0,
  language TEXT,
  theme TEXT,
  viewport_width INTEGER,
  viewport_height INTEGER,
  device_pixel_ratio REAL,
  screen_width INTEGER,
  screen_height INTEGER,
  navigator_language TEXT,
  ua_data TEXT,
  in_app_browser INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  ip_address TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  page_url TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_consent_id ON consent_logs (consent_id);

CREATE TABLE IF NOT EXISTS article_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_slug TEXT NOT NULL,
  page_url TEXT NOT NULL,
  parent_id INTEGER,
  author_name TEXT NOT NULL,
  author_email TEXT NOT NULL,
  message TEXT NOT NULL,
  likes_count INTEGER NOT NULL DEFAULT 0,
  reactions_thumbsup INTEGER NOT NULL DEFAULT 0,
  reactions_purpleheart INTEGER NOT NULL DEFAULT 0,
  reactions_wink INTEGER NOT NULL DEFAULT 0,
  reactions_sweatsmile INTEGER NOT NULL DEFAULT 0,
  reactions_nerd INTEGER NOT NULL DEFAULT 0,
  reactions_idea INTEGER NOT NULL DEFAULT 0,
  reactions_robot INTEGER NOT NULL DEFAULT 0,
  reactions_mobile INTEGER NOT NULL DEFAULT 0,
  reactions_laptop INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'approved',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  ip_address TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  FOREIGN KEY(parent_id) REFERENCES article_comments(id)
);

CREATE INDEX IF NOT EXISTS idx_article_slug ON article_comments (article_slug);
CREATE INDEX IF NOT EXISTS idx_status_created ON article_comments (status, created_at);
CREATE INDEX IF NOT EXISTS idx_parent_created ON article_comments (parent_id, created_at);

CREATE TABLE IF NOT EXISTS contact_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  contact_consent TEXT NOT NULL DEFAULT 'no',
  ip_address TEXT,
  user_agent TEXT,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_assistant_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  event_type TEXT NOT NULL,
  event_value TEXT,
  language TEXT,
  page_url TEXT,
  meta TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  ip_address TEXT NOT NULL,
  user_agent TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_assistant_session_created ON ai_assistant_events (session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_assistant_event_created ON ai_assistant_events (event_type, created_at);

CREATE TABLE IF NOT EXISTS tavily_search_dedupe (
  cache_key TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  result_json TEXT
);

-- Onglet Conversations (admin) : pas de duplication de ai_assistant_events,
-- ces 3 tables couvrent uniquement les fonctionnalites reellement nouvelles
-- (tags, feedback interne admin, historique d'export). Demarrent vides.
CREATE TABLE IF NOT EXISTS conversation_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversation_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  rating INTEGER,
  note TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversation_exports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  format TEXT NOT NULL,
  requested_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_conv_tags_session ON conversation_tags (session_id);
CREATE INDEX IF NOT EXISTS idx_conv_feedback_session ON conversation_feedback (session_id);
CREATE INDEX IF NOT EXISTS idx_conv_exports_session ON conversation_exports (session_id);

-- Onglet Sources & RAG (admin) : rag_chunks reste la granularite d'indexation
-- (texte des passages). rag_sources est la granularite documentaire (un
-- document = une source), alimentee de facon additive par
-- indexDocumentChunks() (cloudflare/ragPipeline.js) a chaque indexation.
-- Le front ne doit jamais construire de source a partir de donnees inventees :
-- si une ligne n'existe pas ici, l'agregateur reconstruit une source
-- "partielle" depuis rag_chunks (GROUP BY document_id), jamais une source
-- fictive.
CREATE TABLE IF NOT EXISTS rag_sources (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  title TEXT NOT NULL,
  source_type TEXT,
  filename TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  checksum TEXT,
  status TEXT NOT NULL DEFAULT 'indexed',
  chunks_count INTEGER NOT NULL DEFAULT 0,
  indexed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_rag_sources_project ON rag_sources (project_id);
CREATE INDEX IF NOT EXISTS idx_rag_sources_status ON rag_sources (status);

-- Onglet Documents (admin) : table transverse, distincte de rag_sources.
-- rag_sources reste specialisee pour l'onglet Sources & RAG (statut
-- d'indexation vectorielle). documents est la vue documentaire generale
-- (upload, parsing, utilisation, export), alimentee de facon additive a
-- chaque etape reelle du pipeline (cloudflare/ragPipeline.js indexation,
-- evenements document_* journalises par le client cloudflare/worker-openrouter.js).
-- rag_source_id reference rag_sources.id quand le document est indexe dans le
-- RAG vectoriel ; NULL si le document existe mais n'a pas (encore) ete indexe.
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  rag_source_id TEXT,
  project_id TEXT,
  title TEXT NOT NULL,
  filename TEXT,
  file_path TEXT,
  mime_type TEXT,
  source_type TEXT,
  size_bytes INTEGER,
  pages_count INTEGER,
  chunks_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'uploaded',
  indexed_at TEXT,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT,
  used_count INTEGER NOT NULL DEFAULT 0,
  average_relevance REAL,
  checksum TEXT,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_documents_project ON documents (project_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents (status);
CREATE INDEX IF NOT EXISTS idx_documents_rag_source ON documents (rag_source_id);

-- Onglet Exports (admin) : table transverse, alimentee de facon additive par
-- chaque export reellement genere par le Worker API (cloudflare/worker-api.js
-- handleAdminExport / handleAdminConversationExport / handleAdminDocumentExport).
-- N'enregistre que des exports reellement executes — jamais une ligne
-- fabriquee pour remplir l'UI. conversation_exports (lot Conversations)
-- reste la table specialisee pour le detail conversation ; `exports` est la
-- vue consolidee transverse pour l'onglet Exports.
CREATE TABLE IF NOT EXISTS exports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  export_type TEXT NOT NULL,
  export_format TEXT NOT NULL,
  source_module TEXT,
  project_id TEXT,
  conversation_id TEXT,
  filename TEXT,
  storage_path TEXT,
  size_bytes INTEGER,
  generated_by TEXT,
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  duration_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'completed',
  error_message TEXT,
  checksum TEXT,
  download_count INTEGER NOT NULL DEFAULT 0,
  downloaded_last_at TEXT,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_exports_type ON exports (export_type);
CREATE INDEX IF NOT EXISTS idx_exports_status ON exports (status);
CREATE INDEX IF NOT EXISTS idx_exports_generated_at ON exports (generated_at);

-- Knowledge Orchestrator (Digital Blue Skye Studio V3.2+) : couche transverse
-- pour sources documentaires natives (Obsidian, RAG, Tavily cache, memoire
-- projet, futurs connecteurs). Additif uniquement : ne remplace pas rag_*.
CREATE TABLE IF NOT EXISTS knowledge_sources (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  config_json TEXT,
  last_sync_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_knowledge_sources_type ON knowledge_sources (type);
CREATE INDEX IF NOT EXISTS idx_knowledge_sources_status ON knowledge_sources (status);

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  path TEXT,
  type TEXT NOT NULL,
  checksum TEXT,
  version_hash TEXT,
  status TEXT NOT NULL DEFAULT 'indexed',
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_source ON knowledge_documents (source_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_external ON knowledge_documents (external_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_checksum ON knowledge_documents (checksum);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_status ON knowledge_documents (status);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  hash TEXT,
  token_count INTEGER,
  locator TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document ON knowledge_chunks (document_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_source ON knowledge_chunks (source_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_hash ON knowledge_chunks (hash);

CREATE TABLE IF NOT EXISTS knowledge_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,
  from_document_id TEXT NOT NULL,
  to_document_id TEXT NOT NULL,
  link_type TEXT NOT NULL DEFAULT 'wikilink',
  anchor_text TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_knowledge_links_from ON knowledge_links (from_document_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_links_to ON knowledge_links (to_document_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_links_source ON knowledge_links (source_id);

CREATE TABLE IF NOT EXISTS knowledge_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_knowledge_tags_tag ON knowledge_tags (tag);
CREATE INDEX IF NOT EXISTS idx_knowledge_tags_document ON knowledge_tags (document_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_tags_source ON knowledge_tags (source_id);

CREATE TABLE IF NOT EXISTS knowledge_sync_state (
  source_id TEXT PRIMARY KEY,
  cursor_json TEXT,
  last_full_sync_at TEXT,
  last_incremental_sync_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS knowledge_conflicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query_hash TEXT,
  document_a TEXT,
  document_b TEXT,
  conflict_type TEXT NOT NULL,
  detail_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_knowledge_conflicts_query ON knowledge_conflicts (query_hash);
CREATE INDEX IF NOT EXISTS idx_knowledge_conflicts_created ON knowledge_conflicts (created_at);

CREATE TABLE IF NOT EXISTS knowledge_queries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  query TEXT NOT NULL,
  selected_sources_json TEXT,
  latency_ms INTEGER,
  confidence REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_knowledge_queries_session ON knowledge_queries (session_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_queries_created ON knowledge_queries (created_at);
