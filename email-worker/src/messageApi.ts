import PostalMime from "postal-mime";
import { readableMessageText } from "./messageText";
import { writeAudit } from "./audit";
import { ApiError, corsHeaders, json, readJson } from "./http";
import { parseMessageCursor, serializeMessageCursor } from "./messageCursor";
import {
  cancelOutboundMessage,
  cleanupObjectDeletionJobs,
  deleteTrashedMessage,
  getAttachment,
  getMailboxByOwner,
  getMessage,
  listMessageAttachments,
  listMessages,
  queueOutboundMessage,
  updateMessagesState,
  updateMessageState,
} from "./repository";
import type { MessageStatePatch } from "./repositories/messages";
import type {
  AuthUser,
  MailEnv,
  MailFolder,
  MailboxRecord,
  MessageSummary,
} from "./types";
import { parseIdempotencyKey, parseSendRequest } from "./validation";

type StateBody = Record<string, unknown>;
type BatchBody = { ids?: unknown; patch?: unknown };

function publicInternetMessageId(value: string | null): string | null {
  if (!value || value.length > 998 || /[\r\n]/.test(value)) return null;
  return /^<[^<>\s@]+@[^<>\s@]+>$/.test(value) ? value : null;
}

function serializeMessage(message: MessageSummary) {
  return {
    id: message.id,
    direction: message.direction,
    folder: message.folder,
    providerMessageId: message.provider_message_id,
    internetMessageId: publicInternetMessageId(message.internet_message_id),
    fromAddress: message.from_address,
    envelopeFrom: message.envelope_from_address,
    to: JSON.parse(message.to_json) as string[],
    cc: JSON.parse(message.cc_json) as string[],
    subject: message.subject,
    text: message.text_body,
    inReplyTo: publicInternetMessageId(message.in_reply_to),
    references: (JSON.parse(message.references_json) as string[])
      .map(publicInternetMessageId)
      .filter((value): value is string => Boolean(value)),
    status: message.status,
    errorCode: message.error_code,
    createdAt: message.created_at,
    receivedAt: message.received_at,
    sentAt: message.sent_at,
    isRead: message.is_read === 1,
    isStarred: message.is_starred === 1,
    isImportant: message.is_important === 1,
    archivedAt: message.archived_at,
    snoozedUntil: message.snoozed_until,
    spamAt: message.spam_at,
    trashedAt: message.trashed_at,
    attachmentCount: message.attachment_count,
    category: message.category,
  };
}

async function recoverInboundText(
  env: MailEnv,
  mailboxId: string,
  message: MessageSummary,
): Promise<MessageSummary> {
  if (message.direction !== "inbound" || message.text_body.trim()) return message;
  const stored = await env.DB.prepare(
    "SELECT raw_object_key FROM messages WHERE id = ? AND mailbox_id = ?",
  ).bind(message.id, mailboxId).first<{ raw_object_key: string | null }>();
  if (!stored?.raw_object_key) return message;
  const raw = await env.MAIL_OBJECTS.get(stored.raw_object_key);
  if (!raw) return message;
  const parsed = await PostalMime.parse(await raw.arrayBuffer(), {
    attachmentEncoding: "arraybuffer",
    maxHeadersSize: 128_000,
    maxNestingDepth: 20,
  });
  const text = readableMessageText(parsed);
  if (!text) return message;
  await env.DB.prepare(
    "UPDATE messages SET text_body = ? WHERE id = ? AND mailbox_id = ?",
  ).bind(text, message.id, mailboxId).run();
  return { ...message, text_body: text };
}

function parseFolder(value: string | null): MailFolder | "all" {
  const folder = value ?? "inbox";
  const allowed = new Set<MailFolder | "all">([
    "all",
    "inbox", "sent", "outbox", "starred", "snoozed", "archive", "drafts", "spam", "trash",
  ]);
  if (!allowed.has(folder as MailFolder | "all")) {
    throw new ApiError(400, "invalid_folder", "Mail folder is invalid");
  }
  return folder as MailFolder | "all";
}

function parseStateBody(value: unknown): MessageStatePatch {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "invalid_state", "Message state is invalid");
  }
  const input = value as StateBody;
  const allowed = new Set([
    "isRead", "isStarred", "isImportant", "archived", "snoozedUntil", "spam", "trashed",
  ]);
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    throw new ApiError(400, "invalid_state", "Message state contains unknown fields");
  }
  const output: MessageStatePatch = {};
  for (const key of ["isRead", "isStarred", "isImportant", "archived", "spam", "trashed"] as const) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== "boolean") {
      throw new ApiError(400, "invalid_state", `${key} must be true or false`);
    }
    output[key] = input[key] as boolean;
  }
  if (input.snoozedUntil !== undefined) {
    if (input.snoozedUntil === null) output.snoozedUntil = null;
    else if (typeof input.snoozedUntil === "string" && !Number.isNaN(Date.parse(input.snoozedUntil))) {
      output.snoozedUntil = new Date(input.snoozedUntil).toISOString();
    } else {
      throw new ApiError(400, "invalid_state", "snoozedUntil must be a timestamp or null");
    }
  }
  return output;
}

function parseMessageIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new ApiError(400, "invalid_message_ids", "Message IDs must be an array");
  }
  const ids = [...new Set(value)];
  if (
    ids.length === 0
    || ids.length > 50
    || ids.some((id) => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))
  ) {
    throw new ApiError(400, "invalid_message_ids", "Use 1 to 50 valid unique message IDs");
  }
  return ids as string[];
}

