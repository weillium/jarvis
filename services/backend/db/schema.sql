PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS topics(
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE,
  description TEXT,
  refs TEXT
);
CREATE TABLE IF NOT EXISTS entities(
  id INTEGER PRIMARY KEY,
  surface TEXT,
  aliases TEXT,
  type TEXT,
  summary TEXT,
  tags TEXT,
  refs TEXT
);
CREATE VIRTUAL TABLE IF NOT EXISTS entities_fts USING fts5(surface, summary, content='entities', content_rowid='id');
CREATE TABLE IF NOT EXISTS visuals(
  id INTEGER PRIMARY KEY,
  entity_id INTEGER,
  visual_type TEXT,
  payload TEXT,
  caption TEXT
);
CREATE TABLE IF NOT EXISTS cards(
  id INTEGER PRIMARY KEY,
  template_key TEXT,
  payload TEXT,
  max_chars INTEGER
);
CREATE TABLE IF NOT EXISTS policies(
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
