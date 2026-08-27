import { ApiError } from "../http";
import type { MailEnv } from "../types";
export {
  INBOUND_INGEST_RECONCILE_AFTER_MS,
  recoverInboundIngestReceipts as reconcileInboundIngestReceipts,
} from "../inbound";

type DeletableMessage = {
  raw_object_key: string | null;
  html_object_key: string | null;
  trashed_at: string | null;
  direction: "inbound" | "outbound";
  status: "received" | "queued" | "sending" | "sent" | "failed";
  created_at: string;
  owner_id: string;
  ingest_receipt_id: string | null;
  receipt_extraction_status: string | null;
};

type DeletionJob = {
  object_key: string;
  attempts: number;
};

const DELETION_RETRY_BASE_MS = 15 * 60_000;
const DELETION_RETRY_MAX_EXPONENT = 5;

function nextDeletionAttempt(attempt: number): string {
  const exponent = Math.min(
    DELETION_RETRY_MAX_EXPONENT,
    Math.max(0, attempt - 1),
  );
  return new Date(
    Date.now() + DELETION_RETRY_BASE_MS * (2 ** exponent),
  ).toISOString();
}

export async function deleteTrashedMessage(
  env: MailEnv,
  mailboxId: string,
  messageId: string,
): Promise<{ pendingObjects: number }> {
  const message = await env.DB.prepare(
    `SELECT m.raw_object_key, m.html_object_key, m.trashed_at, m.direction,
            m.status, m.created_at, m.ingest_receipt_id, b.owner_id,
            r.extraction_status AS receipt_extraction_status
       FROM messages m
       JOIN mailboxes b ON b.id = m.mailbox_id
       LEFT JOIN inbound_ingest_receipts r ON r.id = m.ingest_receipt_id
      WHERE m.id = ? AND m.mailbox_id = ?`,
  ).bind(messageId, mailboxId).first<DeletableMessage>();
  if (!message) {
    throw new ApiError(404, "message_not_found", "Message was not found");
  }
  if (!message.trashed_at) {
    throw new ApiError(409, "message_not_trashed", "Move the message to trash before deleting it");
  }
  if (message.direction === "outbound" && message.status === "sending") {
    throw new ApiError(
      409,
      "message_delivery_in_progress",
      "Wait for delivery to finish before deleting this message",
    );
  }
  if (message.receipt_extraction_status === "leased") {
    throw new ApiError(
      409,
      "message_extraction_in_progress",
      "Wait for inbound extraction to finish before deleting this message",
    );
  }
  const now = new Date().toISOString();
  const statusGuard = message.direction === "outbound" && message.status === "queued"
    ? "AND messages.status = 'queued'"
    : "";
  const receiptNotLeased = `NOT EXISTS (
    SELECT 1 FROM inbound_ingest_receipts AS receipt
     WHERE receipt.id = messages.ingest_receipt_id
       AND receipt.extraction_status = 'leased'
  )`;
  const statements: D1PreparedStatement[] = [env.DB.prepare(
    `INSERT INTO object_deletion_jobs
      (object_key, attempts, last_error, next_attempt_at, created_at, updated_at)
     SELECT DISTINCT object_key, 0, NULL, ?, ?, ?
       FROM (
         SELECT object.value AS object_key
           FROM messages
           LEFT JOIN inbound_ingest_receipts AS receipt
             ON receipt.id = messages.ingest_receipt_id,
                json_each(json_array(
                  messages.raw_object_key,
                  messages.html_object_key,
                  json_extract(receipt.object_manifest_json, '$.rawKey'),
                  json_extract(receipt.object_manifest_json, '$.htmlKey')
                )) AS object
          WHERE messages.id = ? AND messages.mailbox_id = ?
            AND messages.trashed_at IS NOT NULL ${statusGuard}
            AND ${receiptNotLeased}
         UNION ALL
         SELECT attachment.object_key AS object_key
           FROM attachments AS attachment
           JOIN messages ON messages.id = attachment.message_id
          WHERE messages.id = ? AND messages.mailbox_id = ?
            AND messages.trashed_at IS NOT NULL ${statusGuard}
            AND ${receiptNotLeased}
         UNION ALL
         SELECT manifest.value AS object_key
           FROM inbound_ingest_receipts AS receipt
           JOIN messages ON messages.ingest_receipt_id = receipt.id,
                json_each(receipt.object_manifest_json, '$.attachmentKeys') AS manifest
          WHERE messages.id = ? AND messages.mailbox_id = ?
            AND messages.trashed_at IS NOT NULL ${statusGuard}
            AND ${receiptNotLeased}
       ) AS object_manifest
      WHERE object_key IS NOT NULL AND object_key <> ''
     ON CONFLICT(object_key) DO UPDATE SET updated_at = excluded.updated_at`,
  ).bind(
    now,
    now,
    now,
    messageId,
    mailboxId,
    messageId,
    mailboxId,
    messageId,
    mailboxId,
  )];
  if (message.direction === "outbound" && message.status === "queued") {
    statements.push(env.DB.prepare(
      `UPDATE send_usage SET sent_count = MAX(0, sent_count - 1)
        WHERE owner_id = ? AND day_key = ?
          AND EXISTS (
            SELECT 1 FROM messages
             WHERE id = ? AND mailbox_id = ? AND status = 'queued'
               AND trashed_at IS NOT NULL
          )`,
    ).bind(message.owner_id, message.created_at.slice(0, 10), messageId, mailboxId));
  }
  if (message.ingest_receipt_id) {
    statements.push(env.DB.prepare(
      `UPDATE stalwart_mirror_outbox
          SET status = 'terminal', lease_token = NULL, lease_expires_at = NULL,
              last_error = 'message_deleted_tombstone',
              terminal_at = COALESCE(terminal_at, ?), updated_at = ?
        WHERE message_id = ? AND status NOT IN ('delivered', 'terminal')
          AND EXISTS (
            SELECT 1 FROM messages
             WHERE id = ? AND mailbox_id = ? AND trashed_at IS NOT NULL
               AND ${receiptNotLeased}
          )`,
    ).bind(now, now, messageId, messageId, mailboxId));
    statements.push(env.DB.prepare(
      `UPDATE inbound_ingest_receipts
          SET deleted_at = COALESCE(deleted_at, ?), retention_hold = 1,
              extraction_status = 'terminal',
              extraction_lease_token = NULL, extraction_lease_expires_at = NULL,
              next_extraction_attempt_at = NULL,
              extraction_last_error = 'message_deleted_tombstone',
              extraction_terminal_at = COALESCE(extraction_terminal_at, ?),
              updated_at = ?
        WHERE id = ? AND message_id = ? AND extraction_status <> 'leased'`,
    ).bind(now, now, now, message.ingest_receipt_id, messageId));
  }
  statements.push(env.DB.prepare(
    `DELETE FROM messages
      WHERE id = ? AND mailbox_id = ? AND trashed_at IS NOT NULL ${statusGuard}
        AND ${receiptNotLeased}`,
  ).bind(messageId, mailboxId));
  const deletionResults = await env.DB.batch(statements);
  const remaining = await env.DB.prepare(
    "SELECT 1 AS found FROM messages WHERE id = ? AND mailbox_id = ?",
  ).bind(messageId, mailboxId).first<{ found: number }>();
  if (remaining) {
    throw new ApiError(409, "message_delete_conflict", "Message could not be deleted");
  }
  return { pendingObjects: deletionResults[0]?.meta.changes ?? 0 };
}

