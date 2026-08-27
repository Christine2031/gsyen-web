import PostalMime, { type Address, type Email } from "postal-mime";
import { readableMessageText } from "./messageText";
import {
  deriveStalwartMirrorDeliveryId,
} from "./stalwartMirror";
import { getMailboxByAddress } from "./repositories/mailboxes";
import type {
  AttachmentInput,
  InboundExtractionStatus,
  InboundIngestReceiptStatus,
  InboundObjectManifest,
  MailEnv,
  MailboxRecord,
  StalwartMirrorJob,
} from "./types";
import {
  canonicalInboundAddress,
  MAX_RFC_MESSAGE_ID_LENGTH,
} from "./validation";

export const INBOUND_RELEASE_CONTRACT_MARKER =
  "gsyen-inbound-receipt-v2-compatible";
const INBOUND_EXPAND_SCHEMA_MARKER = "gsyen-inbound-receipt-v2-expand-0021";
const INBOUND_CONTRACT_SCHEMA_MARKER = "gsyen-inbound-receipt-v2-contract-0022";
export const INBOUND_EXTRACTION_CHUNK_SIZE = 30;
export const INBOUND_MAX_D1_QUERY_BUDGET = 50;
export const INBOUND_PRIMARY_D1_QUERY_OVERHEAD = 14;
export const INBOUND_POST_BATCH_FAILURE_D1_QUERIES = 2;
export const INBOUND_MAX_R2_OPERATION_BUDGET = 64;
export const INBOUND_INGEST_RECONCILE_AFTER_MS = 15 * 60_000;

const INBOUND_SCHEMA_MIGRATION = "0022_inbound_identity_contract.sql";
const MAX_AUTOMATIC_ATTACHMENTS = 256;
const EXTRACTION_LEASE_MS = 5 * 60_000;
const EXTRACTION_MAX_ATTEMPTS = 8;
const RAW_INTEGRITY_CONFIRM_ATTEMPTS = 2;
const EXTRACTION_RETRY_BASE_MS = 60_000;
const EXTRACTION_RETRY_MAX_MS = 6 * 60 * 60_000;
const DEFAULT_MAX_MESSAGE_BYTES = 5 * 1024 * 1024;
const R2_WRITE_CONCURRENCY = 6;

type PersistedInbound = {
  messageId: string;
  rawObjectKey: string;
  rawSha256: string;
  envelopeFrom: string;
};

type InboundEnvelope = {
  envelopeFrom: string;
  envelopeTo: string;
  mailboxLookupAddress: string;
  deliveryTargetAddress: string;
};

type IngestReceiptRow = {
  id: string;
  idempotency_key: string;
  message_id: string;
  mailbox_id: string;
  raw_sha256: string;
  envelope_to_address: string;
  mailbox_lookup_address: string;
  delivery_target_address: string;
  envelope_from_address: string;
  internet_message_id: string | null;
  raw_object_key: string;
  object_manifest_json: string;
  status: InboundIngestReceiptStatus;
  raw_size_bytes: number | null;
  raw_verified_at: string | null;
  extraction_status: InboundExtractionStatus;
  attachment_total_count: number;
  extracted_attachment_count: number;
  extraction_attempts: number;
  extraction_lease_token: string | null;
  extraction_lease_expires_at: string | null;
  next_extraction_attempt_at: string | null;
  deleted_at: string | null;
};

type ExtractionOutcome =
  | "completed"
  | "pending"
  | "terminal"
  | "skipped";

type InboundSchemaPhase = "expand" | "contract";

class RawObjectPermanentError extends Error {
  readonly reasonCode: "raw_object_missing" | "raw_object_integrity_mismatch";

  constructor(reasonCode: RawObjectPermanentError["reasonCode"]) {
    super(reasonCode);
    this.name = "RawObjectPermanentError";
    this.reasonCode = reasonCode;
  }
}

export type InboundRecoveryResult = {
  inspected: number;
  committed: number;
  completed: number;
  pending: number;
  terminal: number;
  mirrorBackfilled: number;
};

const RECEIPT_COLUMNS = `
  id, idempotency_key, message_id, mailbox_id, raw_sha256,
  envelope_to_address, mailbox_lookup_address, delivery_target_address,
  envelope_from_address, internet_message_id, raw_object_key,
  object_manifest_json, status, raw_size_bytes, raw_verified_at,
  extraction_status, attachment_total_count, extracted_attachment_count,
  extraction_attempts, extraction_lease_token, extraction_lease_expires_at,
  next_extraction_attempt_at, deleted_at
`;

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

async function sha256Hex(value: BufferSource): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", value));
  return [...digest]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function attachmentContent(
  value: ArrayBuffer | Uint8Array | string,
): ArrayBuffer | Uint8Array {
  return typeof value === "string" ? new TextEncoder().encode(value) : value;
}

function cleanFilename(value: string | null, index: number): string {
  const fallback = `attachment-${index + 1}`;
  if (!value) return fallback;
  const cleaned = value.replace(/[\u0000-\u001f\u007f/\\]/g, "_").trim();
  return cleaned.slice(0, 180) || fallback;
}

async function attachmentInputs(parsed: Email): Promise<AttachmentInput[]> {
  return Promise.all(parsed.attachments.map(async (attachment, index) => ({
    filename: cleanFilename(attachment.filename, index),
    mimeType: /^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+$/i.test(attachment.mimeType)
      ? attachment.mimeType.slice(0, 160)
      : "application/octet-stream",
    disposition: attachment.disposition === "inline" ? "inline" : "attachment",
    sizeBytes: byteLength(attachment.content),
    sha256: await sha256Hex(attachmentContent(attachment.content)),
    content: attachment.content,
  })));
}

function maxMessageBytes(env: MailEnv): number {
  const configured = Number.parseInt(env.MAX_MESSAGE_BYTES, 10);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_MAX_MESSAGE_BYTES;
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

function isLegacyMessageIdConflict(error: unknown): boolean {
  const detail = safeError(error);
  return /UNIQUE constraint failed: messages\.mailbox_id, messages\.internet_message_id/i
    .test(detail)
    || detail.includes("messages_inbound_dedupe");
}

function retryAt(attempt: number): string {
  const delay = Math.min(
    EXTRACTION_RETRY_MAX_MS,
    EXTRACTION_RETRY_BASE_MS * (2 ** Math.min(Math.max(0, attempt - 1), 10)),
  );
  return new Date(Date.now() + delay).toISOString();
}

function sanitizedEnvelopeAddress(value: string, allowEmpty: boolean): string | null {
  if (allowEmpty && value === "") return "";
  if (
    !value
    || value.length > 254
    || value !== value.trim()
    || /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return null;
  }
  return value;
}

function internetMessageId(parsed: Email | null): string | null {
  return parsed?.messageId?.slice(0, MAX_RFC_MESSAGE_ID_LENGTH) ?? null;
}

function internetMessageIdFromRawHeaders(raw: ArrayBuffer): string | null {
  const bytes = new Uint8Array(raw, 0, Math.min(raw.byteLength, 128_000));
  const source = new TextDecoder().decode(bytes);
  const headerEnd = source.search(/\r?\n\r?\n/);
  const headerBlock = headerEnd >= 0 ? source.slice(0, headerEnd) : source;
  const unfolded = headerBlock.replace(/\r?\n[ \t]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const match = line.match(/^message-id[ \t]*:[ \t]*(.*)$/i);
    if (!match) continue;
    const value = match[1].trim();
    return value ? value.slice(0, MAX_RFC_MESSAGE_ID_LENGTH) : null;
  }
  return null;
}

function rawOnlyManifest(messageId: string): InboundObjectManifest {
  return {
    rawKey: `raw/${messageId}.eml`,
    htmlKey: null,
    attachmentKeys: [],
    attachmentSha256: [],
  };
}

function parseObjectManifest(
  value: string,
  receipt: Pick<IngestReceiptRow, "message_id" | "raw_object_key">,
): InboundObjectManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("invalid_object_manifest");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("invalid_object_manifest");
  }
  const candidate = parsed as Record<string, unknown>;
  const attachmentPrefix = `attachments/${receipt.message_id}/`;
  if (
    candidate.rawKey !== receipt.raw_object_key
    || candidate.rawKey !== `raw/${receipt.message_id}.eml`
    || (
      candidate.htmlKey !== null
      && candidate.htmlKey !== `html/${receipt.message_id}.html`
    )
    || !Array.isArray(candidate.attachmentKeys)
    || !Array.isArray(candidate.attachmentSha256)
    || candidate.attachmentKeys.length > MAX_AUTOMATIC_ATTACHMENTS
    || candidate.attachmentKeys.length !== candidate.attachmentSha256.length
    || !candidate.attachmentKeys.every((key, index) => (
      typeof key === "string"
      && key.startsWith(`${attachmentPrefix}${index}-`)
      && key.length <= attachmentPrefix.length + 80
    ))
    || !candidate.attachmentSha256.every((hash) => (
      typeof hash === "string" && /^[0-9a-f]{64}$/.test(hash)
    ))
    || new Set(candidate.attachmentKeys).size !== candidate.attachmentKeys.length
  ) {
    throw new Error("invalid_object_manifest");
  }
  return {
    rawKey: candidate.rawKey,
    htmlKey: candidate.htmlKey as string | null,
    attachmentKeys: candidate.attachmentKeys as string[],
    attachmentSha256: candidate.attachmentSha256 as string[],
  };
}

