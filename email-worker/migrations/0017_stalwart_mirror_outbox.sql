CREATE TABLE stalwart_mirror_outbox (
  idempotency_key TEXT PRIMARY KEY,
  message_id TEXT NOT NULL UNIQUE,
  raw_object_key TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'leased',
      'enqueued',
      'delivered',
      'dead_letter',
      'terminal'
    )),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TEXT NOT NULL,
  lease_token TEXT,
  lease_expires_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  enqueued_at TEXT,
  delivered_at TEXT,
  dead_lettered_at TEXT,
  terminal_at TEXT
);

CREATE INDEX stalwart_mirror_outbox_dispatch
  ON stalwart_mirror_outbox(status, next_attempt_at ASC, lease_expires_at ASC);

CREATE INDEX stalwart_mirror_outbox_raw_object
  ON stalwart_mirror_outbox(raw_object_key, status);
