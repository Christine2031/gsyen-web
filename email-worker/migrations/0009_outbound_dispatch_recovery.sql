ALTER TABLE messages ADD COLUMN queue_dispatched_at TEXT;

CREATE INDEX messages_outbound_dispatch_recovery
  ON messages(status, queue_dispatched_at, created_at)
  WHERE direction = 'outbound' AND trashed_at IS NULL;
