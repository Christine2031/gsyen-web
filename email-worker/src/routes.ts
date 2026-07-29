import { requireAdmin, requireUser } from "./auth";
import { writeAudit } from "./audit";
import { ApiError, corsHeaders, json, readJson } from "./http";
import {
  addMailboxAlias,
  createMailbox,
  getAttachment,
  getMailboxByOwner,
  getMessage,
  listMailboxAddresses,
  listMessageAttachments,
  listMessages,
  queueOutboundMessage,
  updateMailboxStatus,
  updateMessageState,
} from "./repository";
import type { MessageStatePatch } from "./repositories/messages";
import type { MailEnv, MailFolder, MailboxRecord } from "./types";
import {
  normalizeDisplayName,
  normalizeLocalPart,
  parseIdempotencyKey,
  parseSendRequest,
} from "./validation";

type RegisterBody = { localPart?: unknown; displayName?: unknown };
type AdminStatusBody = { status?: unknown };
type AliasBody = { localPart?: unknown };
type StateBody = Record<string, unknown>;

function serializeMessage(message: NonNullable<Awaited<ReturnType<typeof getMessage>>>) {
  return {
    id: message.id,
    direction: message.direction,
    folder: message.folder,
    fromAddress: message.from_address,
    envelopeFrom: message.envelope_from_address,
    to: JSON.parse(message.to_json) as string[],
    cc: JSON.parse(message.cc_json) as string[],
    subject: message.subject,
    text: message.text_body,
    inReplyTo: message.in_reply_to,
    references: JSON.parse(message.references_json) as string[],
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
  };
}

async function serializeMailbox(env: MailEnv, mailbox: MailboxRecord | null) {
  if (!mailbox) return null;
  return {
    ...mailbox,
    addresses: await listMailboxAddresses(env, mailbox.id),
  };
}

function parseFolder(value: string | null): MailFolder {
  const folder = value ?? "inbox";
  const allowed = new Set<MailFolder>([
    "inbox", "sent", "outbox", "starred", "snoozed", "archive", "drafts", "spam", "trash",
  ]);
  if (!allowed.has(folder as MailFolder)) {
    throw new ApiError(400, "invalid_folder", "Mail folder is invalid");
  }
  return folder as MailFolder;
}

