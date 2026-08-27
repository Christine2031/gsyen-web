ALTER TABLE stalwart_mirror_outbox
  ADD COLUMN delivery_cycles INTEGER NOT NULL DEFAULT 0
    CHECK (delivery_cycles >= 0);

ALTER TABLE stalwart_mirror_dead_letters
  ADD COLUMN requeue_attempts INTEGER NOT NULL DEFAULT 0
    CHECK (requeue_attempts >= 0);

CREATE TABLE stalwart_mirror_terminal_events (
  id TEXT PRIMARY KEY,
  phase TEXT NOT NULL,
  queue_message_id TEXT NOT NULL,
  message_id TEXT,
  delivery_id TEXT,
  reason TEXT NOT NULL,
  outbox_status TEXT,
  observed_at TEXT NOT NULL
);

CREATE INDEX stalwart_mirror_terminal_events_message
  ON stalwart_mirror_terminal_events(message_id, observed_at DESC);

CREATE INDEX stalwart_mirror_terminal_events_reason
  ON stalwart_mirror_terminal_events(reason, observed_at DESC);