function derivedObjectManifest(
  receipt: IngestReceiptRow,
  parsed: Email,
  attachments: AttachmentInput[],
): InboundObjectManifest {
  return {
    rawKey: receipt.raw_object_key,
    htmlKey: parsed.html ? `html/${receipt.message_id}.html` : null,
    attachmentKeys: attachments.map(
      (attachment, index) => (
        `attachments/${receipt.message_id}/${index}-${attachment.sha256.slice(0, 32)}`
      ),
    ),
    attachmentSha256: attachments.map((attachment) => attachment.sha256),
  };
}

function extractionManifest(
  receipt: IngestReceiptRow,
  parsed: Email,
  attachments: AttachmentInput[],
): InboundObjectManifest {
  const current = parseObjectManifest(receipt.object_manifest_json, receipt);
  const derived = derivedObjectManifest(receipt, parsed, attachments);
  const currentIsRawOnly = current.htmlKey === null
    && current.attachmentKeys.length === 0
    && current.attachmentSha256.length === 0;
  if (currentIsRawOnly) return derived;
  const exact = current.htmlKey === derived.htmlKey
    && current.attachmentKeys.length === attachments.length
    && current.attachmentSha256.every(
      (hash, index) => hash === attachments[index]?.sha256,
    );
  if (!exact) throw new Error("object_manifest_mime_mismatch");
  return current;
}

async function deterministicAttachmentId(
  messageId: string,
  index: number,
  hash: string,
): Promise<string> {
  const value = await sha256Hex(new TextEncoder().encode(
    `${messageId}\u0000${index}\u0000${hash}`,
  ));
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-4${value.slice(13, 16)}-${(
    (Number.parseInt(value[16], 16) & 0x3) | 0x8
  ).toString(16)}${value.slice(17, 20)}-${value.slice(20, 32)}`;
}

async function inboundIdempotencyKey(
  rawSha256: string,
  envelope: InboundEnvelope,
): Promise<string> {
  return sha256Hex(new TextEncoder().encode([
    rawSha256,
    envelope.envelopeTo,
    envelope.deliveryTargetAddress,
    envelope.envelopeFrom,
  ].join("\u0000")));
}

function receiptMatches(
  receipt: IngestReceiptRow,
  mailbox: MailboxRecord,
  rawSha256: string,
  envelope: InboundEnvelope,
): boolean {
  return receipt.mailbox_id === mailbox.id
    && receipt.raw_sha256 === rawSha256
    && receipt.envelope_to_address === envelope.envelopeTo
    && receipt.mailbox_lookup_address === envelope.mailboxLookupAddress
    && receipt.delivery_target_address === envelope.deliveryTargetAddress
    && receipt.envelope_from_address === envelope.envelopeFrom;
}

async function loadReceiptByKey(
  env: MailEnv,
  idempotencyKey: string,
): Promise<IngestReceiptRow | null> {
  return env.DB.withSession("first-primary").prepare(
    `SELECT ${RECEIPT_COLUMNS}
       FROM inbound_ingest_receipts WHERE idempotency_key = ?`,
  ).bind(idempotencyKey).first<IngestReceiptRow>();
}

async function loadReceiptById(
  env: MailEnv,
  receiptId: string,
): Promise<IngestReceiptRow | null> {
  return env.DB.withSession("first-primary").prepare(
    `SELECT ${RECEIPT_COLUMNS}
       FROM inbound_ingest_receipts WHERE id = ?`,
  ).bind(receiptId).first<IngestReceiptRow>();
}

async function stageInbound(
  env: MailEnv,
  mailbox: MailboxRecord,
  rawSha256: string,
  envelope: InboundEnvelope,
): Promise<IngestReceiptRow> {
  const idempotencyKey = await inboundIdempotencyKey(rawSha256, envelope);
  const existing = await loadReceiptByKey(env, idempotencyKey);
  if (existing) {
    if (!receiptMatches(existing, mailbox, rawSha256, envelope)) {
      throw new Error("inbound_ingest_idempotency_identity_collision");
    }
    return existing;
  }

  const receiptId = crypto.randomUUID();
  const messageId = crypto.randomUUID();
  const manifest = rawOnlyManifest(messageId);
  const now = new Date().toISOString();
  try {
    await env.DB.prepare(
      `INSERT INTO inbound_ingest_receipts
        (id, idempotency_key, message_id, mailbox_id, raw_sha256,
         envelope_to_address, mailbox_lookup_address, delivery_target_address,
         envelope_from_address, internet_message_id, raw_object_key,
         object_manifest_json, status, created_at, updated_at,
         next_extraction_attempt_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 'staging', ?, ?, ?)`,
    ).bind(
      receiptId,
      idempotencyKey,
      messageId,
      mailbox.id,
      rawSha256,
      envelope.envelopeTo,
      envelope.mailboxLookupAddress,
      envelope.deliveryTargetAddress,
      envelope.envelopeFrom,
      manifest.rawKey,
      JSON.stringify(manifest),
      now,
      now,
      now,
    ).run();
  } catch (error) {
    const raced = await loadReceiptByKey(env, idempotencyKey);
    if (!raced) throw error;
    if (!receiptMatches(raced, mailbox, rawSha256, envelope)) {
      throw new Error("inbound_ingest_idempotency_identity_collision");
    }
    return raced;
  }
  return {
    id: receiptId,
    idempotency_key: idempotencyKey,
    message_id: messageId,
    mailbox_id: mailbox.id,
    raw_sha256: rawSha256,
    envelope_to_address: envelope.envelopeTo,
    mailbox_lookup_address: envelope.mailboxLookupAddress,
    delivery_target_address: envelope.deliveryTargetAddress,
    envelope_from_address: envelope.envelopeFrom,
    internet_message_id: null,
    raw_object_key: manifest.rawKey,
    object_manifest_json: JSON.stringify(manifest),
    status: "staging",
    raw_size_bytes: null,
    raw_verified_at: null,
    extraction_status: "pending",
    attachment_total_count: 0,
    extracted_attachment_count: 0,
    extraction_attempts: 0,
    extraction_lease_token: null,
    extraction_lease_expires_at: null,
    next_extraction_attempt_at: now,
    deleted_at: null,
  };
}

async function markReceiptForRecovery(
  env: MailEnv,
  receiptId: string,
  error: unknown,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE inbound_ingest_receipts
          SET status = CASE WHEN status = 'committed' THEN status ELSE 'reconcile_needed' END,
              extraction_status = CASE
                WHEN extraction_status = 'terminal' THEN extraction_status
                ELSE 'pending'
              END,
              extraction_lease_token = NULL,
              extraction_lease_expires_at = NULL,
              next_extraction_attempt_at = ?, extraction_last_error = ?,
              last_error = CASE WHEN status = 'committed' THEN last_error ELSE ? END,
              updated_at = ?, reconciled_at = ?
        WHERE id = ? AND deleted_at IS NULL`,
    ).bind(
      now,
      safeError(error),
      safeError(error),
      now,
      now,
      receiptId,
    ).run();
  } catch (statusError) {
    console.error(JSON.stringify({
      event: "inbound_ingest_receipt_status_update_failed",
      receiptId,
      error: safeError(statusError),
    }));
  }
}