export async function cleanupObjectDeletionJobs(
  env: MailEnv,
  limit = 20,
): Promise<{ deleted: number; failed: number }> {
  const safeLimit = Math.max(1, Math.min(20, Math.trunc(limit)));
  const now = new Date().toISOString();
  const jobs = await env.DB.prepare(
    `SELECT object_key, attempts FROM object_deletion_jobs AS deletion_job
      WHERE next_attempt_at <= ?
        AND NOT EXISTS (
          SELECT 1 FROM stalwart_mirror_outbox AS mirror
           WHERE mirror.raw_object_key = deletion_job.object_key
             AND mirror.status NOT IN ('delivered', 'terminal')
        )
      ORDER BY next_attempt_at, created_at LIMIT ?`,
  ).bind(now, safeLimit).all<DeletionJob>();
  let deleted = 0;
  let failed = 0;
  for (const job of jobs.results) {
    try {
      await env.MAIL_OBJECTS.delete(job.object_key);
      await env.DB.prepare(
        "DELETE FROM object_deletion_jobs WHERE object_key = ?",
      ).bind(job.object_key).run();
      deleted += 1;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const attempts = job.attempts + 1;
      const updatedAt = new Date().toISOString();
      await env.DB.prepare(
        `UPDATE object_deletion_jobs
            SET attempts = ?, last_error = ?, next_attempt_at = ?, updated_at = ?
          WHERE object_key = ?`,
      ).bind(
        attempts,
        detail.slice(0, 500),
        nextDeletionAttempt(attempts),
        updatedAt,
        job.object_key,
      ).run();
      failed += 1;
    }
  }
  return { deleted, failed };
}
