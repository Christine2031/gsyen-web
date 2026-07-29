ALTER TABLE messages ADD COLUMN envelope_from_address TEXT;
ALTER TABLE messages ADD COLUMN is_read INTEGER NOT NULL DEFAULT 0
  CHECK (is_read IN (0, 1));
ALTER TABLE messages ADD COLUMN is_starred INTEGER NOT NULL DEFAULT 0
  CHECK (is_starred IN (0, 1));
ALTER TABLE messages ADD COLUMN is_important INTEGER NOT NULL DEFAULT 0
  CHECK (is_important IN (0, 1));
ALTER TABLE messages ADD COLUMN archived_at TEXT;
ALTER TABLE messages ADD COLUMN snoozed_until TEXT;
ALTER TABLE messages ADD COLUMN spam_at TEXT;
ALTER TABLE messages ADD COLUMN trashed_at TEXT;

CREATE INDEX messages_inbox_state
  ON messages(mailbox_id, direction, archived_at, spam_at, trashed_at, created_at DESC);

CREATE INDEX messages_starred
  ON messages(mailbox_id, is_starred, created_at DESC)
  WHERE is_starred = 1;

CREATE INDEX messages_snoozed
  ON messages(mailbox_id, snoozed_until, created_at DESC)
  WHERE snoozed_until IS NOT NULL;

CREATE INDEX messages_trashed
  ON messages(mailbox_id, trashed_at, created_at DESC)
  WHERE trashed_at IS NOT NULL;
