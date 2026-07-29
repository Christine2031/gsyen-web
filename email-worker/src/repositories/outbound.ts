import { ApiError } from "../http";
import type { MailEnv, MailboxRecord, SendRequest } from "../types";

export type OutboundRecord = {
  id: string;
  from_address: string;
  to_json: string;
  cc_json: string;
  subject: string;
  text_body: string;
  in_reply_to: string | null;
  references_json: string;
  status: "queued" | "sending" | "sent" | "failed";
  display_name: string;
  mailbox_status: "pending" | "active" | "suspended";
};

export async function queueOutboundMessage(
  env: MailEnv,
  mailbox: MailboxRecord,
  input: SendRequest,
  clientRequestId: string,
): Promise<{ messageId: string; created: boolean }> {
  if (mailbox.status !== "active") {
    throw new ApiError(403, "mailbox_inactive", "Mailbox is not active");
  }
  const existing = await env.DB.prepare(
    `SELECT id FROM messages
      WHERE mailbox_id = ? AND client_request_id = ? AND direction = 'outbound'`,
  ).bind(mailbox.id, clientRequestId).first<{ id: string }>();
  if (existing) return { messageId: existing.id, created: false };
  const limit = Number.parseInt(env.DAILY_SEND_LIMIT, 10);
  const dayKey = new Date().toISOString().slice(0, 10);
  const usage = await env.DB.prepare(
    `INSERT INTO send_usage (owner_id, day_key, sent_count)
     VALUES (?, ?, 1)
     ON CONFLICT(owner_id, day_key) DO UPDATE
       SET sent_count = send_usage.sent_count + 1
       WHERE send_usage.sent_count < ?
     RETURNING sent_count`,
  ).bind(mailbox.owner_id, dayKey, limit).first<{ sent_count: number }>();
  if (!usage) {
    throw new ApiError(429, "daily_limit_reached", "Daily sending limit reached");
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await env.DB.prepare(
      `INSERT INTO messages
        (id, mailbox_id, direction, folder, client_request_id, from_address,
         to_json, cc_json, subject, text_body, in_reply_to, references_json,
         status, created_at, is_read)
       VALUES (?, ?, 'outbound', 'outbox', ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, 1)`,
    ).bind(
      id,
      mailbox.id,
      clientRequestId,
      mailbox.address,
      JSON.stringify(input.to),
      JSON.stringify(input.cc),
      input.subject,
      input.text,
      input.inReplyTo ?? null,
      JSON.stringify(input.references ?? []),
      now,
    ).run();
  } catch (error) {
    await refundUsage(env, mailbox.owner_id, dayKey);
    if (String(error).toLowerCase().includes("unique")) {
      const conflict = await env.DB.prepare(
        `SELECT id FROM messages
          WHERE mailbox_id = ? AND client_request_id = ? AND direction = 'outbound'`,
      ).bind(mailbox.id, clientRequestId).first<{ id: string }>();
      if (conflict) return { messageId: conflict.id, created: false };
    }
    throw error;
  }
  try {
    await env.OUTBOUND_QUEUE.send({ messageId: id });
  } catch {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM messages WHERE id = ?").bind(id),
      env.DB.prepare(
        `UPDATE send_usage SET sent_count = MAX(0, sent_count - 1)
          WHERE owner_id = ? AND day_key = ?`,
      ).bind(mailbox.owner_id, dayKey),
    ]);
    throw new ApiError(503, "queue_unavailable", "Mail queue is temporarily unavailable");
  }
  return { messageId: id, created: true };
}

async function refundUsage(
  env: MailEnv,
  ownerId: string,
  dayKey: string,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE send_usage SET sent_count = MAX(0, sent_count - 1)
      WHERE owner_id = ? AND day_key = ?`,
  ).bind(ownerId, dayKey).run();
}

export async function claimOutboundRecord(
  env: MailEnv,
  messageId: string,
): Promise<OutboundRecord | null> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 10 * 60_000).toISOString();
  const claim = await env.DB.prepare(
    `UPDATE messages
        SET status = 'sending', send_attempt_count = send_attempt_count + 1,
            last_attempt_at = ?, error_code = NULL
      WHERE id = ? AND direction = 'outbound'
        AND (status IN ('queued', 'failed')
          OR (status = 'sending' AND last_attempt_at < ?))`,
  ).bind(now.toISOString(), messageId, staleBefore).run();
  if (claim.meta.changes !== 1) return null;
  return env.DB.prepare(
    `SELECT m.id, m.from_address, m.to_json, m.cc_json, m.subject, m.text_body,
            m.in_reply_to, m.references_json, m.status, b.display_name,
            b.status AS mailbox_status
       FROM messages m
       JOIN mailboxes b ON b.id = m.mailbox_id
      WHERE m.id = ? AND m.direction = 'outbound'`,
  ).bind(messageId).first<OutboundRecord>();
}


export async function getOutboundStatus(
  env: MailEnv,
  messageId: string,
): Promise<OutboundRecord["status"] | null> {
  const record = await env.DB.prepare(
    "SELECT status FROM messages WHERE id = ? AND direction = 'outbound'",
  ).bind(messageId).first<{ status: OutboundRecord["status"] }>();
  return record?.status ?? null;
}
export async function markOutboundSent(
  env: MailEnv,
  messageId: string,
  providerMessageId: string,
): Promise<boolean> {
  const result = await env.DB.prepare(
    `UPDATE messages
        SET status = 'sent', folder = 'sent', provider_message_id = ?,
            sent_at = ?, error_code = NULL
      WHERE id = ? AND status = 'sending'`,
  ).bind(providerMessageId, new Date().toISOString(), messageId).run();
  return result.meta.changes === 1;
}

export async function markOutboundFailed(
  env: MailEnv,
  messageId: string,
  code: string,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE messages SET status = 'failed', error_code = ?
      WHERE id = ? AND status = 'sending'`,
  ).bind(code.slice(0, 120), messageId).run();
}