async function storeAndVerifyRaw(
  env: MailEnv,
  receipt: IngestReceiptRow,
  raw: ArrayBuffer,
): Promise<ArrayBuffer> {
  try {
    await env.MAIL_OBJECTS.put(receipt.raw_object_key, raw, {
      httpMetadata: { contentType: "message/rfc822" },
      customMetadata: {
        sha256: receipt.raw_sha256,
        ingestReceiptId: receipt.id,
      },
    });
    const stored = await env.MAIL_OBJECTS.get(receipt.raw_object_key);
    if (!stored) throw new Error("raw_object_missing_after_write");
    if (
      stored.size !== raw.byteLength
      || stored.size > maxMessageBytes(env)
      || stored.customMetadata?.sha256 !== receipt.raw_sha256
      || stored.customMetadata?.ingestReceiptId !== receipt.id
    ) {
      throw new Error("raw_object_metadata_mismatch_after_write");
    }
    const verified = await stored.arrayBuffer();
    if (await sha256Hex(verified) !== receipt.raw_sha256) {
      throw new Error("raw_object_hash_mismatch_after_write");
    }
    const now = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE inbound_ingest_receipts
          SET status = 'objects_written', raw_size_bytes = ?, raw_verified_at = ?,
              last_error = NULL, updated_at = ?
        WHERE id = ? AND status <> 'committed' AND deleted_at IS NULL`,
    ).bind(verified.byteLength, now, now, receipt.id).run();
    return verified;
  } catch (error) {
    await markReceiptForRecovery(env, receipt.id, error);
    throw error;
  }
}

async function loadVerifiedRaw(
  env: MailEnv,
  receipt: IngestReceiptRow,
  alreadyVerified?: ArrayBuffer,
): Promise<ArrayBuffer> {
  if (alreadyVerified) {
    if (
      alreadyVerified.byteLength > maxMessageBytes(env)
      || await sha256Hex(alreadyVerified) !== receipt.raw_sha256
    ) {
      throw new Error("provided_raw_integrity_mismatch");
    }
    return alreadyVerified;
  }
  const stored = await env.MAIL_OBJECTS.get(receipt.raw_object_key);
  if (!stored) throw new RawObjectPermanentError("raw_object_missing");
  if (
    stored.size > maxMessageBytes(env)
    || (receipt.raw_size_bytes !== null && stored.size !== receipt.raw_size_bytes)
    || stored.customMetadata?.sha256 !== receipt.raw_sha256
    || stored.customMetadata?.ingestReceiptId !== receipt.id
  ) {
    throw new RawObjectPermanentError("raw_object_integrity_mismatch");
  }
  const raw = await stored.arrayBuffer();
  if (await sha256Hex(raw) !== receipt.raw_sha256) {
    throw new RawObjectPermanentError("raw_object_integrity_mismatch");
  }
  return raw;
}

async function parseRaw(raw: ArrayBuffer): Promise<Email | null> {
  try {
    return await PostalMime.parse(raw, {
      attachmentEncoding: "arraybuffer",
      maxHeadersSize: 128_000,
      maxNestingDepth: 20,
    });
  } catch {
    return null;
  }
}

function messageValues(
  parsed: Email | null,
  receipt: IngestReceiptRow,
  fallbackInternetMessageId: string | null = null,
) {
  return {
    internetMessageId: internetMessageId(parsed) ?? fallbackInternetMessageId,
    fromAddress: parsed
      ? firstAddress(parsed.from, receipt.envelope_from_address).slice(0, 254)
      : receipt.envelope_from_address.slice(0, 254),
    toJson: JSON.stringify(flattenAddresses(parsed?.to)),
    ccJson: JSON.stringify(flattenAddresses(parsed?.cc)),
    subject: (parsed?.subject ?? "").slice(0, 500),
    textBody: parsed ? readableMessageText(parsed) : "",
    inReplyTo: parsed?.inReplyTo?.slice(0, MAX_RFC_MESSAGE_ID_LENGTH) ?? null,
    referencesJson: JSON.stringify(
      (parsed?.references ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 100)
        .map((value) => value.slice(0, MAX_RFC_MESSAGE_ID_LENGTH)),
    ),
  };
}

function mirrorJob(receipt: IngestReceiptRow, deliveryId: string): StalwartMirrorJob {
  return {
    kind: "stalwart_mirror",
    messageId: receipt.message_id,
    rawObjectKey: receipt.raw_object_key,
    rawSha256: receipt.raw_sha256,
    deliveryId,
    envelopeFrom: receipt.envelope_from_address,
    recipient: receipt.delivery_target_address,
  };
}

async function mirrorOutboxStatement(
  env: MailEnv,
  receipt: IngestReceiptRow,
  now: string,
): Promise<D1PreparedStatement | null> {
  const deliveryId = await deriveStalwartMirrorDeliveryId(
    receipt.message_id,
    receipt.delivery_target_address,
    receipt.raw_sha256,
  );
  const job = mirrorJob(receipt, deliveryId);
  // Capture is unconditional. STALWART_MIRROR_ENABLED is a delivery kill
  // switch enforced by the drain/Queue/HTTP path, never a persistence switch.
  return env.DB.prepare(
    `INSERT INTO stalwart_mirror_outbox
      (idempotency_key, message_id, raw_object_key, delivery_id, payload_json,
       status, attempts, next_attempt_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)
     ON CONFLICT(idempotency_key) DO NOTHING`,
  ).bind(
    job.messageId,
    job.messageId,
    job.rawObjectKey,
    job.deliveryId,
    JSON.stringify(job),
    now,
    now,
    now,
  );
}

function interventionStatement(
  env: MailEnv,
  receipt: IngestReceiptRow,
  reasonCode: string,
  now: string,
): D1PreparedStatement {
  const controlledReason = /^[a-z0-9_:-]{1,100}$/.test(reasonCode)
    ? reasonCode
    : "unclassified_inbound_terminal";
  return env.DB.prepare(
    `INSERT INTO inbound_manual_interventions
      (id, receipt_id, message_id, reason_code, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'open', ?, ?)
     ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`,
  ).bind(
    `receipt:${receipt.id}:${controlledReason}`,
    receipt.id,
    receipt.message_id,
    controlledReason,
    now,
    now,
  );
}

function leasedInterventionStatement(
  env: MailEnv,
  receipt: IngestReceiptRow,
  leaseToken: string,
  reasonCode: string,
  now: string,
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO inbound_manual_interventions
      (id, receipt_id, message_id, reason_code, status, created_at, updated_at)
     SELECT ?, ?, ?, ?, 'open', ?, ?
      WHERE EXISTS (
        SELECT 1 FROM inbound_ingest_receipts
         WHERE id = ? AND extraction_status = 'leased'
           AND extraction_lease_token = ? AND deleted_at IS NULL
      )
     ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`,
  ).bind(
    `receipt:${receipt.id}:${reasonCode}`,
    receipt.id,
    receipt.message_id,
    reasonCode,
    now,
    now,
    receipt.id,
    leaseToken,
  );
}

