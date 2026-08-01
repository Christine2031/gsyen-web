import PostalMime, { type Address, type Email } from "postal-mime";
import { readableMessageText } from "./messageText";
import { getMailboxByAddress } from "./repository";
import type { AttachmentInput, MailEnv, MailboxRecord } from "./types";
import {
  canonicalInboundAddress,
  MAX_RFC_MESSAGE_ID_LENGTH,
} from "./validation";

function flattenAddresses(values: Address[] | undefined): string[] {
  if (!values) return [];
  return values.flatMap((value) => {
    const group = "group" in value && Array.isArray(value.group) ? value.group : null;
    if (group) return group.map((member) => member.address.toLowerCase());
    const address = "address" in value ? value.address : undefined;
    return address ? [address.toLowerCase()] : [];
  });
}

function firstAddress(value: Address | undefined, fallback: string): string {
  if (!value) return fallback;
  const group = "group" in value && Array.isArray(value.group) ? value.group : null;
  if (group) return group[0]?.address.toLowerCase() ?? fallback;
  const address = "address" in value ? value.address : undefined;
  return address?.toLowerCase() ?? fallback;
}

function byteLength(value: ArrayBuffer | Uint8Array | string): number {
  if (typeof value === "string") return new TextEncoder().encode(value).byteLength;
  return value.byteLength;
}

async function stableInboundId(parsed: Email, raw: ArrayBuffer): Promise<string> {
  if (parsed.messageId) return parsed.messageId.slice(0, MAX_RFC_MESSAGE_ID_LENGTH);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", raw));
  const hex = [...digest].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}

function cleanFilename(value: string | null, index: number): string {
  const fallback = `attachment-${index + 1}`;
  if (!value) return fallback;
  const cleaned = value.replace(/[\u0000-\u001f\u007f/\\]/g, "_").trim();
  return cleaned.slice(0, 180) || fallback;
}

function attachmentInputs(parsed: Email): AttachmentInput[] {
  return parsed.attachments.slice(0, 32).map((attachment, index) => ({
    filename: cleanFilename(attachment.filename, index),
    mimeType: /^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+$/i.test(attachment.mimeType)
      ? attachment.mimeType.slice(0, 160)
      : "application/octet-stream",
    disposition: attachment.disposition === "inline" ? "inline" : "attachment",
    sizeBytes: byteLength(attachment.content),
    content: attachment.content,
  }));
}

async function inboundDuplicate(
  env: MailEnv,
  mailboxId: string,
  internetMessageId: string | null,
): Promise<boolean> {
  if (!internetMessageId) return false;
  const result = await env.DB.prepare(
    `SELECT 1 AS found FROM messages
      WHERE mailbox_id = ? AND internet_message_id = ? AND direction = 'inbound'
      LIMIT 1`,
  ).bind(mailboxId, internetMessageId).first<{ found: number }>();
  return result?.found === 1;
}

async function storeObjects(
  env: MailEnv,
  messageId: string,
  raw: ArrayBuffer,
  parsed: Email,
  attachments: AttachmentInput[],
): Promise<{
  rawKey: string;
  htmlKey: string | null;
  attachmentKeys: string[];
}> {
  const rawKey = `raw/${messageId}.eml`;
  const htmlKey = parsed.html ? `html/${messageId}.html` : null;
  const attachmentKeys = attachments.map(
    (_, index) => `attachments/${messageId}/${index}-${crypto.randomUUID()}`,
  );
  const completedKeys: string[] = [];
  try {
    await env.MAIL_OBJECTS.put(rawKey, raw, {
      httpMetadata: { contentType: "message/rfc822" },
    });
    completedKeys.push(rawKey);
    if (htmlKey && parsed.html) {
      await env.MAIL_OBJECTS.put(htmlKey, parsed.html, {
        httpMetadata: { contentType: "text/html; charset=utf-8" },
        customMetadata: { quarantine: "untrusted-email-html" },
      });
      completedKeys.push(htmlKey);
    }
    for (const [index, attachment] of attachments.entries()) {
      await env.MAIL_OBJECTS.put(attachmentKeys[index], attachment.content, {
        httpMetadata: { contentType: attachment.mimeType },
      });
      completedKeys.push(attachmentKeys[index]);
    }
  } catch (error) {
    await Promise.allSettled(completedKeys.map((key) => env.MAIL_OBJECTS.delete(key)));
    throw error;
  }
  return { rawKey, htmlKey, attachmentKeys };
}

