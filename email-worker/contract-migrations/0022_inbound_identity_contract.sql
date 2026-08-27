-- CONTRACT PHASE. Apply only after the receipt-v2-compatible Worker revision
-- is serving 100% of traffic and the previous revision has drained. That
-- revision remains the rollback floor (with Stalwart mirroring disabled).
-- Re-scan immediately before contract so legacy rows written by the draining
-- old revision after 0021 are placed on the explicit no-auto-backfill ledger.
INSERT INTO inbound_manual_interventions
  (id, receipt_id, message_id, reason_code, status, created_at, updated_at)
SELECT 'legacy-unbackfillable:' || id, NULL, id,
       'legacy_missing_verified_receipt_identity', 'open',
       COALESCE(received_at, created_at), COALESCE(received_at, created_at)
  FROM messages
 WHERE direction = 'inbound' AND ingest_receipt_id IS NULL
ON CONFLICT(id) DO NOTHING;

DROP INDEX IF EXISTS messages_inbound_dedupe;

-- Repair only receipt-v2 rows whose metadata remained NULL after a recoverable
-- parser interruption. The expand Worker normally writes the real Message-ID
-- so the legacy unique index remains the old/new crash-window guard; conflicts
-- are terminal/manual and are never auto-released by this migration.
UPDATE messages
   SET internet_message_id = (
     SELECT receipt.internet_message_id
       FROM inbound_ingest_receipts AS receipt
      WHERE receipt.id = messages.ingest_receipt_id
   )
 WHERE direction = 'inbound'
   AND ingest_receipt_id IS NOT NULL
   AND internet_message_id IS NULL;

UPDATE mail_worker_release_contract
   SET value = 'gsyen-inbound-receipt-v2-contract-0022',
       applied_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
 WHERE name = 'inbound_primary_path';
