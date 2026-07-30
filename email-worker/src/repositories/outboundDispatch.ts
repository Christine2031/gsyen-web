import type { MailEnv } from "../types";

const MIN_QUEUED_AGE_MS = 2 * 60_000;
const DISPATCH_LEASE_MS = 30 * 60_000;

export async function markOutboundDispatched(
  env: MailEnv,
  messageId: string,
  dispatchedAt = new Date().toISOString(),
): Promise<void> {
  await env.DB.prepare(
    `UPDATE messages SET queue_dispatched_at = ?
      WHERE id = ? AND direction = 'outbound' AND status = 'queued'
        AND trashed_at IS NULL`,
  ).bind(dispatchedAt, messageId).run();
}

export async function requeueStaleOutboundMessages(
  env: MailEnv,
  limit = 50,
): Promise<{ inspected: number; enqueued: number; failed: number }> {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const now = new Date();
  const queuedBefore = new Date(now.getTime() - MIN_QUEUED_AGE_MS).toISOString();
  const leaseBefore = new Date(now.getTime() - DISPATCH_LEASE_MS).toISOString();
  const rows = await env.DB.prepare(
    `SELECT id FROM messages
      WHERE direction = 'outbound' AND status = 'queued'
        AND trashed_at IS NULL AND created_at < ?
        AND (queue_dispatched_at IS NULL OR queue_dispatched_at < ?)
      ORDER BY created_at, id LIMIT ?`,
  ).bind(queuedBefore, leaseBefore, safeLimit).all<{ id: string }>();
  let enqueued = 0;
  let failed = 0;
  for (const row of rows.results) {
    const lease = new Date().toISOString();
    const claimed = await env.DB.prepare(
      `UPDATE messages SET queue_dispatched_at = ?
        WHERE id = ? AND direction = 'outbound' AND status = 'queued'
          AND trashed_at IS NULL
          AND (queue_dispatched_at IS NULL OR queue_dispatched_at < ?)`,
    ).bind(lease, row.id, leaseBefore).run();
    if (claimed.meta.changes !== 1) continue;
    try {
      await env.OUTBOUND_QUEUE.send({ messageId: row.id });
      enqueued += 1;
    } catch (error) {
      failed += 1;
      console.error(JSON.stringify({
        event: "mail_outbound_requeue_failed",
        messageId: row.id,
        error: error instanceof Error ? error.message : String(error),
      }));
      try {
        await env.DB.prepare(
          `UPDATE messages SET queue_dispatched_at = NULL
            WHERE id = ? AND direction = 'outbound' AND status = 'queued'
              AND queue_dispatched_at = ?`,
        ).bind(row.id, lease).run();
      } catch (stateError) {
        console.error(JSON.stringify({
          event: "mail_outbound_requeue_release_failed",
          messageId: row.id,
          error: stateError instanceof Error
            ? stateError.message
            : String(stateError),
        }));
      }
    }
  }
  return { inspected: rows.results.length, enqueued, failed };
}
