import type { MailEnv } from "../types";

export type MessageSyncOperation = "upsert" | "delete";

function uniqueIds(messageIds: string[]): string[] {
  return [...new Set(messageIds.filter(Boolean))];
}

export async function appendMessageSyncEvents(
  env: MailEnv,
  mailboxId: string,
  messageIds: string[],
  operation: MessageSyncOperation = "upsert",
): Promise<void> {
  const ids = uniqueIds(messageIds);
  if (ids.length === 0) return;
  const now = new Date().toISOString();
  await env.DB.batch(ids.map((messageId) => env.DB.prepare(
    `INSERT INTO message_sync_events(mailbox_id, message_id, operation, created_at)
     VALUES (?, ?, ?, ?)`,
  ).bind(mailboxId, messageId, operation, now)));
}

export async function appendMessageSyncEventsForMessageIds(
  env: MailEnv,
  messageIds: string[],
): Promise<void> {
  const ids = uniqueIds(messageIds);
  if (ids.length === 0) return;
  const now = new Date().toISOString();
  await env.DB.batch(ids.map((messageId) => env.DB.prepare(
    `INSERT INTO message_sync_events(mailbox_id, message_id, operation, created_at)
     SELECT mailbox_id, id, 'upsert', ? FROM messages WHERE id = ?`,
  ).bind(now, messageId)));
}