async function terminalizeLegacyIdentityAmbiguity(
  env: MailEnv,
  receipt: IngestReceiptRow,
): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE inbound_ingest_receipts
          SET status = 'reconcile_needed', extraction_status = 'terminal',
              extraction_lease_token = NULL, extraction_lease_expires_at = NULL,
              next_extraction_attempt_at = NULL,
              extraction_last_error = 'legacy_identity_ambiguous',
              extraction_terminal_at = ?, last_error = 'legacy_identity_ambiguous',
              updated_at = ?, reconciled_at = ?
        WHERE id = ? AND status <> 'committed' AND deleted_at IS NULL`,
    ).bind(now, now, now, receipt.id),
    interventionStatement(env, receipt, "legacy_identity_ambiguous", now),
  ]);
  console.error(JSON.stringify({
    event: "inbound_legacy_identity_ambiguous",
    receiptId: receipt.id,
  }));
}

function persistedFromReceipt(receipt: IngestReceiptRow): PersistedInbound {
  return {
    messageId: receipt.message_id,
    rawObjectKey: receipt.raw_object_key,
    rawSha256: receipt.raw_sha256,
    envelopeFrom: receipt.envelope_from_address,
  };
}

async function resolveCommittedInbound(
  env: MailEnv,
  receipt: IngestReceiptRow,
): Promise<PersistedInbound | null> {
  const resolved = await env.DB.withSession("first-primary").prepare(
    `SELECT r.status, r.deleted_at, m.id, m.raw_object_key, m.raw_sha256,
            m.envelope_from_address, m.envelope_to_address,
            m.mailbox_lookup_address, m.delivery_target_address
       FROM inbound_ingest_receipts AS r
       LEFT JOIN messages AS m ON m.ingest_receipt_id = r.id
      WHERE r.id = ?`,
  ).bind(receipt.id).first<{
    status: InboundIngestReceiptStatus;
    deleted_at: string | null;
    id: string | null;
    raw_object_key: string | null;
    raw_sha256: string | null;
    envelope_from_address: string | null;
    envelope_to_address: string | null;
    mailbox_lookup_address: string | null;
    delivery_target_address: string | null;
  }>();
  if (resolved?.status !== "committed") return null;
  if (resolved.deleted_at !== null && resolved.id === null) {
    return persistedFromReceipt(receipt);
  }
  if (
    resolved.id !== receipt.message_id
    || resolved.raw_object_key !== receipt.raw_object_key
    || resolved.raw_sha256 !== receipt.raw_sha256
    || resolved.envelope_from_address !== receipt.envelope_from_address
    || resolved.envelope_to_address !== receipt.envelope_to_address
    || resolved.mailbox_lookup_address !== receipt.mailbox_lookup_address
    || resolved.delivery_target_address !== receipt.delivery_target_address
  ) {
    return null;
  }
  return persistedFromReceipt(receipt);
}

async function commitPrimaryRecord(
  env: MailEnv,
  receipt: IngestReceiptRow,
  headerInternetMessageId: string | null,
  schemaPhase: InboundSchemaPhase,
): Promise<PersistedInbound> {
  const values = messageValues(null, receipt, headerInternetMessageId);
  const attachmentTotal = 0;
  const extractionStatus: InboundExtractionStatus =
    receipt.extraction_status === "leased" ? "leased" : "pending";
  const terminalReason = null;
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO messages
        (id, mailbox_id, direction, folder, internet_message_id, from_address,
         envelope_from_address, to_json, cc_json, subject, text_body,
         html_object_key, raw_object_key, raw_sha256, ingest_receipt_id,
         envelope_to_address, mailbox_lookup_address, delivery_target_address,
         in_reply_to, references_json, status, created_at, received_at,
         extraction_status, attachment_total_count, extraction_error_code)
       VALUES (?, ?, 'inbound', 'inbox', ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?,
         ?, ?, ?, ?, ?, 'received', ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    ).bind(
      receipt.message_id,
      receipt.mailbox_id,
      values.internetMessageId,
      values.fromAddress,
      receipt.envelope_from_address,
      values.toJson,
      values.ccJson,
      values.subject,
      values.textBody,
      receipt.raw_object_key,
      receipt.raw_sha256,
      receipt.id,
      receipt.envelope_to_address,
      receipt.mailbox_lookup_address,
      receipt.delivery_target_address,
      values.inReplyTo,
      values.referencesJson,
      now,
      now,
      extractionStatus,
      attachmentTotal,
      terminalReason,
    ),
  ];
  const mirror = await mirrorOutboxStatement(env, receipt, now);
  if (mirror) statements.push(mirror);
  statements.push(env.DB.prepare(
    `UPDATE inbound_ingest_receipts
        SET status = 'committed', internet_message_id = ?,
            attachment_total_count = ?,
            extraction_status = ?, extraction_last_error = ?,
            extraction_terminal_at = CASE WHEN ? IS NULL
              THEN extraction_terminal_at ELSE ? END,
            extraction_lease_token = CASE WHEN ? = 'terminal'
              THEN NULL ELSE extraction_lease_token END,
            extraction_lease_expires_at = CASE WHEN ? = 'terminal'
              THEN NULL ELSE extraction_lease_expires_at END,
            next_extraction_attempt_at = CASE WHEN ? = 'terminal'
              THEN NULL ELSE ? END,
            last_error = NULL, updated_at = ?, finalized_at = ?, reconciled_at = ?
      WHERE id = ? AND message_id = ? AND raw_sha256 = ?
        AND status IN ('staging', 'objects_written', 'reconcile_needed')
        AND raw_verified_at IS NOT NULL AND deleted_at IS NULL`,
  ).bind(
    values.internetMessageId,
    attachmentTotal,
    extractionStatus,
    terminalReason,
    terminalReason,
    now,
    extractionStatus,
    extractionStatus,
    extractionStatus,
    now,
    now,
    now,
    now,
    receipt.id,
    receipt.message_id,
    receipt.raw_sha256,
  ));
  if (terminalReason) {
    statements.push(interventionStatement(env, receipt, terminalReason, now));
  }
  try {
    await env.DB.batch(statements);
  } catch (error) {
    const resolved = await resolveCommittedInbound(env, receipt);
    if (resolved) return resolved;
    if (schemaPhase === "expand" && isLegacyMessageIdConflict(error)) {
      await terminalizeLegacyIdentityAmbiguity(env, receipt);
      throw new Error("legacy_identity_ambiguous");
    }
    await markReceiptForRecovery(env, receipt.id, error);
    throw error;
  }
  const resolved = await resolveCommittedInbound(env, receipt);
  if (resolved) return resolved;
  const error = new Error("inbound_primary_commit_not_verified");
  await markReceiptForRecovery(env, receipt.id, error);
  throw error;
}

async function ensureMirrorOutbox(
  env: MailEnv,
  receipt: IngestReceiptRow,
): Promise<boolean> {
  if (receipt.deleted_at !== null) return false;
  const statement = await mirrorOutboxStatement(env, receipt, new Date().toISOString());
  if (!statement) return false;
  const result = await statement.run();
  return result.meta.changes === 1;
}

async function terminalizeReceipt(
  env: MailEnv,
  receipt: IngestReceiptRow,
  leaseToken: string,
  reasonCode: string,
  attachmentTotalCount?: number,
): Promise<void> {
  const now = new Date().toISOString();
  const results = await env.DB.batch([
    env.DB.prepare(
      `UPDATE messages
          SET extraction_status = 'terminal', extraction_error_code = ?,
              attachment_total_count = COALESCE(?, attachment_total_count)
        WHERE ingest_receipt_id = ?
          AND EXISTS (
            SELECT 1 FROM inbound_ingest_receipts
             WHERE id = ? AND extraction_status = 'leased'
               AND extraction_lease_token = ? AND deleted_at IS NULL
          )`,
    ).bind(
      reasonCode,
      attachmentTotalCount ?? null,
      receipt.id,
      receipt.id,
      leaseToken,
    ),
    leasedInterventionStatement(env, receipt, leaseToken, reasonCode, now),
    env.DB.prepare(
      `UPDATE inbound_ingest_receipts
          SET extraction_status = 'terminal', extraction_lease_token = NULL,
              extraction_lease_expires_at = NULL,
              next_extraction_attempt_at = NULL,
              extraction_last_error = ?, extraction_terminal_at = ?,
              attachment_total_count = COALESCE(?, attachment_total_count),
              updated_at = ?, reconciled_at = ?
        WHERE id = ? AND extraction_status = 'leased'
          AND extraction_lease_token = ? AND deleted_at IS NULL`,
    ).bind(
      reasonCode,
      now,
      attachmentTotalCount ?? null,
      now,
      now,
      receipt.id,
      leaseToken,
    ),
  ]);
  if (results.at(-1)?.meta.changes !== 1) return;
  console.error(JSON.stringify({
    event: "inbound_extraction_terminal",
    receiptId: receipt.id,
    reasonCode,
  }));
}

async function releaseExtractionFailure(
  env: MailEnv,
  receipt: IngestReceiptRow,
  leaseToken: string,
  error: unknown,
): Promise<ExtractionOutcome> {
  const detail = safeError(error);
  if (receipt.extraction_attempts >= EXTRACTION_MAX_ATTEMPTS) {
    await terminalizeReceipt(
      env,
      receipt,
      leaseToken,
      "extraction_attempts_exhausted",
    );
    return "terminal";
  }
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE inbound_ingest_receipts
        SET extraction_status = 'pending', extraction_lease_token = NULL,
            extraction_lease_expires_at = NULL,
            next_extraction_attempt_at = ?, extraction_last_error = ?,
            updated_at = ?, reconciled_at = ?
      WHERE id = ? AND extraction_status = 'leased'
        AND extraction_lease_token = ? AND deleted_at IS NULL`,
  ).bind(
    retryAt(receipt.extraction_attempts),
    detail,
    now,
    now,
    receipt.id,
    leaseToken,
  ).run();
  return "pending";
}