async function persistInbound(
  env: MailEnv,
  mailbox: MailboxRecord,
  raw: ArrayBuffer,
  parsed: Email,
  envelopeFrom: string,
): Promise<void> {
  const messageId = crypto.randomUUID();
  const internetMessageId = await stableInboundId(parsed, raw);
  if (await inboundDuplicate(env, mailbox.id, internetMessageId)) return;
  const attachments = attachmentInputs(parsed);
  const objects = await storeObjects(env, messageId, raw, parsed, attachments);
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO messages
        (id, mailbox_id, direction, folder, internet_message_id, from_address,
         envelope_from_address, to_json, cc_json, subject, text_body,
         html_object_key, raw_object_key, in_reply_to, references_json, status, created_at, received_at)
       VALUES (?, ?, 'inbound', 'inbox', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'received', ?, ?)`,
    ).bind(
      messageId,
      mailbox.id,
      internetMessageId,
      firstAddress(parsed.from, envelopeFrom).slice(0, 254),
      envelopeFrom.slice(0, 254),
      JSON.stringify(flattenAddresses(parsed.to)),
      JSON.stringify(flattenAddresses(parsed.cc)),
      (parsed.subject ?? "").slice(0, 500),
      readableMessageText(parsed),
      objects.htmlKey,
      objects.rawKey,
      parsed.inReplyTo?.slice(0, MAX_RFC_MESSAGE_ID_LENGTH) ?? null,
      JSON.stringify(
        (parsed.references ?? "")
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 100)
          .map((value) => value.slice(0, MAX_RFC_MESSAGE_ID_LENGTH)),
      ),
      now,
      now,
    ),
  ];
  attachments.forEach((attachment, index) => {
    statements.push(env.DB.prepare(
      `INSERT INTO attachments
        (id, message_id, filename, mime_type, disposition, size_bytes, object_key)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      messageId,
      attachment.filename,
      attachment.mimeType,
      attachment.disposition,
      attachment.sizeBytes,
      objects.attachmentKeys[index],
    ));
  });
  statements.push(env.DB.prepare(
    `INSERT INTO message_sync_events(mailbox_id, message_id, operation, created_at)
     VALUES (?, ?, 'upsert', ?)`,
  ).bind(mailbox.id, messageId, now));  try {
    await env.DB.batch(statements);
  } catch (error) {
    await Promise.all([
      env.MAIL_OBJECTS.delete(objects.rawKey),
      ...(objects.htmlKey ? [env.MAIL_OBJECTS.delete(objects.htmlKey)] : []),
      ...objects.attachmentKeys.map((key) => env.MAIL_OBJECTS.delete(key)),
    ]);
    if (String(error).toLowerCase().includes("unique")) return;
    throw error;
  }
}

export async function receiveEmail(
  message: ForwardableEmailMessage,
  env: MailEnv,
): Promise<void> {
  const maxBytes = Number.parseInt(env.MAX_MESSAGE_BYTES, 10);
  if (!Number.isFinite(maxBytes) || message.rawSize > maxBytes) {
    message.setReject("Message exceeds the GSYEN Mail size limit");
    return;
  }
  const address = canonicalInboundAddress(
    message.to,
    env.MAIL_DOMAIN,
    env.INBOUND_DOMAINS,
  );
  if (!address) {
    message.setReject("Recipient domain is not accepted");
    return;
  }
  const mailbox = await getMailboxByAddress(env, address);
  if (!mailbox || mailbox.status !== "active") {
    message.setReject("Mailbox does not exist or is inactive");
    return;
  }
  const raw = await new Response(message.raw).arrayBuffer();
  if (raw.byteLength > maxBytes) {
    message.setReject("Message exceeds the GSYEN Mail size limit");
    return;
  }
  const parsed = await PostalMime.parse(raw, {
    attachmentEncoding: "arraybuffer",
    maxHeadersSize: 128_000,
    maxNestingDepth: 20,
  });
  await persistInbound(env, mailbox, raw, parsed, message.from.toLowerCase());
}
