import { ApiError } from "../http";
import type { MailEnv } from "../types";

type DeletableMessage = {
  raw_object_key: string | null;
  html_object_key: string | null;
  trashed_at: string | null;
  direction: "inbound" | "outbound";
  status: "received" | "queued" | "sending" | "sent" | "failed";
  created_at: string;
  owner_id: string;
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
            m.status, m.created_at, b.owner_id
       FROM messages m
       JOIN mailboxes b ON b.id = m.mailbox_id
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
  const attachments = await env.DB.prepare(
    "SELECT object_key FROM attachments WHERE message_id = ?",
  ).bind(messageId).all<{ object_key: string }>();
  const objectKeys = [...new Set([
    message.raw_object_key,
    message.html_object_key,
    ...attachments.results.map((item) => item.object_key),
  ].filter((key): key is string => Boolean(key)))];
  const now = new Date().toISOString();
  const statusGuard = message.direction === "outbound" && message.status === "queued"
    ? "AND status = 'queued'"
    : "";
  const statements = objectKeys.map((key) => env.DB.prepare(
    `INSERT INTO object_deletion_jobs
      (object_key, attempts, last_error, next_attempt_at, created_at, updated_at)
     SELECT ?, 0, NULL, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM messages
         WHERE id = ? AND mailbox_id = ? AND trashed_at IS NOT NULL ${statusGuard}
      )
     ON CONFLICT(object_key) DO UPDATE SET updated_at = excluded.updated_at`,
  ).bind(key, now, now, now, messageId, mailboxId));
  if (message.direction === "outbound" && message.status === "queued") {
    statements.push(env.DB.prepare(
      `UPDATE send_usage SET sent_count = MAX(0, sent_count - 1)
        WHERE owner_id = ? AND day_key = ?
          AND EXISTS (
            SELECT 1 FROM messages
             WHERE id = ? AND mailbox_id = ? AND status = 'queued'
          )`,
    ).bind(message.owner_id, message.created_at.slice(0, 10), messageId, mailboxId));
  }
  statements.push(env.DB.prepare(
    `DELETE FROM messages
      WHERE id = ? AND mailbox_id = ? AND trashed_at IS NOT NULL ${statusGuard}`,
  ).bind(messageId, mailboxId));
  await env.DB.batch(statements);
  const remaining = await env.DB.prepare(
    "SELECT 1 AS found FROM messages WHERE id = ? AND mailbox_id = ?",
  ).bind(messageId, mailboxId).first<{ found: number }>();
  if (remaining) {
    throw new ApiError(409, "message_delete_conflict", "Message could not be deleted");
  }
  return { pendingObjects: objectKeys.length };
}

export async function cleanupObjectDeletionJobs(
  env: MailEnv,
  limit = 50,
): Promise<{ deleted: number; failed: number }> {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const now = new Date().toISOString();
  const jobs = await env.DB.prepare(
    `SELECT object_key, attempts FROM object_deletion_jobs
      WHERE next_attempt_at <= ?
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