async function putAttachmentChunk(
  env: MailEnv,
  receipt: IngestReceiptRow,
  manifest: InboundObjectManifest,
  attachments: AttachmentInput[],
  start: number,
  end: number,
): Promise<void> {
  for (let offset = start; offset < end; offset += R2_WRITE_CONCURRENCY) {
    const upper = Math.min(end, offset + R2_WRITE_CONCURRENCY);
    await Promise.all(Array.from({ length: upper - offset }, async (_, position) => {
      const index = offset + position;
      const attachment = attachments[index];
      await env.MAIL_OBJECTS.put(manifest.attachmentKeys[index], attachment.content, {
        httpMetadata: { contentType: attachment.mimeType },
        customMetadata: {
          sha256: attachment.sha256,
          ingestReceiptId: receipt.id,
          attachmentIndex: String(index),
        },
      });
    }));
    await Promise.all(Array.from({ length: upper - offset }, async (_, position) => {
      const index = offset + position;
      const attachment = attachments[index];
      const stored = await env.MAIL_OBJECTS.get(manifest.attachmentKeys[index]);
      if (
        !stored
        || stored.size !== attachment.sizeBytes
        || stored.customMetadata?.sha256 !== attachment.sha256
        || stored.customMetadata?.ingestReceiptId !== receipt.id
        || stored.customMetadata?.attachmentIndex !== String(index)
        || await sha256Hex(await stored.arrayBuffer()) !== attachment.sha256
      ) {
        throw new Error("attachment_object_integrity_mismatch_after_write");
      }
    }));
  }
}

async function finalizeExtractionChunk(
  env: MailEnv,
  receipt: IngestReceiptRow,
  leaseToken: string,
  raw: ArrayBuffer,
  parsed: Email,
  schemaPhase: InboundSchemaPhase,
): Promise<ExtractionOutcome> {
  if (parsed.attachments.length > MAX_AUTOMATIC_ATTACHMENTS) {
    await terminalizeReceipt(
      env,
      receipt,
      leaseToken,
      "attachment_count_exceeds_automatic_limit",
      parsed.attachments.length,
    );
    return "terminal";
  }
  let attachments: AttachmentInput[];
  let manifest: InboundObjectManifest;
  try {
    attachments = await attachmentInputs(parsed);
    manifest = extractionManifest(receipt, parsed, attachments);
  } catch (error) {
    if (safeError(error).includes("object_manifest")) {
      await terminalizeReceipt(env, receipt, leaseToken, "object_manifest_mismatch");
      return "terminal";
    }
    return releaseExtractionFailure(env, receipt, leaseToken, error);
  }
  const total = attachments.length;
  const start = receipt.extracted_attachment_count;
  if (start < 0 || start > total) {
    await terminalizeReceipt(env, receipt, leaseToken, "attachment_progress_invalid");
    return "terminal";
  }
  const end = Math.min(total, start + INBOUND_EXTRACTION_CHUNK_SIZE);
  const complete = end === total;
  const manifestStaged = await env.DB.prepare(
    `UPDATE inbound_ingest_receipts
        SET object_manifest_json = ?, attachment_total_count = ?, updated_at = ?
      WHERE id = ? AND extraction_status = 'leased'
        AND extraction_lease_token = ? AND deleted_at IS NULL`,
  ).bind(
    JSON.stringify(manifest),
    total,
    new Date().toISOString(),
    receipt.id,
    leaseToken,
  ).run();
  if (manifestStaged.meta.changes !== 1) return "skipped";
  try {
    if (start === 0 && manifest.htmlKey && parsed.html) {
      await env.MAIL_OBJECTS.put(manifest.htmlKey, parsed.html, {
        httpMetadata: { contentType: "text/html; charset=utf-8" },
        customMetadata: {
          quarantine: "untrusted-email-html",
          ingestReceiptId: receipt.id,
        },
      });
      const storedHtml = await env.MAIL_OBJECTS.head(manifest.htmlKey);
      if (
        !storedHtml
        || storedHtml.size !== byteLength(parsed.html)
        || storedHtml.customMetadata?.ingestReceiptId !== receipt.id
      ) {
        throw new Error("html_object_integrity_mismatch_after_write");
      }
    }
    await putAttachmentChunk(env, receipt, manifest, attachments, start, end);
  } catch (error) {
    return releaseExtractionFailure(env, receipt, leaseToken, error);
  }

  const values = messageValues(parsed, receipt);
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  if (start === 0) {
    statements.push(env.DB.prepare(
      `DELETE FROM attachments WHERE message_id = ?
        AND EXISTS (
          SELECT 1 FROM inbound_ingest_receipts
           WHERE id = ? AND extraction_status = 'leased'
             AND extraction_lease_token = ? AND deleted_at IS NULL
        )`,
    ).bind(receipt.message_id, receipt.id, leaseToken));
  }
  const ids = await Promise.all(attachments.slice(start, end).map(
    (attachment, position) => deterministicAttachmentId(
      receipt.message_id,
      start + position,
      attachment.sha256,
    ),
  ));
  attachments.slice(start, end).forEach((attachment, position) => {
    const index = start + position;
    statements.push(env.DB.prepare(
      `INSERT INTO attachments
        (id, message_id, filename, mime_type, disposition, size_bytes,
         object_key, sha256)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM inbound_ingest_receipts
           WHERE id = ? AND extraction_status = 'leased'
             AND extraction_lease_token = ? AND deleted_at IS NULL
        )
       ON CONFLICT(id) DO UPDATE SET
         message_id = excluded.message_id,
         filename = excluded.filename,
         mime_type = excluded.mime_type,
         disposition = excluded.disposition,
         size_bytes = excluded.size_bytes,
         object_key = excluded.object_key,
         sha256 = excluded.sha256`,
    ).bind(
      ids[position],
      receipt.message_id,
      attachment.filename,
      attachment.mimeType,
      attachment.disposition,
      attachment.sizeBytes,
      manifest.attachmentKeys[index],
      attachment.sha256,
      receipt.id,
      leaseToken,
    ));
  });
  statements.push(env.DB.prepare(
    `UPDATE messages
        SET internet_message_id = ?, from_address = ?, to_json = ?, cc_json = ?,
            subject = ?, text_body = ?,
            html_object_key = CASE WHEN ? = 1 THEN ? ELSE NULL END,
            in_reply_to = ?, references_json = ?,
            extraction_status = ?, attachment_total_count = ?,
            extraction_error_code = NULL
      WHERE id = ? AND ingest_receipt_id = ?
        AND EXISTS (
          SELECT 1 FROM inbound_ingest_receipts
           WHERE id = ? AND extraction_status = 'leased'
             AND extraction_lease_token = ? AND deleted_at IS NULL
        )`,
  ).bind(
    values.internetMessageId,
    values.fromAddress,
    values.toJson,
    values.ccJson,
    values.subject,
    values.textBody,
    complete ? 1 : 0,
    manifest.htmlKey,
    values.inReplyTo,
    values.referencesJson,
    complete ? "complete" : "pending",
    total,
    receipt.message_id,
    receipt.id,
    receipt.id,
    leaseToken,
  ));
  statements.push(env.DB.prepare(
    `UPDATE inbound_ingest_receipts
        SET object_manifest_json = ?, internet_message_id = ?,
            raw_size_bytes = ?, raw_verified_at = COALESCE(raw_verified_at, ?),
            attachment_total_count = ?, extracted_attachment_count = ?,
            extraction_attempts = 0,
            extraction_status = ?, extraction_lease_token = NULL,
            extraction_lease_expires_at = NULL,
            next_extraction_attempt_at = ?, extraction_last_error = NULL,
            extraction_completed_at = CASE WHEN ? = 1 THEN ? ELSE NULL END,
            updated_at = ?, reconciled_at = ?
      WHERE id = ? AND extraction_status = 'leased'
        AND extraction_lease_token = ? AND deleted_at IS NULL`,
  ).bind(
    JSON.stringify(manifest),
    values.internetMessageId,
    raw.byteLength,
    now,
    total,
    end,
    complete ? "complete" : "pending",
    complete ? null : now,
    complete ? 1 : 0,
    now,
    now,
    now,
    receipt.id,
    leaseToken,
  ));
  if (
    INBOUND_PRIMARY_D1_QUERY_OVERHEAD + statements.length
      > INBOUND_MAX_D1_QUERY_BUDGET
  ) {
    return releaseExtractionFailure(
      env,
      receipt,
      leaseToken,
      new Error("inbound_extraction_d1_budget_exceeded"),
    );
  }
  try {
    const results = await env.DB.batch(statements);
    const receiptResult = results.at(-1);
    // The receipt completion trigger may also resolve one or more intervention
    // rows, so D1 can report more than one change for this final statement.
    // Zero remains a lost lease/no-op; any positive count proves the guarded
    // receipt update ran.
    if (!receiptResult || receiptResult.meta.changes < 1) return "skipped";
  } catch (error) {
    const verified = await env.DB.withSession("first-primary").prepare(
      `SELECT r.extraction_status, r.extracted_attachment_count,
              (SELECT COUNT(*) FROM attachments WHERE message_id = r.message_id)
                AS stored_count
         FROM inbound_ingest_receipts AS r WHERE r.id = ?`,
    ).bind(receipt.id).first<{
      extraction_status: InboundExtractionStatus;
      extracted_attachment_count: number;
      stored_count: number;
    }>();
    if (
      verified
      && verified.extracted_attachment_count >= end
      && verified.stored_count >= end
      && (!complete || verified.extraction_status === "complete")
    ) {
      return complete ? "completed" : "pending";
    }
    return releaseExtractionFailure(env, receipt, leaseToken, error);
  }
  return complete ? "completed" : "pending";
}

