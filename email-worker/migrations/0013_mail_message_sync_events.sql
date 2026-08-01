CREATE TABLE message_sync_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
  created_at TEXT NOT NULL
);

CREATE INDEX message_sync_events_mailbox_sequence
  ON message_sync_events(mailbox_id, sequence);