function parseBefore(value: string | null): string | undefined {
  if (!value) return undefined;
  if (value.length > 40 || Number.isNaN(Date.parse(value))) {
    throw new ApiError(400, "invalid_cursor", "Message cursor is invalid");
  }
  return new Date(value).toISOString();
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
    if (input[key] !== undefined) {
      if (typeof input[key] !== "boolean") {
        throw new ApiError(400, "invalid_state", `${key} must be true or false`);
      }
      output[key] = input[key] as boolean;
    }
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

async function currentMailbox(env: MailEnv, ownerId: string): Promise<MailboxRecord> {
  const mailbox = await getMailboxByOwner(env, ownerId);
  if (!mailbox) throw new ApiError(404, "mailbox_not_found", "Register a mailbox first");
  if (mailbox.status !== "active") {
    throw new ApiError(403, "mailbox_inactive", "Mailbox is awaiting approval or suspended");
  }
  return mailbox;
}

export async function routeRequest(
  request: Request,
  env: MailEnv,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }
  if (request.method === "GET" && path === "/health") {
    return json(request, env, { ok: true, service: "gsyen-mail", domain: env.MAIL_DOMAIN });
  }
  const user = await requireUser(request, env);

  if (request.method === "POST" && path === "/v1/mailboxes/register") {
    const body = await readJson<RegisterBody>(request);
    const mailbox = await createMailbox(env, {
      ownerId: user.id,
      localPart: normalizeLocalPart(body.localPart),
      displayName: normalizeDisplayName(body.displayName),
    });
    ctx.waitUntil(writeAudit(env, {
      ownerId: user.id,
      action: "mailbox.register",
      targetId: mailbox.id,
      outcome: "allowed",
      metadata: { status: mailbox.status },
    }));
    return json(request, env, { mailbox: await serializeMailbox(env, mailbox) }, 201);
  }

  if (request.method === "GET" && path === "/v1/mailboxes/me") {
    return json(request, env, {
      mailbox: await serializeMailbox(env, await getMailboxByOwner(env, user.id)),
    });
  }

  if (request.method === "GET" && path === "/v1/messages") {
    const mailbox = await currentMailbox(env, user.id);
    const folder = parseFolder(url.searchParams.get("folder"));
    const before = parseBefore(url.searchParams.get("before"));
    const messages = await listMessages(env, mailbox.id, folder, before);
    return json(request, env, {
      messages: messages.map(serializeMessage),
      nextCursor: messages.at(-1)?.created_at ?? null,
    });
  }

  const messageMatch = path.match(/^\/v1\/messages\/([0-9a-f-]{36})$/i);
  if (request.method === "GET" && messageMatch) {
    const mailbox = await currentMailbox(env, user.id);
    const message = await getMessage(env, mailbox.id, messageMatch[1]);
    if (!message) throw new ApiError(404, "message_not_found", "Message was not found");
    const viewed = message.is_read === 1
      ? message
      : await updateMessageState(env, mailbox.id, message.id, { isRead: true });
    const attachments = await listMessageAttachments(env, mailbox.id, message.id);
    return json(request, env, {
      message: serializeMessage(viewed),
      attachments: attachments.map((item) => ({
        ...item,
        downloadUrl: `/v1/attachments/${item.id}`,
      })),
    });
  }

  if (request.method === "PATCH" && messageMatch) {
    const mailbox = await currentMailbox(env, user.id);
    const message = await updateMessageState(
      env,
      mailbox.id,
      messageMatch[1],
      parseStateBody(await readJson<unknown>(request)),
    );
    return json(request, env, { message: serializeMessage(message) });
  }

  const attachmentMatch = path.match(/^\/v1\/attachments\/([0-9a-f-]{36})$/i);
  if (request.method === "GET" && attachmentMatch) {
    const mailbox = await currentMailbox(env, user.id);
    const attachment = await getAttachment(env, mailbox.id, attachmentMatch[1]);
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

  if (request.method === "POST" && path === "/v1/messages/send") {
    const mailbox = await currentMailbox(env, user.id);
    const input = parseSendRequest(await readJson<unknown>(request));
    const idempotencyKey = parseIdempotencyKey(request.headers.get("Idempotency-Key"));
    const queued = await queueOutboundMessage(env, mailbox, input, idempotencyKey);
    ctx.waitUntil(writeAudit(env, {
      ownerId: user.id,
      action: "message.queue",
      targetId: queued.messageId,
      outcome: "allowed",
      metadata: { recipientCount: input.to.length + input.cc.length, created: queued.created },
    }));
    return json(request, env, {
      messageId: queued.messageId,
      status: "queued",
      duplicate: !queued.created,
    }, queued.created ? 202 : 200);
  }

  const adminMatch = path.match(/^\/v1\/admin\/mailboxes\/([0-9a-f-]{36})\/status$/i);
  if (request.method === "POST" && adminMatch) {
    requireAdmin(user);
    const body = await readJson<AdminStatusBody>(request);
    if (body.status !== "active" && body.status !== "suspended") {
      throw new ApiError(400, "invalid_status", "Status must be active or suspended");
    }
    const mailbox = await updateMailboxStatus(env, adminMatch[1], body.status);
    await writeAudit(env, {
      ownerId: user.id,
      action: `mailbox.${body.status}`,
      targetId: mailbox.id,
      outcome: "allowed",
    });
    return json(request, env, { mailbox: await serializeMailbox(env, mailbox) });
  }

  const aliasMatch = path.match(/^\/v1\/admin\/mailboxes\/([0-9a-f-]{36})\/aliases$/i);
  if (request.method === "POST" && aliasMatch) {
    requireAdmin(user);
    const body = await readJson<AliasBody>(request);
    const alias = await addMailboxAlias(env, aliasMatch[1], normalizeLocalPart(body.localPart));
    await writeAudit(env, {
      ownerId: user.id,
      action: "mailbox.alias.add",
      targetId: alias.mailbox_id,
      outcome: "allowed",
      metadata: { address: alias.address },
    });
    return json(request, env, { alias }, 201);
  }

  throw new ApiError(404, "not_found", "Route was not found");
}
