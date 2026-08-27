import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  statfs,
} from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { deliverSmtp, probeSmtp } from "./smtp.mjs";

const RECEIPT_VERSION = 1;
const DEFAULT_MAX_BYTES = 5_242_880;
const DEFAULT_LEASE_MS = 120_000;
const DEFAULT_SMTP_TIMEOUT_MS = 15_000;
const DEFAULT_HEALTH_SMTP_TIMEOUT_MS = 3_000;
const DEFAULT_MIN_FREE_BYTES = 1024 * 1024 * 1024;
const DEFAULT_MAX_CONCURRENT_DELIVERIES = 4;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;
const DUPLICATE_GUARD_VERSION = "gsyen-mirror-rfc7352-v1";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_${name}`);
  return value;
}

function integer(value, name, { min, max }) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`invalid_${name}`);
  }
  return parsed;
}

function httpError(message, status, headers = undefined) {
  return Object.assign(new Error(message), { status, headers });
}

function safeError(error) {
  return (error instanceof Error ? error.message : String(error))
    .replace(/[\r\n]/g, " ")
    .slice(0, 500);
}

function validateToken(token) {
  if (!TOKEN_PATTERN.test(token)) {
    throw new Error("MAIL_MIRROR_TOKEN_must_be_43_to_128_base64url_characters");
  }
  return createHash("sha256").update(token, "utf8").digest();
}

function authorized(header, tokenDigest) {
  const supplied = header?.startsWith("Bearer ") ? header.slice(7) : "";
  const suppliedDigest = createHash("sha256").update(supplied, "utf8").digest();
  return timingSafeEqual(suppliedDigest, tokenDigest);
}

function errorCode(error) {
  const value = error instanceof Error ? error.message : "internal_error";
  return /^[a-zA-Z0-9_:-]{1,100}$/.test(value) ? value : "internal_error";
}

function validMailbox(value) {
  if (!value || value.length > 254 || /[\u0000-\u0020\u007f<>]/.test(value)) {
    return false;
  }
  const at = value.lastIndexOf("@");
  return at > 0 && at < value.length - 1;
}

function validRecipient(value, allowedDomain) {
  if (!validMailbox(value)) return false;
  return value.slice(value.lastIndexOf("@") + 1).toLowerCase() === allowedDomain;
}

function validEnvelopeSender(value) {
  return value === "" || validMailbox(value);
}

function validInternalMessageId(value) {
  return typeof value === "string"
    && /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,199}$/.test(value);
}

async function readBody(request, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw httpError("message_too_large", 413);
    chunks.push(chunk);
  }
  if (size === 0) throw httpError("empty_message", 400);
  return Buffer.concat(chunks);
}

function rawSha256(raw) {
  return createHash("sha256").update(raw).digest("hex");
}

export function deriveDeliveryId(messageId, recipient, rawHash) {
  return createHash("sha256")
    .update(messageId)
    .update("\0")
    .update(recipient.toLowerCase())
    .update("\0")
    .update(rawHash)
    .digest("hex");
}

export function deriveReceiptKey(messageId) {
  return createHash("sha256").update(messageId).digest("hex");
}

function parseInternetMessageId(raw) {
  const headerLimit = Math.min(raw.length, 128_000);
  const headers = raw.subarray(0, headerLimit).toString("latin1");
  const headerEnd = headers.search(/\r?\n\r?\n/);
  if (headerEnd < 0) return null;
  const unfolded = headers
    .slice(0, headerEnd)
    .replace(/\r?\n[ \t]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 0 || line.slice(0, separator).toLowerCase() !== "message-id") {
      continue;
    }
    const value = line.slice(separator + 1).trim();
    return value.length > 0
      && value.length <= 998
      && !/[\u0000-\u001f\u007f]/.test(value)
      ? value
      : null;
  }
  return null;
}

function injectTrustedMirrorHeaders(raw, deliveryId, rawHash) {
  const trustedHeaders = Buffer.from(
    `X-GSYEN-Mirror-ID: ${deliveryId}\r\nX-GSYEN-Raw-SHA256: ${rawHash}\r\n`,
    "ascii",
  );
  return Buffer.concat([trustedHeaders, raw]);
}

async function syncDirectory(directory) {
  let handle;
  try {
    handle = await open(directory, "r");
    await handle.sync();
  } catch (error) {
    if (!["EINVAL", "ENOTSUP", "EBADF"].includes(error.code)) throw error;
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function atomicWriteJson(filePath, value) {
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(value)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporary, filePath);
    await syncDirectory(path.dirname(filePath));
  } catch (error) {
    await handle?.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

async function withTimeout(operation, timeoutMs, message) {
  let timer;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function checkReceiptStorage(receiptDir, minFreeBytes) {
  await mkdir(receiptDir, { recursive: true, mode: 0o700 });
  const healthPath = path.join(receiptDir, `.health-${process.pid}-${randomUUID()}`);
  let handle;
  try {
    handle = await open(healthPath, "wx", 0o600);
    await handle.writeFile("ok\n", "ascii");
    await handle.sync();
    await handle.close();
    handle = null;
    await rm(healthPath);
    await syncDirectory(receiptDir);
  } finally {
    await handle?.close().catch(() => {});
    await rm(healthPath, { force: true }).catch(() => {});
  }

  const filesystem = await statfs(receiptDir, { bigint: true });
  const freeBytes = filesystem.bavail * filesystem.bsize;
  return {
    writable: true,
    freeBytes: freeBytes.toString(),
    minimumFreeBytes: String(minFreeBytes),
    spaceAvailable: freeBytes >= BigInt(minFreeBytes),
  };
}

async function healthSnapshot({
  receiptDir,
  minFreeBytes,
  smtp,
  smtpProbe,
  healthSmtpTimeoutMs,
  duplicateGuardVerified,
}) {
  const [storageResult, smtpResult] = await Promise.allSettled([
    checkReceiptStorage(receiptDir, minFreeBytes),
    withTimeout(
      Promise.resolve().then(
        () => smtpProbe({ ...smtp, timeoutMs: healthSmtpTimeoutMs }),
      ),
      healthSmtpTimeoutMs,
      "smtp_health_probe_timeout",
    ),
  ]);
  const storage = storageResult.status === "fulfilled"
    ? storageResult.value
    : {
      writable: false,
      freeBytes: null,
      minimumFreeBytes: String(minFreeBytes),
      spaceAvailable: false,
      error: errorCode(storageResult.reason),
    };
  const smtpCheck = smtpResult.status === "fulfilled"
    ? {
      reachable: true,
      capabilities: Array.isArray(smtpResult.value?.capabilities)
        ? smtpResult.value.capabilities
        : [],
    }
    : {
      reachable: false,
      capabilities: [],
      error: errorCode(smtpResult.reason),
    };
  const technicalReady = storage.writable
    && storage.spaceAvailable
    && smtpCheck.reachable;
  return {
    ok: technicalReady && duplicateGuardVerified,
    service: "gsyen-stalwart-ingest",
    technicalReady,
    checks: {
      receiptStorage: storage,
      smtp: smtpCheck,
    },
    manualGate: {
      required: true,
      duplicateGuardVersion: DUPLICATE_GUARD_VERSION,
      duplicateGuardVerified,
    },
    exactlyOnceClaimed: false,
  };
}

function validReceipt(value) {
  const validDate = (candidate) => typeof candidate === "string"
    && Number.isFinite(Date.parse(candidate));
  const structurallyValid = value
    && typeof value === "object"
    && value.version === RECEIPT_VERSION
    && ["delivering", "accepted"].includes(value.status)
    && /^[0-9a-f]{64}$/.test(value.deliveryId)
    && validInternalMessageId(value.messageId)
    && (value.internetMessageId === null
      || (typeof value.internetMessageId === "string"
        && value.internetMessageId.length <= 998
        && !/[\u0000-\u001f\u007f]/.test(value.internetMessageId)))
    && validMailbox(value.recipient)
    && validEnvelopeSender(value.envelopeFrom)
    && /^[0-9a-f]{64}$/.test(value.rawSha256)
    && Number.isSafeInteger(value.rawBytes)
    && value.rawBytes > 0
    && Number.isSafeInteger(value.attempts)
    && value.attempts > 0
    && validDate(value.firstAttemptAt)
    && validDate(value.lastAttemptAt)
    && (value.lastFailureAt === null || validDate(value.lastFailureAt))
    && (value.lastError === null || typeof value.lastError === "string")
    && (
      (value.status === "delivering"
        && value.acceptedAt === null
        && value.smtpResult === null)
      || (value.status === "accepted"
        && validDate(value.acceptedAt)
        && typeof value.smtpResult === "string")
    );
  return Boolean(structurallyValid)
    && deriveDeliveryId(value.messageId, value.recipient, value.rawSha256)
      === value.deliveryId;
}

async function readReceipt(filePath) {
  let encoded;
  try {
    encoded = await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  let value;
  try {
    value = JSON.parse(encoded);
  } catch {
    throw httpError("receipt_state_invalid", 503);
  }
  if (!validReceipt(value)) throw httpError("receipt_state_invalid", 503);
  return value;
}

function sameDelivery(receipt, metadata) {
  return receipt.deliveryId === metadata.deliveryId
    && receipt.messageId === metadata.messageId
    && receipt.internetMessageId === metadata.internetMessageId
    && receipt.recipient === metadata.recipient
    && receipt.envelopeFrom === metadata.envelopeFrom
    && receipt.rawSha256 === metadata.rawSha256
    && receipt.rawBytes === metadata.rawBytes;
}

async function leaseExpiry(leasePath, leaseMs) {
  const details = await stat(leasePath);
  let declaredExpiry = Number.POSITIVE_INFINITY;
  try {
    const value = JSON.parse(await readFile(leasePath, "utf8"));
    const parsed = Date.parse(value.expiresAt);
    if (Number.isFinite(parsed)) declaredExpiry = parsed;
  } catch {
    // A writer can be between O_EXCL creation and fsync. Its mtime is the
    // conservative fallback, so a partial lease is never reclaimed early.
  }
  return Math.min(declaredExpiry, details.mtimeMs + leaseMs);
}

async function acquireLease(leasePath, deliveryId, leaseMs, now) {
  for (let pass = 0; pass < 5; pass += 1) {
    const acquiredAt = now();
    const token = randomUUID();
    const lease = {
      version: RECEIPT_VERSION,
      token,
      deliveryId,
      acquiredAt: acquiredAt.toISOString(),
      expiresAt: new Date(acquiredAt.getTime() + leaseMs).toISOString(),
    };
    let handle;
    let created = false;
    try {
      handle = await open(leasePath, "wx", 0o600);
      created = true;
      await handle.writeFile(`${JSON.stringify(lease)}\n`, "utf8");
      await handle.sync();
      await handle.close();
      handle = null;
      await syncDirectory(path.dirname(leasePath));
      return lease;
    } catch (error) {
      await handle?.close().catch(() => {});
      if (created) await rm(leasePath, { force: true }).catch(() => {});
      if (error.code !== "EEXIST") throw error;
    }

    let expiresAt;
    try {
      expiresAt = await leaseExpiry(leasePath, leaseMs);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    const current = now().getTime();
    if (expiresAt > current) {
      throw httpError("delivery_in_progress", 409, {
        "Retry-After": String(Math.max(1, Math.ceil((expiresAt - current) / 1_000))),
      });
    }

    const stalePath = `${leasePath}.${randomUUID()}.stale`;
    try {
      await rename(leasePath, stalePath);
      await syncDirectory(path.dirname(leasePath));
      await rm(stalePath, { force: true });
      await syncDirectory(path.dirname(leasePath));
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
  }
  throw httpError("lease_contention", 409, { "Retry-After": "1" });
}

async function releaseLease(leasePath, token) {
  let current;
  try {
    current = JSON.parse(await readFile(leasePath, "utf8"));
  } catch {
    return;
  }
  if (current.token !== token) return;
  try {
    await rm(leasePath, { force: true });
    await syncDirectory(path.dirname(leasePath));
  } catch (error) {
    console.error(JSON.stringify({
      event: "mail_mirror_lease_release_failed",
      error: safeError(error),
    }));
  }
}

async function assertLeaseOwner(leasePath, token) {
  let current;
  try {
    current = JSON.parse(await readFile(leasePath, "utf8"));
  } catch {
    throw httpError("delivery_lease_lost", 409, { "Retry-After": "1" });
  }
  if (current.token !== token) {
    throw httpError("delivery_lease_lost", 409, { "Retry-After": "1" });
  }
}

function respond(response, status, headers = undefined) {
  response.writeHead(status, headers);
  response.end();
}

function respondAccepted(response, deliveryId, rawSha256) {
  respond(response, 204, {
    "X-GSYEN-Delivery-ID": deliveryId,
    "X-GSYEN-Raw-SHA256": rawSha256,
  });
}

export function createIngestServer(options = {}) {
  const token = options.token ?? required("MAIL_MIRROR_TOKEN");
  const tokenDigest = validateToken(token);
  const allowedDomain = (options.allowedDomain ?? process.env.MAIL_DOMAIN ?? "gsyen.com")
    .trim()
    .toLowerCase();
  const receiptDir = options.receiptDir
    ?? process.env.MAIL_MIRROR_RECEIPT_DIR
    ?? "/srv/gsyen/data/mail-mirror/receipts";
  const maxBytes = integer(
    options.maxBytes ?? process.env.MAIL_MIRROR_MAX_BYTES ?? DEFAULT_MAX_BYTES,
    "MAIL_MIRROR_MAX_BYTES",
    { min: 1, max: 50 * 1024 * 1024 },
  );
  const leaseMs = integer(
    options.leaseMs ?? process.env.MAIL_MIRROR_LEASE_MS ?? DEFAULT_LEASE_MS,
    "MAIL_MIRROR_LEASE_MS",
    { min: 30_000, max: 30 * 60_000 },
  );
  const smtpTimeoutMs = integer(
    options.smtpTimeoutMs
      ?? process.env.MAIL_MIRROR_SMTP_TIMEOUT_MS
      ?? DEFAULT_SMTP_TIMEOUT_MS,
    "MAIL_MIRROR_SMTP_TIMEOUT_MS",
    { min: 1_000, max: 60_000 },
  );
  const healthSmtpTimeoutMs = integer(
    options.healthSmtpTimeoutMs
      ?? process.env.MAIL_MIRROR_HEALTH_SMTP_TIMEOUT_MS
      ?? DEFAULT_HEALTH_SMTP_TIMEOUT_MS,
    "MAIL_MIRROR_HEALTH_SMTP_TIMEOUT_MS",
    { min: 1_000, max: 10_000 },
  );
  const minFreeBytes = integer(
    options.minFreeBytes
      ?? process.env.MAIL_MIRROR_MIN_FREE_BYTES
      ?? DEFAULT_MIN_FREE_BYTES,
    "MAIL_MIRROR_MIN_FREE_BYTES",
    { min: 1, max: Number.MAX_SAFE_INTEGER },
  );
  const maxConcurrentDeliveries = integer(
    options.maxConcurrentDeliveries
      ?? process.env.MAIL_MIRROR_MAX_CONCURRENT_DELIVERIES
      ?? DEFAULT_MAX_CONCURRENT_DELIVERIES,
    "MAIL_MIRROR_MAX_CONCURRENT_DELIVERIES",
    { min: 1, max: 32 },
  );
  if (leaseMs < smtpTimeoutMs * 2) {
    throw new Error("MAIL_MIRROR_LEASE_MS_must_be_at_least_twice_SMTP_timeout");
  }
  const duplicateGuardVerified = options.duplicateGuardVerified
    ?? process.env.STALWART_DUPLICATE_GUARD_VERIFIED?.trim().toLowerCase() === "true";
  const smtpDeliver = options.smtpDeliver ?? deliverSmtp;
  const smtpProbe = options.smtpProbe ?? probeSmtp;
  const now = options.now ?? (() => new Date());
  const smtp = {
    host: options.smtpHost ?? process.env.STALWART_SMTP_HOST ?? "127.0.0.1",
    port: integer(
      options.smtpPort ?? process.env.STALWART_SMTP_PORT ?? 25,
      "STALWART_SMTP_PORT",
      { min: 1, max: 65_535 },
    ),
    hostname: options.hostname ?? process.env.MAIL_HOSTNAME ?? "mail.gsyen.com",
  };
  const activeDeliveries = new Set();
  let activeDeliveryCount = 0;

  return http.createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/healthz") {
      const snapshot = await healthSnapshot({
        receiptDir,
        minFreeBytes,
        smtp,
        smtpProbe,
        healthSmtpTimeoutMs,
        duplicateGuardVerified,
      });
      response.writeHead(snapshot.ok ? 200 : 503, {
        "Content-Type": "application/json",
      });
      response.end(JSON.stringify(snapshot));
      return;
    }
    if (request.method !== "POST" || request.url !== "/internal/mail/mirror") {
      respond(response, 404);
      return;
    }
    if (!authorized(request.headers.authorization, tokenDigest)) {
      respond(response, 401);
      return;
    }
    if (!duplicateGuardVerified) {
      respond(response, 503, {
        "Retry-After": "300",
        "X-GSYEN-Duplicate-Guard": "unverified",
      });
      return;
    }
    const messageId = request.headers["idempotency-key"];
    const envelopeFrom = request.headers["x-gsyen-envelope-from"];
    const recipientHeader = request.headers["x-gsyen-envelope-to"];
    const expectedRawHashHeader = request.headers["x-gsyen-raw-sha256"];
    const expectedDeliveryIdHeader = request.headers["x-gsyen-delivery-id"];
    if (!validInternalMessageId(messageId)
      || typeof envelopeFrom !== "string"
      || !validEnvelopeSender(envelopeFrom)
      || typeof recipientHeader !== "string"
      || !validRecipient(recipientHeader, allowedDomain)
      || typeof expectedRawHashHeader !== "string"
      || !/^[0-9a-fA-F]{64}$/.test(expectedRawHashHeader)
      || typeof expectedDeliveryIdHeader !== "string"
      || !/^[0-9a-f]{64}$/.test(expectedDeliveryIdHeader)) {
      respond(response, 400);
      return;
    }

    // Preserve the exact SMTP envelope target for delivery and audit. Domain
    // authorization is case-insensitive in validRecipient(), while the shared
    // delivery-ID algorithm performs its own canonical lower-casing.
    const recipient = recipientHeader;
    const expectedRawHash = expectedRawHashHeader.toLowerCase();
    if (activeDeliveryCount >= maxConcurrentDeliveries) {
      respond(response, 429, {
        "Retry-After": "1",
        "X-GSYEN-Error-Code": "concurrency_limit",
      });
      return;
    }
    activeDeliveryCount += 1;
    let deliveryId;
    let activeKey;
    try {
      const raw = await readBody(request, maxBytes);
      const computedRawHash = rawSha256(raw);
      const expectedBytes = Buffer.from(expectedRawHash, "hex");
      const computedBytes = Buffer.from(computedRawHash, "hex");
      if (!timingSafeEqual(expectedBytes, computedBytes)) {
        throw httpError("raw_sha256_mismatch", 422);
      }

      const internetMessageId = parseInternetMessageId(raw);
      deliveryId = deriveDeliveryId(messageId, recipient, computedRawHash);
      if (expectedDeliveryIdHeader !== deliveryId) {
        throw httpError("delivery_id_mismatch", 422);
      }
      const metadata = {
        deliveryId,
        messageId,
        internetMessageId,
        recipient,
        envelopeFrom,
        rawSha256: computedRawHash,
        rawBytes: raw.length,
      };
      // The filesystem key is derived from the caller's idempotency key alone.
      // This is intentionally different from deliveryId: changing recipient or
      // raw content under the same key must collide here and fail closed rather
      // than create a second receipt and a second SMTP delivery.
      const receiptKey = deriveReceiptKey(messageId);
      const receiptPath = path.join(receiptDir, `${receiptKey}.json`);
      const leasePath = path.join(receiptDir, `${receiptKey}.lease`);
      await mkdir(receiptDir, { recursive: true, mode: 0o700 });
      activeKey = path.resolve(receiptDir, receiptKey);
      if (activeDeliveries.has(activeKey)) {
        throw httpError("delivery_in_progress", 409, { "Retry-After": "1" });
      }
      activeDeliveries.add(activeKey);
      try {
        const prior = await readReceipt(receiptPath);
        if (prior?.status === "accepted") {
          if (!sameDelivery(prior, metadata)) {
            throw httpError("accepted_receipt_metadata_conflict", 409);
          }
          respondAccepted(response, deliveryId, computedRawHash);
          return;
        }
        if (prior && !sameDelivery(prior, metadata)) {
          throw httpError("receipt_metadata_conflict", 409);
        }

        const lease = await acquireLease(leasePath, deliveryId, leaseMs, now);
        try {
          await assertLeaseOwner(leasePath, lease.token);
          const current = await readReceipt(receiptPath);
          if (current?.status === "accepted") {
            if (!sameDelivery(current, metadata)) {
              throw httpError("accepted_receipt_metadata_conflict", 409);
            }
          } else {
            if (current && !sameDelivery(current, metadata)) {
              throw httpError("receipt_metadata_conflict", 409);
            }

            const attemptedAt = now().toISOString();
            const delivering = {
              version: RECEIPT_VERSION,
              status: "delivering",
              ...metadata,
              attempts: (current?.attempts ?? 0) + 1,
              firstAttemptAt: current?.firstAttemptAt ?? attemptedAt,
              lastAttemptAt: attemptedAt,
              acceptedAt: null,
              smtpResult: null,
              lastFailureAt: null,
              lastError: null,
            };
            await assertLeaseOwner(leasePath, lease.token);
            await atomicWriteJson(receiptPath, delivering);

            let smtpResult;
            try {
              await assertLeaseOwner(leasePath, lease.token);
              smtpResult = await smtpDeliver({
                ...smtp,
                envelopeFrom,
                recipient,
                raw: injectTrustedMirrorHeaders(raw, deliveryId, computedRawHash),
                timeoutMs: smtpTimeoutMs,
              });
            } catch (error) {
              await assertLeaseOwner(leasePath, lease.token);
              await atomicWriteJson(receiptPath, {
                ...delivering,
                lastFailureAt: now().toISOString(),
                lastError: safeError(error),
              });
              throw error;
            }

            await assertLeaseOwner(leasePath, lease.token);
            await atomicWriteJson(receiptPath, {
              ...delivering,
              status: "accepted",
              acceptedAt: now().toISOString(),
              smtpResult: safeError(smtpResult),
              lastFailureAt: null,
              lastError: null,
            });
          }
        } finally {
          await releaseLease(leasePath, lease.token);
        }
      } finally {
        activeDeliveries.delete(activeKey);
      }
      respondAccepted(response, deliveryId, computedRawHash);
    } catch (error) {
      const status = Number(error.status) || 503;
      console.error(JSON.stringify({
        event: "mail_mirror_ingest_failed",
        messageId,
        deliveryId,
        recipientDomain: recipient
          ?.slice(recipient.lastIndexOf("@") + 1)
          .toLowerCase(),
        error: safeError(error),
      }));
      respond(response, status, {
        ...error.headers,
        "X-GSYEN-Error-Code": errorCode(error),
      });
    } finally {
      activeDeliveryCount -= 1;
    }
  });
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const port = integer(process.env.PORT ?? 18_085, "PORT", { min: 1, max: 65_535 });
  const host = process.env.HOST ?? "127.0.0.1";
  createIngestServer().listen(port, host, () => {
    console.log(JSON.stringify({
      event: "mail_mirror_ingest_listening",
      host,
      port,
      duplicateGuardVersion: DUPLICATE_GUARD_VERSION,
      exactlyOnceClaimed: false,
    }));
  });
}