async function currentMailbox(env: MailEnv, ownerId: string): Promise<MailboxRecord> {
  const mailbox = await getMailboxByOwner(env, ownerId);
  if (!mailbox) throw new ApiError(404, "mailbox_not_found", "Register a mailbox first");
  if (mailbox.status !== "active") {
    throw new ApiError(403, "mailbox_inactive", "Mailbox is awaiting approval or suspended");
  }
  return mailbox;
}

async function attachmentResponse(
  request: Request,
  env: MailEnv,
  mailboxId: string,
  attachmentId: string,
): Promise<Response> {
  const attachment = await getAttachment(env, mailboxId, attachmentId);
  if (!attachment) throw new ApiError(404, "attachment_not_found", "Attachment was not found");
  const object = await env.MAIL_OBJECTS.get(attachment.object_key);
  if (!object) throw new ApiError(410, "attachment_missing", "Attachment content is unavailable");
  const headers = corsHeaders(request, env);
  headers.set("Content-Type", attachment.mime_type || "application/octet-stream");
  headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`);
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(object.body, { headers });
}

export async function routeMessageRequest(
  request: Request,
  env: MailEnv,
  ctx: ExecutionContext,
  user: AuthUser,
  path: string,
  url: URL,
): Promise<Response | null> {
  if (!path.startsWith("/v1/messages") && !path.startsWith("/v1/attachments")) {
    return null;
  }
  const mailbox = await currentMailbox(env, user.id);
  if (request.method === "GET" && path === "/v1/messages") {
    const messages = await listMessages(
      env,
      mailbox.id,
      parseFolder(url.searchParams.get("folder")),
      parseMessageCursor(url.searchParams.get("before")),
      51,
    );
    const page = messages.slice(0, 50);
    return json(request, env, {
      messages: page.map(serializeMessage),
      nextCursor: messages.length > 50 ? serializeMessageCursor(page.at(-1)) : null,
    });
  }
  if (request.method === "PATCH" && path === "/v1/messages/batch") {
    const body = (await readJson<BatchBody | null>(request)) ?? {};
    const messages = await updateMessagesState(
      env,
      mailbox.id,
      parseMessageIds(body.ids),
      parseStateBody(body.patch),
    );
    return json(request, env, { updated: messages.length });
  }
  if (request.method === "POST" && path === "/v1/messages/send") {
    const input = parseSendRequest(await readJson<unknown>(request));
    const queued = await queueOutboundMessage(
      env,
      mailbox,
      input,
      parseIdempotencyKey(request.headers.get("Idempotency-Key")),
    );
    ctx.waitUntil(writeAudit(env, {
      ownerId: user.id,
      action: "message.queue",
      targetId: queued.messageId,
      outcome: "allowed",
      metadata: { recipientCount: input.to.length + input.cc.length, created: queued.created },
    }));
    return json(request, env, {
      messageId: queued.messageId,
      status: queued.status,
      duplicate: !queued.created,
    }, queued.created ? 202 : 200);
  }
  const attachmentMatch = path.match(/^\/v1\/attachments\/([0-9a-f-]{36})$/i);
  if (request.method === "GET" && attachmentMatch) {
    return attachmentResponse(request, env, mailbox.id, attachmentMatch[1]);
  }
  const cancelMatch = path.match(/^\/v1\/messages\/([0-9a-f-]{36})\/cancel$/i);
  if (request.method === "POST" && cancelMatch) {
    await cancelOutboundMessage(env, mailbox.id, user.id, cancelMatch[1]);
    ctx.waitUntil(writeAudit(env, {
      ownerId: user.id,
      action: "message.cancel",
      targetId: cancelMatch[1],
      outcome: "allowed",
    }));
    return json(request, env, { cancelled: true });
  }
  const messageMatch = path.match(/^\/v1\/messages\/([0-9a-f-]{36})$/i);
  if (request.method === "GET" && messageMatch) {
    const message = await getMessage(env, mailbox.id, messageMatch[1]);
    if (!message) throw new ApiError(404, "message_not_found", "Message was not found");
    let viewed = message.is_read === 1
      ? message
      : await updateMessageState(env, mailbox.id, message.id, { isRead: true });
    const attachments = await listMessageAttachments(env, mailbox.id, message.id);
    viewed = await recoverInboundText(env, mailbox.id, viewed);
    return json(request, env, {
      message: serializeMessage(viewed),
      attachments: attachments.map((item) => ({
        ...item,
        downloadUrl: `/v1/attachments/${item.id}`,
      })),
    });
  }
  if (request.method === "PATCH" && messageMatch) {
    const message = await updateMessageState(
      env,
      mailbox.id,
      messageMatch[1],
      parseStateBody(await readJson<unknown>(request)),
    );
    return json(request, env, { message: serializeMessage(message) });
  }
  if (request.method === "DELETE" && messageMatch) {
    const result = await deleteTrashedMessage(env, mailbox.id, messageMatch[1]);
    ctx.waitUntil(cleanupObjectDeletionJobs(env));
    ctx.waitUntil(writeAudit(env, {
      ownerId: user.id,
      action: "message.delete",
      targetId: messageMatch[1],
      outcome: "allowed",
      metadata: result,
    }));
    return json(request, env, { deleted: true });
  }
  return null;
}
