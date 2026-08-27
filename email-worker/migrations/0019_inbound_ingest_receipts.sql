-- EXPAND PHASE: add the receipt-v2 identity without removing the legacy
-- Message-ID index.  The old production Worker can continue serving while the
-- receipt-v2-compatible revision is deployed and drained.  The legacy index is
-- removed only by the later contract migration.

ALTER TABLE messages ADD COLUMN ingest_receipt_id TEXT;
ALTER TABLE messages ADD COLUMN envelope_to_address TEXT;
ALTER TABLE messages ADD COLUMN mailbox_lookup_address TEXT;
ALTER TABLE messages ADD COLUMN delivery_target_address TEXT;

CREATE TABLE inbound_ingest_receipts (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE
    CHECK (
      length(idempotency_key) = 64
      AND idempotency_key NOT GLOB '*[^0-9a-f]*'
  ),
  message_id TEXT NOT NULL UNIQUE,
  -- Deliberately not a foreign key: the receipt is the delivery tombstone and
  -- must survive mailbox/message deletion until its retention policy runs.
  mailbox_id TEXT NOT NULL,
  raw_sha256 TEXT NOT NULL
    CHECK (
      length(raw_sha256) = 64
      AND raw_sha256 NOT GLOB '*[^0-9a-f]*'
    ),
  envelope_to_address TEXT NOT NULL,
  mailbox_lookup_address TEXT NOT NULL,
  delivery_target_address TEXT NOT NULL,
  envelope_from_address TEXT NOT NULL,
  internet_message_id TEXT,
  raw_object_key TEXT NOT NULL,
  object_manifest_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'staging'
    CHECK (status IN (
      'staging',
      'objects_written',
      'reconcile_needed',
      'committed'
    )),
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finalized_at TEXT,
  reconciled_at TEXT
);

CREATE INDEX inbound_ingest_receipts_reconcile
  ON inbound_ingest_receipts(status, updated_at ASC);

CREATE UNIQUE INDEX messages_ingest_receipt_id
  ON messages(ingest_receipt_id)
  WHERE ingest_receipt_id IS NOT NULL;

CREATE UNIQUE INDEX messages_inbound_delivery_dedupe
  ON messages(
    raw_sha256,
    envelope_to_address,
    delivery_target_address,
    envelope_from_address
  )
  WHERE direction = 'inbound'
    AND raw_sha256 IS NOT NULL
    AND envelope_to_address IS NOT NULL
    AND delivery_target_address IS NOT NULL
    AND envelope_from_address IS NOT NULL;

CREATE INDEX messages_inbound_message_id_metadata
  ON messages(mailbox_id, internet_message_id)
  WHERE direction = 'inbound' AND internet_message_id IS NOT NULL;
