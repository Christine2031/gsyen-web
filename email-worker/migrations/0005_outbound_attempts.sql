ALTER TABLE messages ADD COLUMN send_attempt_count INTEGER NOT NULL DEFAULT 0
  CHECK (send_attempt_count >= 0);
ALTER TABLE messages ADD COLUMN last_attempt_at TEXT;

CREATE INDEX messages_outbound_delivery
  ON messages(direction, status, last_attempt_at);