async function claimReceipt(
  env: MailEnv,
  receiptId: string,
): Promise<{ receipt: IngestReceiptRow; leaseToken: string } | null> {
  const now = new Date();
  const nowIso = now.toISOString();
  const leaseToken = crypto.randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + EXTRACTION_LEASE_MS).toISOString();
  const claimed = await env.DB.prepare(
    `UPDATE inbound_ingest_receipts
        SET extraction_status = 'leased', extraction_lease_token = ?,
            extraction_lease_expires_at = ?, extraction_attempts = extraction_attempts + 1,
            updated_at = ?
      WHERE id = ? AND deleted_at IS NULL
        AND extraction_status <> 'terminal'
        AND extraction_attempts < ?
        AND (
          (extraction_status = 'pending'
            AND COALESCE(next_extraction_attempt_at, updated_at) <= ?)
          OR
          (extraction_status = 'leased'
            AND extraction_lease_expires_at IS NOT NULL
            AND extraction_lease_expires_at <= ?)
        )`,
  ).bind(
    leaseToken,
    leaseExpiresAt,
    nowIso,
    receiptId,
    EXTRACTION_MAX_ATTEMPTS,
    nowIso,
    nowIso,
  ).run();
  if (claimed.meta.changes !== 1) return null;
  const receipt = await loadReceiptById(env, receiptId);
  if (!receipt || receipt.extraction_lease_token !== leaseToken) return null;
  return { receipt, leaseToken };
}

async function loadReceiptMailbox(
  env: MailEnv,
  mailboxId: string,
): Promise<MailboxRecord | null> {
  return env.DB.prepare(
    `SELECT id, owner_id, local_part, canonical_local_part, address,
            display_name, status, created_at, approved_at
       FROM mailboxes WHERE id = ?`,
  ).bind(mailboxId).first<MailboxRecord>();
}

async function recoverReceipt(
  env: MailEnv,
  receiptId: string,
  options: {
    raw?: ArrayBuffer;
    parsed?: Email | null;
    schemaPhase?: InboundSchemaPhase;
  } = {},
): Promise<{ outcome: ExtractionOutcome; committed: boolean }> {
  const claimed = await claimReceipt(env, receiptId);
  if (!claimed) return { outcome: "skipped", committed: false };
  let { receipt } = claimed;
  const { leaseToken } = claimed;
  const schemaPhase = options.schemaPhase ?? await assertInboundSchemaReady(env);
  let raw: ArrayBuffer;
  try {
    raw = await loadVerifiedRaw(env, receipt, options.raw);
  } catch (error) {
    if (
      error instanceof RawObjectPermanentError
      && receipt.extraction_attempts >= RAW_INTEGRITY_CONFIRM_ATTEMPTS
    ) {
      await terminalizeReceipt(env, receipt, leaseToken, error.reasonCode);
      return { outcome: "terminal", committed: false };
    }
    return {
      outcome: await releaseExtractionFailure(env, receipt, leaseToken, error),
      committed: false,
    };
  }
  let committed = false;
  if (receipt.status !== "committed") {
    const mailbox = await loadReceiptMailbox(env, receipt.mailbox_id);
    if (!mailbox) {
      await terminalizeReceipt(env, receipt, leaseToken, "mailbox_missing_for_recovery");
      return { outcome: "terminal", committed: false };
    }
    try {
      await commitPrimaryRecord(
        env,
        receipt,
        internetMessageIdFromRawHeaders(raw),
        schemaPhase,
      );
      committed = true;
      const reloaded = await loadReceiptById(env, receipt.id);
      if (!reloaded) throw new Error("receipt_missing_after_primary_commit");
      receipt = reloaded;
    } catch (error) {
      return {
        outcome: await releaseExtractionFailure(env, receipt, leaseToken, error),
        committed: false,
      };
    }
  }
  const parsed = options.parsed === undefined
    ? await parseRaw(raw)
    : options.parsed;
  if (receipt.extraction_status === "terminal") {
    return { outcome: "terminal", committed };
  }
  if (receipt.extraction_status !== "leased") {
    return { outcome: "skipped", committed };
  }
  if (!parsed) {
    return {
      outcome: await releaseExtractionFailure(
        env,
        receipt,
        leaseToken,
        new Error("mime_parse_failed"),
      ),
      committed,
    };
  }
  return {
    outcome: await finalizeExtractionChunk(
      env,
      receipt,
      leaseToken,
      raw,
      parsed,
      schemaPhase,
    ),
    committed,
  };
}

export async function backfillStalwartMirrorOutbox(
  env: MailEnv,
  limit = 1,
): Promise<number> {
  const safeLimit = Math.max(1, Math.min(10, Math.trunc(limit)));
  const rows = await env.DB.prepare(
    `SELECT r.*
       FROM inbound_ingest_receipts AS r
       JOIN messages AS m ON m.ingest_receipt_id = r.id
      WHERE r.status = 'committed' AND r.deleted_at IS NULL
        AND m.id = r.message_id AND m.raw_sha256 = r.raw_sha256
        AND m.envelope_to_address = r.envelope_to_address
        AND m.delivery_target_address = r.delivery_target_address
        AND m.envelope_from_address = r.envelope_from_address
        AND NOT EXISTS (
          SELECT 1 FROM stalwart_mirror_outbox AS o
           WHERE o.idempotency_key = r.message_id
        )
      ORDER BY r.finalized_at ASC, r.created_at ASC LIMIT ?`,
  ).bind(safeLimit).all<IngestReceiptRow>();
  let backfilled = 0;
  for (const receipt of rows.results) {
    if (await ensureMirrorOutbox(env, receipt)) backfilled += 1;
  }
  return backfilled;
}

