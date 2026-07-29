import { ApiError } from "../http";
import type { MailEnv, MailFolder, MessageSummary } from "../types";

const MESSAGE_COLUMNS = `
  m.id, m.direction, m.folder, m.from_address, m.envelope_from_address,
  m.to_json, m.cc_json, m.subject, m.text_body, m.in_reply_to,
  m.references_json, m.status, m.error_code, m.created_at, m.received_at,
  m.sent_at, m.is_read, m.is_starred, m.is_important, m.archived_at,
  m.snoozed_until, m.spam_at, m.trashed_at,
  (SELECT count(*) FROM attachments a WHERE a.message_id = m.id) AS attachment_count
`;

export type MessageStatePatch = {
  isRead?: boolean;
  isStarred?: boolean;
  isImportant?: boolean;
  archived?: boolean;
  snoozedUntil?: string | null;
  spam?: boolean;
  trashed?: boolean;
};

export type AttachmentRecord = {
  id: string;
  message_id: string;
  filename: string;
  mime_type: string;
  disposition: "attachment" | "inline";
  size_bytes: number;
  object_key: string;
};

function folderFilter(folder: MailFolder, now: string): {
  clause: string;
  values: unknown[];
} {
  switch (folder) {
    case "inbox":
      return {
        clause: `m.direction = 'inbound' AND m.archived_at IS NULL
          AND m.spam_at IS NULL AND m.trashed_at IS NULL
          AND (m.snoozed_until IS NULL OR m.snoozed_until <= ?)`,
        values: [now],
      };
    case "sent":
      return { clause: "m.folder = 'sent' AND m.trashed_at IS NULL", values: [] };
    case "outbox":
      return { clause: "m.folder = 'outbox' AND m.trashed_at IS NULL", values: [] };
    case "starred":
      return { clause: "m.is_starred = 1 AND m.trashed_at IS NULL", values: [] };
    case "snoozed":
      return { clause: "m.snoozed_until > ? AND m.trashed_at IS NULL", values: [now] };
    case "archive":
      return { clause: "m.archived_at IS NOT NULL AND m.trashed_at IS NULL", values: [] };
    case "drafts":
      return { clause: "1 = 0", values: [] };
    case "spam":
      return { clause: "m.spam_at IS NOT NULL AND m.trashed_at IS NULL", values: [] };
    case "trash":
      return { clause: "m.trashed_at IS NOT NULL", values: [] };
  }
}

export async function listMessages(
  env: MailEnv,
  mailboxId: string,
  folder: MailFolder,
  before?: string,
): Promise<MessageSummary[]> {
  const filter = folderFilter(folder, new Date().toISOString());
  const cursorClause = before ? "AND m.created_at < ?" : "";
  const values = [mailboxId, ...filter.values, ...(before ? [before] : [])];
  const result = await env.DB.prepare(
    `SELECT ${MESSAGE_COLUMNS}
       FROM messages m
      WHERE m.mailbox_id = ? AND ${filter.clause} ${cursorClause}
      ORDER BY m.created_at DESC LIMIT 50`,
  ).bind(...values).all<MessageSummary>();
  return result.results;
}

export async function getMessage(
  env: MailEnv,
  mailboxId: string,
  messageId: string,
): Promise<MessageSummary | null> {
  return env.DB.prepare(
    `SELECT ${MESSAGE_COLUMNS}
       FROM messages m
      WHERE m.id = ? AND m.mailbox_id = ?`,
  ).bind(messageId, mailboxId).first<MessageSummary>();
}

export async function updateMessageState(
  env: MailEnv,
  mailboxId: string,
  messageId: string,
  patch: MessageStatePatch,
): Promise<MessageSummary> {
  const values = new Map<string, unknown>();
  const now = new Date().toISOString();
  if (patch.isRead !== undefined) values.set("is_read", patch.isRead ? 1 : 0);
  if (patch.isStarred !== undefined) values.set("is_starred", patch.isStarred ? 1 : 0);
  if (patch.isImportant !== undefined) {
    values.set("is_important", patch.isImportant ? 1 : 0);
  }
  if (patch.archived !== undefined) {
    values.set("archived_at", patch.archived ? now : null);
    if (patch.archived) values.set("snoozed_until", null);
  }
  if (patch.snoozedUntil !== undefined) {
    values.set("snoozed_until", patch.snoozedUntil);
    if (patch.snoozedUntil) values.set("archived_at", null);
  }
  if (patch.spam !== undefined) {
    values.set("spam_at", patch.spam ? now : null);
    if (patch.spam) {
      values.set("archived_at", null);
      values.set("snoozed_until", null);
    }
  }
  if (patch.trashed !== undefined) {
    values.set("trashed_at", patch.trashed ? now : null);
    if (patch.trashed) {
      values.set("archived_at", null);
      values.set("snoozed_until", null);
    }
  }
  if (values.size === 0) {
    throw new ApiError(400, "empty_update", "No message state was provided");
  }
  const assignments = [...values.keys()].map((column) => `${column} = ?`).join(", ");
  const result = await env.DB.prepare(
    `UPDATE messages SET ${assignments} WHERE id = ? AND mailbox_id = ?`,
  ).bind(...values.values(), messageId, mailboxId).run();
  if (result.meta.changes !== 1) {
    throw new ApiError(404, "message_not_found", "Message was not found");
  }
  const message = await getMessage(env, mailboxId, messageId);
  if (!message) {
    throw new ApiError(404, "message_not_found", "Message was not found");
  }
  return message;
}

export async function listMessageAttachments(
  env: MailEnv,
  mailboxId: string,
  messageId: string,
): Promise<Omit<AttachmentRecord, "object_key">[]> {
  const result = await env.DB.prepare(
    `SELECT a.id, a.message_id, a.filename, a.mime_type, a.disposition, a.size_bytes
       FROM attachments a
       JOIN messages m ON m.id = a.message_id
      WHERE a.message_id = ? AND m.mailbox_id = ?
      ORDER BY a.rowid`,
  ).bind(messageId, mailboxId).all<Omit<AttachmentRecord, "object_key">>();
  return result.results;
}

export async function getAttachment(
  env: MailEnv,
  mailboxId: string,
  attachmentId: string,
): Promise<AttachmentRecord | null> {
  return env.DB.prepare(
    `SELECT a.id, a.message_id, a.filename, a.mime_type, a.disposition,
            a.size_bytes, a.object_key
       FROM attachments a
       JOIN messages m ON m.id = a.message_id
      WHERE a.id = ? AND m.mailbox_id = ?`,
  ).bind(attachmentId, mailboxId).first<AttachmentRecord>();
}
