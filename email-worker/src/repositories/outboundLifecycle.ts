import { ApiError } from "../http";
import type { MailEnv } from "../types";
import type { OutboundRecord } from "./outbound";

export async function cancelOutboundMessage(
  env: MailEnv,
  mailboxId: string,
  ownerId: string,
  messageId: string,
): Promise<void> {
  const message = await env.DB.prepare(
    `SELECT status, created_at FROM messages
      WHERE id = ? AND mailbox_id = ? AND direction = 'outbound'`,
  ).bind(messageId, mailboxId).first<{
    status: OutboundRecord["status"];
    created_at: string;
  }>();
  if (!message) {
    throw new ApiError(404, "message_not_found", "Message was not found");
  }
  if (message.status !== "queued") {
    throw new ApiError(409, "message_not_cancellable", "Only queued messages can be cancelled");
  }
  const dayKey = message.created_at.slice(0, 10);
  const results = await env.DB.batch([
    env.DB.prepare(
      `UPDATE send_usage SET sent_count = MAX(0, sent_count - 1)
        WHERE owner_id = ? AND day_key = ?
          AND EXISTS (
            SELECT 1 FROM messages
             WHERE id = ? AND mailbox_id = ? AND direction = 'outbound'
               AND status = 'queued'
          )`,
    ).bind(ownerId, dayKey, messageId, mailboxId),
    env.DB.prepare(
      `DELETE FROM messages
        WHERE id = ? AND mailbox_id = ? AND direction = 'outbound'
          AND status = 'queued'`,
    ).bind(messageId, mailboxId),
  ]);
  if (results[1].meta.changes < 1) {
    throw new ApiError(409, "message_not_cancellable", "Message is already being delivered");
  }
}

type TrashedOutbound = {
  created_at: string;
  owner_id: string;
};

async function settleTrashedWithStatus(
  env: MailEnv,
  messageId: string,
  status: "queued" | "sending",
): Promise<boolean> {
  const message = await env.DB.prepare(
    `SELECT m.created_at, b.owner_id
       FROM messages m JOIN mailboxes b ON b.id = m.mailbox_id
      WHERE m.id = ? AND m.direction = 'outbound' AND m.status = ?
        AND m.trashed_at IS NOT NULL`,
  ).bind(messageId, status).first<TrashedOutbound>();
  if (!message) return false;
  const guard = `EXISTS (
    SELECT 1 FROM messages WHERE id = ? AND direction = 'outbound'
      AND status = ? AND trashed_at IS NOT NULL
  )`;
  const results = await env.DB.batch([
    env.DB.prepare(
      `UPDATE send_usage SET sent_count = MAX(0, sent_count - 1)
        WHERE owner_id = ? AND day_key = ? AND ${guard}`,
    ).bind(
      message.owner_id,
      message.created_at.slice(0, 10),
      messageId,
      status,
    ),
    env.DB.prepare(
      `UPDATE messages SET status = 'failed', error_code = 'cancelled_trashed'
        WHERE id = ? AND direction = 'outbound' AND status = ?
          AND trashed_at IS NOT NULL`,
    ).bind(messageId, status),
  ]);
  return results[1].meta.changes >= 1;
}

export function settleTrashedQueuedOutbound(
  env: MailEnv,
  messageId: string,
): Promise<boolean> {
  return settleTrashedWithStatus(env, messageId, "queued");
}

export function abortClaimedTrashedOutbound(
  env: MailEnv,
  messageId: string,
): Promise<boolean> {
  return settleTrashedWithStatus(env, messageId, "sending");
}

export async function settleTrashedQueuedMessages(
  env: MailEnv,
  limit = 100,
): Promise<number> {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const rows = await env.DB.prepare(
    `SELECT id FROM messages
      WHERE direction = 'outbound' AND status = 'queued'
        AND trashed_at IS NOT NULL
      ORDER BY created_at LIMIT ?`,
  ).bind(safeLimit).all<{ id: string }>();
  let settled = 0;
  for (const row of rows.results) {
    if (await settleTrashedQueuedOutbound(env, row.id)) settled += 1;
  }
  return settled;
}
