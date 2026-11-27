CREATE TABLE IF NOT EXISTS editorial_drafts (
  draft_key TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  fields TEXT NOT NULL,
  title TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS editorial_images (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  media_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS editorial_image_parts (
  id TEXT NOT NULL REFERENCES editorial_images(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  bytes BLOB NOT NULL,
  PRIMARY KEY (id, ordinal)
);
