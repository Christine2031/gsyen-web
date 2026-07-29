CREATE TABLE mailbox_addresses (
  address TEXT PRIMARY KEY COLLATE NOCASE,
  local_part TEXT NOT NULL UNIQUE COLLATE NOCASE,
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('primary', 'alias')),
  created_at TEXT NOT NULL
);

INSERT INTO mailbox_addresses (address, local_part, mailbox_id, kind, created_at)
SELECT address, local_part, id, 'primary', created_at
FROM mailboxes;

CREATE INDEX mailbox_addresses_mailbox_id
  ON mailbox_addresses(mailbox_id, kind, created_at);

CREATE INDEX messages_internet_message_id
  ON messages(internet_message_id);