async function sweepExhaustedReceipt(env: MailEnv, now: string): Promise<number> {
  const receipt = await env.DB.prepare(
    `SELECT * FROM inbound_ingest_receipts
      WHERE deleted_at IS NULL AND extraction_status <> 'terminal'
        AND extraction_attempts >= ?
        AND (
          extraction_status = 'pending'
          OR (extraction_status = 'leased'
              AND extraction_lease_expires_at IS NOT NULL
              AND extraction_lease_expires_at <= ?)
        )
      ORDER BY updated_at ASC LIMIT 1`,
  ).bind(EXTRACTION_MAX_ATTEMPTS, now).first<IngestReceiptRow>();
  if (!receipt) return 0;
  const eligible = `EXISTS (
    SELECT 1 FROM inbound_ingest_receipts
     WHERE id = ? AND deleted_at IS NULL AND extraction_attempts >= ?
       AND extraction_status <> 'terminal'
       AND (extraction_status = 'pending'
         OR (extraction_status = 'leased'
           AND extraction_lease_expires_at IS NOT NULL
           AND extraction_lease_expires_at <= ?))
  )`;
  const results = await env.DB.batch([
    env.DB.prepare(
      `UPDATE messages
          SET extraction_status = 'terminal',
              extraction_error_code = 'extraction_attempts_exhausted'
        WHERE ingest_receipt_id = ? AND ${eligible}`,
    ).bind(
      receipt.id,
      receipt.id,
      EXTRACTION_MAX_ATTEMPTS,
      now,
    ),
    env.DB.prepare(
      `INSERT INTO inbound_manual_interventions
        (id, receipt_id, message_id, reason_code, status, created_at, updated_at)
       SELECT ?, ?, ?, 'extraction_attempts_exhausted', 'open', ?, ?
        WHERE ${eligible}
       ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`,
    ).bind(
      `receipt:${receipt.id}:extraction_attempts_exhausted`,
      receipt.id,
      receipt.message_id,
      now,
      now,
      receipt.id,
      EXTRACTION_MAX_ATTEMPTS,
      now,
    ),
    env.DB.prepare(
      `UPDATE inbound_ingest_receipts
          SET extraction_status = 'terminal', extraction_lease_token = NULL,
              extraction_lease_expires_at = NULL,
              next_extraction_attempt_at = NULL,
              extraction_last_error = 'extraction_attempts_exhausted',
              extraction_terminal_at = ?, updated_at = ?, reconciled_at = ?
        WHERE id = ? AND deleted_at IS NULL AND extraction_attempts >= ?
          AND extraction_status <> 'terminal'
          AND (extraction_status = 'pending'
            OR (extraction_status = 'leased'
              AND extraction_lease_expires_at IS NOT NULL
              AND extraction_lease_expires_at <= ?))`,
    ).bind(now, now, now, receipt.id, EXTRACTION_MAX_ATTEMPTS, now),
  ]);
  return results.at(-1)?.meta.changes === 1 ? 1 : 0;
}

export async function recoverInboundIngestReceipts(
  env: MailEnv,
  limit = 1,
): Promise<InboundRecoveryResult> {
  const schemaPhase = await assertInboundSchemaReady(env);
  const safeLimit = Math.max(1, Math.min(1, Math.trunc(limit)));
  const now = new Date().toISOString();
  const sweptTerminal = await sweepExhaustedReceipt(env, now);
  const candidates = await env.DB.prepare(
    `SELECT id FROM inbound_ingest_receipts
      WHERE deleted_at IS NULL AND extraction_attempts < ?
        AND (
          (extraction_status = 'pending'
            AND COALESCE(next_extraction_attempt_at, updated_at) <= ?)
          OR
          (extraction_status = 'leased'
            AND extraction_lease_expires_at IS NOT NULL
            AND extraction_lease_expires_at <= ?)
        )
      ORDER BY COALESCE(next_extraction_attempt_at, updated_at) ASC LIMIT ?`,
  ).bind(EXTRACTION_MAX_ATTEMPTS, now, now, safeLimit)
    .all<{ id: string }>();
  const result: InboundRecoveryResult = {
    inspected: candidates.results.length,
    committed: 0,
    completed: 0,
    pending: 0,
    terminal: sweptTerminal,
    mirrorBackfilled: 0,
  };
  for (const candidate of candidates.results) {
    const recovered = await recoverReceipt(env, candidate.id, { schemaPhase });
    if (recovered.committed) result.committed += 1;
    if (recovered.outcome === "completed") result.completed += 1;
    if (recovered.outcome === "pending") result.pending += 1;
    if (recovered.outcome === "terminal") result.terminal += 1;
  }
  result.mirrorBackfilled = await backfillStalwartMirrorOutbox(env);
  return result;
}

type SchemaCounts = {
  message_columns: number;
  receipt_columns: number;
  intervention_columns: number;
  contract_value: string | null;
  legacy_index: number;
  delivery_index: number;
  delivery_index_columns: number;
  receipt_index: number;
  receipt_index_columns: number;
  extraction_index: number;
  extraction_index_columns: number;
  resolution_trigger: number;
};

