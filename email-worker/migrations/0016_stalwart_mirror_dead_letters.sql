CREATE TABLE stalwart_mirror_dead_letters (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'requeueing', 'requeued')),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  requeued_at TEXT
);

CREATE INDEX stalwart_mirror_dead_letters_status_seen
  ON stalwart_mirror_dead_letters(status, last_seen_at ASC);
