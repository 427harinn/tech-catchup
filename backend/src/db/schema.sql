PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'manual',
  published_at TEXT,
  fetched_at TEXT,
  raw_excerpt TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'queued', 'summarized', 'failed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL UNIQUE,
  summary_short TEXT,
  tech_points TEXT,
  relevance TEXT,
  next_action TEXT,
  tags TEXT,
  priority INTEGER CHECK (priority BETWEEN 1 AND 5),
  generated_at TEXT NOT NULL,
  FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL,
  reaction TEXT NOT NULL CHECK (reaction IN ('interested', 'not_interested', 'read_later', 'try_later')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notion_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('read_later', 'try_later')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'synced', 'failed')),
  notion_page_id TEXT,
  created_at TEXT NOT NULL,
  synced_at TEXT,
  FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS interest_weights (
  tag TEXT PRIMARY KEY,
  weight INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
CREATE INDEX IF NOT EXISTS idx_articles_created_at ON articles(created_at);
CREATE INDEX IF NOT EXISTS idx_reactions_article_id ON reactions(article_id);
CREATE INDEX IF NOT EXISTS idx_notion_queue_article_id ON notion_queue(article_id);
CREATE INDEX IF NOT EXISTS idx_notion_queue_status ON notion_queue(status);

