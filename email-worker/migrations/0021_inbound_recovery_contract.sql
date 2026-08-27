-- The raw EML + receipt + message row are the authoritative inbound record.
-- MIME extraction is an independently recoverable state machine so a parser,
-- attachment, or HTML failure can never turn an accepted message into data
-- loss.  Keep this migration forward-only; see the release contract below.

ALTER TABLE messages
  ADD COLUMN extraction_status TEXT NOT NULL DEFAULT 'complete'
    CHECK (extraction_status IN ('pending', 'leased', 'complete', 'terminal'));

ALTER TABLE messages
  ADD COLUMN attachment_total_count INTEGER NOT NULL DEFAULT 0
    CHECK (attachment_total_count >= 0);

ALTER TABLE messages ADD COLUMN extraction_error_code TEXT;

UPDATE messages
   SET attachment_total_count = (
     SELECT COUNT(*) FROM attachments WHERE attachments.message_id = messages.id
   );

ALTER TABLE inbound_ingest_receipts
  ADD COLUMN raw_size_bytes INTEGER
    CHECK (raw_size_bytes IS NULL OR raw_size_bytes >= 0);

ALTER TABLE inbound_ingest_receipts ADD COLUMN raw_verified_at TEXT;

ALTER TABLE inbound_ingest_receipts
  ADD COLUMN extraction_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (extraction_status IN ('pending', 'leased', 'complete', 'terminal'));

ALTER TABLE inbound_ingest_receipts
  ADD COLUMN attachment_total_count INTEGER NOT NULL DEFAULT 0
    CHECK (attachment_total_count >= 0);

ALTER TABLE inbound_ingest_receipts
  ADD COLUMN extracted_attachment_count INTEGER NOT NULL DEFAULT 0
    CHECK (extracted_attachment_count >= 0);

ALTER TABLE inbound_ingest_receipts
  ADD COLUMN extraction_attempts INTEGER NOT NULL DEFAULT 0
    CHECK (extraction_attempts >= 0);

ALTER TABLE inbound_ingest_receipts ADD COLUMN extraction_lease_token TEXT;
ALTER TABLE inbound_ingest_receipts ADD COLUMN extraction_lease_expires_at TEXT;
ALTER TABLE inbound_ingest_receipts ADD COLUMN next_extraction_attempt_at TEXT;
ALTER TABLE inbound_ingest_receipts ADD COLUMN extraction_last_error TEXT;
ALTER TABLE inbound_ingest_receipts ADD COLUMN extraction_completed_at TEXT;
ALTER TABLE inbound_ingest_receipts ADD COLUMN extraction_terminal_at TEXT;

-- A deleted message leaves an immutable delivery tombstone.  The hold is
-- intentionally not swept by Worker code; release requires an explicit,
-- separately reviewed retention procedure.
ALTER TABLE inbound_ingest_receipts ADD COLUMN deleted_at TEXT;
ALTER TABLE inbound_ingest_receipts
  ADD COLUMN retention_hold INTEGER NOT NULL DEFAULT 1
    CHECK (retention_hold IN (0, 1));

UPDATE inbound_ingest_receipts
   SET attachment_total_count = CASE
         WHEN json_valid(object_manifest_json)
           THEN COALESCE(json_array_length(object_manifest_json, '$.attachmentKeys'), 0)
         ELSE 0
       END,
       extracted_attachment_count = CASE
         WHEN status = 'committed' AND json_valid(object_manifest_json)
           THEN COALESCE(json_array_length(object_manifest_json, '$.attachmentKeys'), 0)
         ELSE 0
       END,
       extraction_status = CASE
         WHEN status = 'committed' THEN 'complete'
         ELSE 'pending'
       END,
       next_extraction_attempt_at = CASE
         WHEN status = 'committed' THEN NULL
         ELSE updated_at
       END,
       extraction_completed_at = CASE
         WHEN status = 'committed' THEN COALESCE(finalized_at, updated_at)
         ELSE NULL
       END;

CREATE INDEX inbound_ingest_receipts_extraction_due
  ON inbound_ingest_receipts(
    extraction_status,
    next_extraction_attempt_at ASC,
    extraction_lease_expires_at ASC
  );

CREATE INDEX inbound_ingest_receipts_deleted
  ON inbound_ingest_receipts(deleted_at)
  WHERE deleted_at IS NOT NULL;

-- This ledger contains identifiers and controlled reason codes only.  It must
-- never receive raw bodies, headers, full envelope addresses, or secrets.
CREATE TABLE inbound_manual_interventions (
  id TEXT PRIMARY KEY,
  receipt_id TEXT,
  message_id TEXT,
  reason_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE INDEX inbound_manual_interventions_open
  ON inbound_manual_interventions(status, created_at ASC);

CREATE TRIGGER inbound_receipt_resolve_interventions
AFTER UPDATE OF extraction_status ON inbound_ingest_receipts
WHEN NEW.extraction_status = 'complete' AND OLD.extraction_status <> 'complete'
BEGIN
  UPDATE inbound_manual_interventions
     SET status = 'resolved', resolved_at = NEW.updated_at,
         updated_at = NEW.updated_at
   WHERE receipt_id = NEW.id AND status = 'open';
END;

-- Legacy messages cannot be mirrored safely because the original SMTP
-- envelope and verified raw hash are absent.  Record the boundary explicitly;
-- never guess values from RFC headers or current mailbox aliases.
INSERT INTO inbound_manual_interventions
  (id, receipt_id, message_id, reason_code, status, created_at, updated_at)
SELECT 'legacy-unbackfillable:' || id, NULL, id,
       'legacy_missing_verified_receipt_identity', 'open',
       COALESCE(received_at, created_at), COALESCE(received_at, created_at)
  FROM messages
 WHERE direction = 'inbound' AND ingest_receipt_id IS NULL
ON CONFLICT(id) DO NOTHING;

CREATE TABLE mail_worker_release_contract (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

INSERT INTO mail_worker_release_contract (name, value, applied_at)
VALUES (
  'inbound_primary_path',
  'gsyen-inbound-receipt-v2-expand-0021',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(name) DO UPDATE SET
  value = excluded.value,
  applied_at = excluded.applied_at;
