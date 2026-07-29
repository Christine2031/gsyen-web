PRAGMA foreign_keys = ON;

CREATE TABLE mailboxes (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  local_part TEXT NOT NULL COLLATE NOCASE,
  address TEXT NOT NULL COLLATE NOCASE,
  display_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'suspended')),
  created_at TEXT NOT NULL,
  approved_at TEXT,
  UNIQUE (owner_id),
  UNIQUE (local_part),
  UNIQUE (address)
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  folder TEXT NOT NULL CHECK (folder IN ('inbox', 'sent', 'outbox')),
  provider_message_id TEXT,
  internet_message_id TEXT,
  from_address TEXT NOT NULL,
  to_json TEXT NOT NULL,
  cc_json TEXT NOT NULL DEFAULT '[]',
  subject TEXT NOT NULL DEFAULT '',
  text_body TEXT NOT NULL DEFAULT '',
  html_object_key TEXT,
  raw_object_key TEXT,
  in_reply_to TEXT,
  references_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL
    CHECK (status IN ('received', 'queued', 'sending', 'sent', 'failed')),
  error_code TEXT,
  created_at TEXT NOT NULL,
  received_at TEXT,
  sent_at TEXT
);

CREATE UNIQUE INDEX messages_inbound_dedupe
  ON messages(mailbox_id, internet_message_id)
  WHERE direction = 'inbound' AND internet_message_id IS NOT NULL;

CREATE INDEX messages_mailbox_folder_created
  ON messages(mailbox_id, folder, created_at DESC);

CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  disposition TEXT NOT NULL CHECK (disposition IN ('attachment', 'inline')),
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  object_key TEXT NOT NULL
);

CREATE INDEX attachments_message_id ON attachments(message_id);

CREATE TABLE send_usage (
  owner_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  sent_count INTEGER NOT NULL DEFAULT 0 CHECK (sent_count >= 0),
  PRIMARY KEY (owner_id, day_key)
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  owner_id TEXT,
  action TEXT NOT NULL,
  target_id TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('allowed', 'denied', 'failed')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX audit_events_owner_created
  ON audit_events(owner_id, created_at DESC);