export async function assertInboundSchemaReady(
  env: MailEnv,
): Promise<InboundSchemaPhase> {
  try {
    const primary = await env.DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM pragma_table_info('messages')
          WHERE name IN (
            'ingest_receipt_id', 'envelope_to_address', 'mailbox_lookup_address',
            'delivery_target_address', 'raw_sha256', 'extraction_status',
            'attachment_total_count', 'extraction_error_code'
          )) AS message_columns,
        (SELECT COUNT(*) FROM pragma_table_info('inbound_ingest_receipts')
          WHERE name IN (
            'id', 'idempotency_key', 'message_id', 'mailbox_id', 'raw_sha256',
            'envelope_to_address', 'mailbox_lookup_address',
            'delivery_target_address', 'envelope_from_address',
            'internet_message_id', 'raw_object_key', 'object_manifest_json',
            'status', 'last_error', 'created_at', 'updated_at', 'finalized_at',
            'reconciled_at', 'raw_size_bytes', 'raw_verified_at',
            'extraction_status', 'attachment_total_count',
            'extracted_attachment_count', 'extraction_attempts',
            'extraction_lease_token', 'extraction_lease_expires_at',
            'next_extraction_attempt_at', 'extraction_last_error',
            'extraction_completed_at', 'extraction_terminal_at', 'deleted_at',
            'retention_hold'
          )) AS receipt_columns,
        (SELECT COUNT(*) FROM pragma_table_info('inbound_manual_interventions')
          WHERE name IN (
            'id', 'receipt_id', 'message_id', 'reason_code', 'status',
            'created_at', 'updated_at', 'resolved_at'
          )) AS intervention_columns,
        (SELECT value FROM mail_worker_release_contract
          WHERE name = 'inbound_primary_path') AS contract_value,
        (SELECT COUNT(*) FROM sqlite_master
          WHERE type = 'index' AND name = 'messages_inbound_dedupe') AS legacy_index,
        (SELECT COUNT(*) FROM pragma_index_list('messages')
          WHERE name = 'messages_inbound_delivery_dedupe' AND "unique" = 1)
          AS delivery_index,
        (SELECT COUNT(*) FROM pragma_index_info('messages_inbound_delivery_dedupe')
          WHERE (seqno = 0 AND name = 'raw_sha256')
             OR (seqno = 1 AND name = 'envelope_to_address')
             OR (seqno = 2 AND name = 'delivery_target_address')
             OR (seqno = 3 AND name = 'envelope_from_address'))
          AS delivery_index_columns,
        (SELECT COUNT(*) FROM pragma_index_list('messages')
          WHERE name = 'messages_ingest_receipt_id' AND "unique" = 1)
          AS receipt_index,
        (SELECT COUNT(*) FROM pragma_index_info('messages_ingest_receipt_id')
          WHERE seqno = 0 AND name = 'ingest_receipt_id') AS receipt_index_columns,
        (SELECT COUNT(*) FROM pragma_index_list('inbound_ingest_receipts')
          WHERE name = 'inbound_ingest_receipts_extraction_due') AS extraction_index,
        (SELECT COUNT(*) FROM pragma_index_info('inbound_ingest_receipts_extraction_due')
          WHERE (seqno = 0 AND name = 'extraction_status')
             OR (seqno = 1 AND name = 'next_extraction_attempt_at')
             OR (seqno = 2 AND name = 'extraction_lease_expires_at'))
          AS extraction_index_columns,
        (SELECT COUNT(*) FROM sqlite_master
          WHERE type = 'trigger'
            AND name = 'inbound_receipt_resolve_interventions')
          AS resolution_trigger`,
    ).first<SchemaCounts>();
    if (
      !primary
      || primary.message_columns !== 8
      || primary.receipt_columns !== 32
      || primary.intervention_columns !== 8
      || !(
        (primary.contract_value === INBOUND_EXPAND_SCHEMA_MARKER
          && primary.legacy_index === 1)
        || (primary.contract_value === INBOUND_CONTRACT_SCHEMA_MARKER
          && primary.legacy_index === 0)
      )
      || primary.delivery_index !== 1
      || primary.delivery_index_columns !== 4
      || primary.receipt_index !== 1
      || primary.receipt_index_columns !== 1
      || primary.extraction_index !== 1
      || primary.extraction_index_columns !== 3
      || primary.resolution_trigger !== 1
    ) {
      throw new Error("inbound_primary_schema_contract_mismatch");
    }
    const mirror = await env.DB.prepare(
        `SELECT
          (SELECT COUNT(*) FROM pragma_table_info('stalwart_mirror_dead_letters')
            WHERE name IN (
              'id', 'message_id', 'payload_json', 'attempts', 'status',
              'first_seen_at', 'last_seen_at', 'requeued_at', 'requeue_attempts'
            )) AS dead_letter_columns,
          (SELECT COUNT(*) FROM pragma_table_info('stalwart_mirror_outbox')
            WHERE name IN (
              'idempotency_key', 'message_id', 'raw_object_key', 'payload_json',
              'status', 'attempts', 'next_attempt_at', 'lease_token',
              'lease_expires_at', 'last_error', 'created_at', 'updated_at',
              'enqueued_at', 'delivered_at', 'dead_lettered_at', 'terminal_at',
              'delivery_id', 'delivery_cycles'
            )) AS outbox_columns,
          (SELECT COUNT(*) FROM pragma_table_info('stalwart_mirror_terminal_events')
            WHERE name IN (
              'id', 'phase', 'queue_message_id', 'message_id', 'delivery_id',
              'reason', 'outbox_status', 'observed_at'
            )) AS terminal_columns,
          (SELECT COUNT(*) FROM pragma_index_info('stalwart_mirror_dead_letters_status_seen')
            WHERE (seqno = 0 AND name = 'status')
               OR (seqno = 1 AND name = 'last_seen_at')) AS dead_letter_index,
          (SELECT COUNT(*) FROM pragma_index_info('stalwart_mirror_outbox_dispatch')
            WHERE (seqno = 0 AND name = 'status')
               OR (seqno = 1 AND name = 'next_attempt_at')
               OR (seqno = 2 AND name = 'lease_expires_at')) AS dispatch_index,
          (SELECT COUNT(*) FROM pragma_index_info('stalwart_mirror_outbox_raw_object')
            WHERE (seqno = 0 AND name = 'raw_object_key')
               OR (seqno = 1 AND name = 'status')) AS raw_index,
          (SELECT COUNT(*) FROM pragma_index_list('stalwart_mirror_outbox')
            WHERE name = 'stalwart_mirror_outbox_delivery_id' AND "unique" = 1)
            AS delivery_index,
          (SELECT COUNT(*) FROM pragma_index_info('stalwart_mirror_terminal_events_message')
            WHERE (seqno = 0 AND name = 'message_id')
               OR (seqno = 1 AND name = 'observed_at')) AS terminal_message_index,
          (SELECT COUNT(*) FROM pragma_index_info('stalwart_mirror_terminal_events_reason')
            WHERE (seqno = 0 AND name = 'reason')
               OR (seqno = 1 AND name = 'observed_at')) AS terminal_reason_index`,
    ).first<{
        dead_letter_columns: number;
        outbox_columns: number;
        terminal_columns: number;
        dead_letter_index: number;
        dispatch_index: number;
        raw_index: number;
        delivery_index: number;
        terminal_message_index: number;
        terminal_reason_index: number;
      }>();
    if (
      !mirror
      || mirror.dead_letter_columns !== 9
      || mirror.outbox_columns !== 18
      || mirror.terminal_columns !== 8
      || mirror.dead_letter_index !== 2
      || mirror.dispatch_index !== 3
      || mirror.raw_index !== 2
      || mirror.delivery_index !== 1
      || mirror.terminal_message_index !== 2
      || mirror.terminal_reason_index !== 2
    ) {
      throw new Error("stalwart_mirror_schema_contract_mismatch");
    }
    return primary.contract_value === INBOUND_EXPAND_SCHEMA_MARKER
      ? "expand"
      : "contract";
  } catch {
    throw new Error(
      `Inbound schema is not ready for ${INBOUND_RELEASE_CONTRACT_MARKER}; apply migrations 0016 through ${INBOUND_SCHEMA_MIGRATION} before release`,
    );
  }
}

export async function receiveEmail(
  message: ForwardableEmailMessage,
  env: MailEnv,
): Promise<void> {
  const maxBytes = maxMessageBytes(env);
  if (message.rawSize > maxBytes) {
    message.setReject("Message exceeds the GSYEN Mail size limit");
    return;
  }
  const envelopeTo = sanitizedEnvelopeAddress(message.to, false);
  if (!envelopeTo) {
    message.setReject("Recipient address is invalid");
    return;
  }
  const mailboxLookupAddress = canonicalInboundAddress(
    envelopeTo,
    env.MAIL_DOMAIN,
    env.INBOUND_DOMAINS,
  );
  if (!mailboxLookupAddress) {
    message.setReject("Recipient domain is not accepted");
    return;
  }
  const envelopeFrom = sanitizedEnvelopeAddress(message.from, true);
  if (envelopeFrom === null) {
    message.setReject("Envelope sender address is invalid");
    return;
  }
  const mailbox = await getMailboxByAddress(env, mailboxLookupAddress);
  if (!mailbox || mailbox.status !== "active") {
    message.setReject("Mailbox does not exist or is inactive");
    return;
  }
  const schemaPhase = await assertInboundSchemaReady(env);
  const raw = await new Response(message.raw).arrayBuffer();
  if (raw.byteLength > maxBytes) {
    message.setReject("Message exceeds the GSYEN Mail size limit");
    return;
  }
  const rawSha256 = await sha256Hex(raw);
  const envelope: InboundEnvelope = {
    envelopeFrom,
    envelopeTo,
    mailboxLookupAddress,
    deliveryTargetAddress: envelopeTo,
  };
  let receipt = await stageInbound(env, mailbox, rawSha256, envelope);
  if (receipt.extraction_status === "terminal") {
    return;
  }
  if (receipt.status === "committed") {
    await ensureMirrorOutbox(env, receipt);
    if (receipt.extraction_status === "pending") {
      await recoverReceipt(env, receipt.id, { schemaPhase });
    }
    return;
  }

  const verifiedRaw = await storeAndVerifyRaw(env, receipt, raw);
  await commitPrimaryRecord(
    env,
    receipt,
    internetMessageIdFromRawHeaders(verifiedRaw),
    schemaPhase,
  );
  receipt = await loadReceiptById(env, receipt.id) ?? receipt;
  if (receipt.extraction_status !== "terminal") {
    // Extraction is best-effort after the authoritative raw + D1 primary
    // record is committed.  Any failure is persisted for scheduled recovery;
    // the SMTP delivery remains accepted and is never silently truncated.
    const parsed = await parseRaw(verifiedRaw);
    await recoverReceipt(env, receipt.id, {
      raw: verifiedRaw,
      parsed,
      schemaPhase,
    });
  }
}
