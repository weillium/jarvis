CREATE TABLE IF NOT EXISTS embeddings(
  id INTEGER PRIMARY KEY,
  text_chunk TEXT NOT NULL,
  embedding BLOB NOT NULL,
  meta TEXT
);
-- sqlite-vec or sqlite-vss extension expected to be loaded at runtime
