import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import {
  createIngestServer,
  deriveDeliveryId,
  deriveReceiptKey,
} from "../src/server.mjs";

const servers = [];
const temporaryDirectories = [];
const TEST_TOKEN = "t".repeat(43);

afterEach(async () => {
  await Promise.all(servers.splice(0).map(
    (server) => new Promise((resolve) => server.close(resolve)),
  ));
  await Promise.all(temporaryDirectories.splice(0).map(
    (directory) => rm(directory, { recursive: true, force: true }),
  ));
});

async function start(options = {}) {
  const receiptDir = options.receiptDir
    ?? await mkdtemp(path.join(os.tmpdir(), "gsyen-mail-mirror-"));
  if (!temporaryDirectories.includes(receiptDir)) temporaryDirectories.push(receiptDir);
  const deliveries = [];
  const defaultSmtpDeliver = async (delivery) => {
    deliveries.push(delivery);
    return "250 2.0.0 accepted";
  };
  const server = createIngestServer({
    token: TEST_TOKEN,
    receiptDir,
    duplicateGuardVerified: true,
    smtpDeliver: defaultSmtpDeliver,
    smtpProbe: async () => ({ capabilities: ["8BITMIME", "SMTPUTF8"] }),
    minFreeBytes: 1,
    ...options,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const { port } = server.address();
  return { url: `http://127.0.0.1:${port}`, deliveries, receiptDir };
}

function sha256(raw) {
  return createHash("sha256").update(raw).digest("hex");
}

function headers(raw, overrides = {}) {
  const result = {
    Authorization: `Bearer ${TEST_TOKEN}`,
    "Content-Type": "message/rfc822",
    "Idempotency-Key": "message-1",
    "X-GSYEN-Envelope-From": "sender@example.com",
    "X-GSYEN-Envelope-To": "ethan@gsyen.com",
    "X-GSYEN-Raw-SHA256": sha256(raw),
    ...overrides,
  };
  if (!("X-GSYEN-Delivery-ID" in overrides)) {
    result["X-GSYEN-Delivery-ID"] = deriveDeliveryId(
      result["Idempotency-Key"],
      result["X-GSYEN-Envelope-To"],
      sha256(raw),
    );
  }
  return result;
}

function mirrorRequest(url, raw, overrides = {}) {
  return fetch(`${url}/internal/mail/mirror`, {
    method: "POST",
    headers: headers(raw, overrides),
    body: raw,
  });
}

async function onlyReceipt(receiptDir) {
  const names = (await readdir(receiptDir)).filter((name) => name.endsWith(".json"));
  assert.equal(names.length, 1);
  return JSON.parse(await readFile(path.join(receiptDir, names[0]), "utf8"));
}

test("matches the Worker delivery-ID test vector", () => {
  assert.equal(
    deriveDeliveryId("mirror-message-1", "ETHAN@GSYEN.COM", "a".repeat(64)),
    "df70f439ffd9196359b71e558df78e5a21e52aa9eb537dd4ea6c6cbaff5dc099",
  );
});

test("persists an auditable accepted receipt and deduplicates an exact retry", async () => {
  const raw = Buffer.from([
    "From: sender@example.com",
    "Message-ID: <mirror-audit@example.com>",
    "Subject: test",
    "",
    "hello",
  ].join("\r\n"));
  const { url, deliveries, receiptDir } = await start();

  const first = await mirrorRequest(url, raw);
  assert.equal(first.status, 204);
  const expectedDeliveryId = deriveDeliveryId(
    "message-1",
    "ethan@gsyen.com",
    sha256(raw),
  );
  assert.equal(first.headers.get("x-gsyen-delivery-id"), expectedDeliveryId);
  assert.equal(first.headers.get("x-gsyen-raw-sha256"), sha256(raw));
  const retry = await mirrorRequest(url, raw);
  assert.equal(retry.status, 204);
  assert.equal(retry.headers.get("x-gsyen-delivery-id"), expectedDeliveryId);
  assert.equal(retry.headers.get("x-gsyen-raw-sha256"), sha256(raw));

  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].recipient, "ethan@gsyen.com");
  const receipt = await onlyReceipt(receiptDir);
  assert.equal(receipt.status, "accepted");
  assert.equal(receipt.messageId, "message-1");
  assert.equal(receipt.internetMessageId, "<mirror-audit@example.com>");
  assert.equal(receipt.recipient, "ethan@gsyen.com");
  assert.equal(receipt.envelopeFrom, "sender@example.com");
  assert.equal(receipt.rawSha256, sha256(raw));
  assert.equal(receipt.rawBytes, raw.length);
  assert.equal(receipt.attempts, 1);
  assert.equal(receipt.smtpResult, "250 2.0.0 accepted");
  assert.match(receipt.firstAttemptAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(receipt.acceptedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(
    deliveries[0].raw.toString("latin1"),
    new RegExp(`^X-GSYEN-Mirror-ID: ${receipt.deliveryId}\\r\\n`
      + `X-GSYEN-Raw-SHA256: ${receipt.rawSha256}\\r\\nFrom:`),
  );
});

test("preserves recipient case, dots, and plus-tag in SMTP and the receipt", async () => {
  const raw = Buffer.from("Message-ID: <recipient-shape@example.com>\r\n\r\nmessage");
  const recipient = "Ethan.Test+Migration@GSYEN.COM";
  const { url, deliveries, receiptDir } = await start();

  const response = await mirrorRequest(url, raw, {
    "X-GSYEN-Envelope-To": recipient,
  });

  assert.equal(response.status, 204);
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].recipient, recipient);
  const receipt = await onlyReceipt(receiptDir);
  assert.equal(receipt.recipient, recipient);
  assert.equal(
    receipt.deliveryId,
    deriveDeliveryId("message-1", recipient, sha256(raw)),
  );
});

test("rejects unauthorized, foreign-domain, and hash-mismatched requests", async () => {
  const raw = Buffer.from("Message-ID: <reject@example.com>\r\n\r\nmessage");
  const { url, deliveries } = await start();
  const unauthorized = await mirrorRequest(url, raw, { Authorization: "Bearer wrong" });
  assert.equal(unauthorized.status, 401);
  const foreign = await mirrorRequest(url, raw, {
    "X-GSYEN-Envelope-To": "ethan@example.com",
  });
  assert.equal(foreign.status, 400);
  const mismatched = await mirrorRequest(url, raw, {
    "X-GSYEN-Raw-SHA256": "0".repeat(64),
  });
  assert.equal(mismatched.status, 422);
  const wrongDeliveryId = await mirrorRequest(url, raw, {
    "X-GSYEN-Delivery-ID": "0".repeat(64),
  });
  assert.equal(wrongDeliveryId.status, 422);
  assert.equal(deliveries.length, 0);
});

test("fails closed until the Stalwart duplicate guard is verified", async () => {
  const raw = Buffer.from("Message-ID: <guard@example.com>\r\n\r\nmessage");
  const { url, deliveries } = await start({ duplicateGuardVerified: false });
  const health = await fetch(`${url}/healthz`);
  assert.equal(health.status, 503);
  const snapshot = await health.json();
  assert.equal(snapshot.ok, false);
  assert.equal(snapshot.technicalReady, true);
  assert.deepEqual(snapshot.manualGate, {
    required: true,
    duplicateGuardVersion: "gsyen-mirror-rfc7352-v1",
    duplicateGuardVerified: false,
  });
  assert.equal(snapshot.checks.receiptStorage.writable, true);
  assert.equal(snapshot.checks.receiptStorage.spaceAvailable, true);
  assert.equal(snapshot.checks.smtp.reachable, true);
  assert.equal(snapshot.exactlyOnceClaimed, false);
  const response = await mirrorRequest(url, raw);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), "300");
  assert.equal(deliveries.length, 0);
});

test("rejects a mirror token shorter than 32 bytes at startup", () => {
  assert.throws(
    () => createIngestServer({ token: "too-short" }),
    /MAIL_MIRROR_TOKEN_must_be_43_to_128_base64url_characters/,
  );
});

test("reports technical health separately from the manual duplicate guard", async () => {
  const { url } = await start({
    duplicateGuardVerified: true,
    smtpProbe: async () => {
      throw new Error("smtp_probe_failed");
    },
  });
  const response = await fetch(`${url}/healthz`);
  assert.equal(response.status, 503);
  const snapshot = await response.json();
  assert.equal(snapshot.ok, false);
  assert.equal(snapshot.technicalReady, false);
  assert.equal(snapshot.manualGate.duplicateGuardVerified, true);
  assert.equal(snapshot.checks.receiptStorage.writable, true);
  assert.equal(snapshot.checks.smtp.reachable, false);
  assert.equal(snapshot.checks.smtp.error, "smtp_probe_failed");
});

test("health fails when the receipt path is not writable or free space is below policy", async () => {
  const healthDirectory = await mkdtemp(path.join(os.tmpdir(), "gsyen-mail-health-"));
  temporaryDirectories.push(healthDirectory);
  const badReceiptPath = path.join(healthDirectory, "not-a-directory");
  await writeFile(badReceiptPath, "occupied");
  const broken = await start({ receiptDir: badReceiptPath });
  const brokenResponse = await fetch(`${broken.url}/healthz`);
  assert.equal(brokenResponse.status, 503);
  const brokenSnapshot = await brokenResponse.json();
  assert.equal(brokenSnapshot.checks.receiptStorage.writable, false);
  assert.equal(brokenSnapshot.technicalReady, false);

  const lowSpace = await start({ minFreeBytes: Number.MAX_SAFE_INTEGER });
  const lowSpaceResponse = await fetch(`${lowSpace.url}/healthz`);
  assert.equal(lowSpaceResponse.status, 503);
  const lowSpaceSnapshot = await lowSpaceResponse.json();
  assert.equal(lowSpaceSnapshot.checks.receiptStorage.writable, true);
  assert.equal(lowSpaceSnapshot.checks.receiptStorage.spaceAvailable, false);
  assert.equal(lowSpaceSnapshot.technicalReady, false);
});

test("limits concurrent MIME buffers before entering SMTP", async () => {
  let markStarted;
  let releaseDelivery;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const gate = new Promise((resolve) => { releaseDelivery = resolve; });
  const { url } = await start({
    maxConcurrentDeliveries: 1,
    smtpDeliver: async () => {
      markStarted();
      await gate;
      return "250 2.0.0 accepted";
    },
  });
  const firstRaw = Buffer.from("Message-ID: <first@example.com>\r\n\r\nfirst");
  const secondRaw = Buffer.from("Message-ID: <second@example.com>\r\n\r\nsecond");
  const first = mirrorRequest(url, firstRaw);
  await started;
  const limited = await mirrorRequest(url, secondRaw, {
    "Idempotency-Key": "message-2",
  });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "1");
  assert.equal(limited.headers.get("x-gsyen-error-code"), "concurrency_limit");
  releaseDelivery();
  assert.equal((await first).status, 204);
});

test("does not leak a concurrency slot when headers are rejected", async () => {
  const raw = Buffer.from("Message-ID: <slot@example.com>\r\n\r\nmessage");
  const { url } = await start({ maxConcurrentDeliveries: 1 });
  const invalid = await mirrorRequest(url, raw, {
    "X-GSYEN-Envelope-To": "other@example.com",
  });
  assert.equal(invalid.status, 400);
  assert.equal((await mirrorRequest(url, raw)).status, 204);
});

test("records a failed attempt and reuses the same trusted ID on retry", async () => {
  const raw = Buffer.from("Message-ID: <retry@example.com>\r\n\r\nmessage");
  const deliveries = [];
  let attempts = 0;
  const { url, receiptDir } = await start({
    smtpDeliver: async (delivery) => {
      deliveries.push(delivery);
      attempts += 1;
      if (attempts === 1) throw new Error("smtp_451_RCPT");
      return "250 2.0.0 recovered";
    },
  });

  assert.equal((await mirrorRequest(url, raw)).status, 503);
  const failed = await onlyReceipt(receiptDir);
  assert.equal(failed.status, "delivering");
  assert.equal(failed.attempts, 1);
  assert.equal(failed.lastError, "smtp_451_RCPT");
  assert.match(failed.lastFailureAt, /^\d{4}-\d{2}-\d{2}T/);

  assert.equal((await mirrorRequest(url, raw)).status, 204);
  const accepted = await onlyReceipt(receiptDir);
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.attempts, 2);
  assert.equal(accepted.deliveryId, failed.deliveryId);
  assert.equal(accepted.smtpResult, "250 2.0.0 recovered");
  const mirrorIds = deliveries.map((delivery) => (
    /^X-GSYEN-Mirror-ID: ([0-9a-f]{64})\r\n/.exec(delivery.raw.toString("latin1"))?.[1]
  ));
  assert.deepEqual(mirrorIds, [failed.deliveryId, failed.deliveryId]);
});

test("maps a permanent SMTP capability failure to 422 without logging the recipient", async () => {
  const raw = Buffer.from("Message-ID: <smtp-permanent@example.com>\r\n\r\nmessage");
  const originalError = console.error;
  const logs = [];
  console.error = (value) => { logs.push(String(value)); };
  try {
    const { url } = await start({
      smtpDeliver: async () => {
        throw Object.assign(new Error("smtp_smtputf8_required"), { status: 422 });
      },
    });
    const response = await mirrorRequest(url, raw);
    assert.equal(response.status, 422);
    assert.equal(response.headers.get("x-gsyen-error-code"), "smtp_smtputf8_required");
  } finally {
    console.error = originalError;
  }
  assert.equal(logs.length, 1);
  assert.ok(!logs[0].includes("ethan@gsyen.com"));
  assert.match(logs[0], /"recipientDomain":"gsyen.com"/);
});

test("reclaims an expired lease and advances a durable delivering receipt", async () => {
  const raw = Buffer.from("Message-ID: <lease@example.com>\r\n\r\nmessage");
  const rawHash = sha256(raw);
  const deliveryId = deriveDeliveryId("message-1", "ethan@gsyen.com", rawHash);
  const receiptKey = deriveReceiptKey("message-1");
  const receiptDir = await mkdtemp(path.join(os.tmpdir(), "gsyen-mail-mirror-stale-"));
  temporaryDirectories.push(receiptDir);
  const old = "2026-08-25T00:00:00.000Z";
  await mkdir(receiptDir, { recursive: true });
  await writeFile(path.join(receiptDir, `${receiptKey}.json`), JSON.stringify({
    version: 1,
    status: "delivering",
    deliveryId,
    messageId: "message-1",
    internetMessageId: "<lease@example.com>",
    recipient: "ethan@gsyen.com",
    envelopeFrom: "sender@example.com",
    rawSha256: rawHash,
    rawBytes: raw.length,
    attempts: 1,
    firstAttemptAt: old,
    lastAttemptAt: old,
    acceptedAt: null,
    smtpResult: null,
    lastFailureAt: null,
    lastError: null,
  }));
  await writeFile(path.join(receiptDir, `${receiptKey}.lease`), JSON.stringify({
    version: 1,
    token: "abandoned-token",
    deliveryId,
    acquiredAt: old,
    expiresAt: "2026-08-25T00:02:00.000Z",
  }));
  const { url, deliveries } = await start({ receiptDir });

  assert.equal((await mirrorRequest(url, raw)).status, 204);
  assert.equal(deliveries.length, 1);
  const receipt = await onlyReceipt(receiptDir);
  assert.equal(receipt.status, "accepted");
  assert.equal(receipt.attempts, 2);
  assert.equal(receipt.firstAttemptAt, old);
});

test("returns 409 for concurrent delivery and for conflicting accepted metadata", async () => {
  const raw = Buffer.from("Message-ID: <concurrent@example.com>\r\n\r\nmessage");
  let currentTime = new Date("2026-08-26T00:00:00.000Z");
  let releaseDelivery;
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const gate = new Promise((resolve) => { releaseDelivery = resolve; });
  const { url, deliveries } = await start({
    leaseMs: 30_000,
    smtpTimeoutMs: 15_000,
    now: () => currentTime,
    smtpDeliver: async (delivery) => {
      deliveries.push(delivery);
      markStarted();
      await gate;
      return "250 2.0.0 accepted";
    },
  });

  const first = mirrorRequest(url, raw);
  await started;
  // Even if a synthetic wall clock passes the file lease boundary while the
  // first SMTP call is active, this single process must not start SMTP twice.
  currentTime = new Date("2026-08-26T00:00:31.000Z");
  const concurrent = await mirrorRequest(url, raw);
  assert.equal(concurrent.status, 409);
  assert.ok(Number(concurrent.headers.get("retry-after")) >= 1);
  assert.equal(concurrent.headers.get("x-gsyen-error-code"), "delivery_in_progress");
  releaseDelivery();
  assert.equal((await first).status, 204);

  const conflict = await mirrorRequest(url, raw, {
    "X-GSYEN-Envelope-From": "other@example.com",
  });
  assert.equal(conflict.status, 409);
  assert.equal(
    conflict.headers.get("x-gsyen-error-code"),
    "accepted_receipt_metadata_conflict",
  );
  assert.equal(deliveries.length, 1);
});

test("fails closed when one Idempotency-Key is reused for different raw or recipient", async () => {
  const firstRaw = Buffer.from("Message-ID: <reuse@example.com>\r\n\r\nfirst");
  const changedRaw = Buffer.from("Message-ID: <reuse@example.com>\r\n\r\nchanged");
  const { url, deliveries, receiptDir } = await start();
  assert.equal((await mirrorRequest(url, firstRaw)).status, 204);

  const rawConflict = await mirrorRequest(url, changedRaw);
  assert.equal(rawConflict.status, 409);
  const recipientConflict = await mirrorRequest(url, firstRaw, {
    "X-GSYEN-Envelope-To": "other@gsyen.com",
  });
  assert.equal(recipientConflict.status, 409);
  assert.equal(deliveries.length, 1);
  assert.equal((await readdir(receiptDir)).filter((name) => name.endsWith(".json")).length, 1);
});

test("accepts a null reverse-path and passes it to SMTP as an empty sender", async () => {
  const raw = Buffer.from("Message-ID: <dsn@example.com>\r\n\r\nstatus notification");
  const { url, deliveries } = await start();
  const response = await mirrorRequest(url, raw, {
    "X-GSYEN-Envelope-From": "",
  });
  assert.equal(response.status, 204);
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].envelopeFrom, "");
});

test("records a folded RFC Message-ID when parseable and null when absent", async () => {
  const foldedRaw = Buffer.from("Message-ID:\r\n <folded@example.com>\r\n\r\nmessage");
  const folded = await start();
  assert.equal((await mirrorRequest(folded.url, foldedRaw)).status, 204);
  assert.equal((await onlyReceipt(folded.receiptDir)).internetMessageId,
    "<folded@example.com>");

  const noIdRaw = Buffer.from("Subject: no id\r\n\r\nmessage");
  const noId = await start();
  assert.equal((await mirrorRequest(noId.url, noIdRaw, {
    "Idempotency-Key": "message-without-rfc-id",
  })).status, 204);
  assert.equal((await onlyReceipt(noId.receiptDir)).internetMessageId, null);
});

test("pins a loopback-only RFC 7352 guard for at least 30 days", async () => {
  const template = await readFile(new URL(
    "../../stalwart/sieve/gsyen-mirror-dedupe.sieve",
    import.meta.url,
  ), "utf8");
  assert.match(template, /require \["variables", "duplicate"\]/);
  assert.match(template, /env\.remote_ip/);
  assert.match(template, /"127\.0\.0\.1"/);
  assert.match(template, /"::1"/);
  assert.match(template, /"::ffff:127\.0\.0\.1"/);
  assert.match(template, /:header "X-GSYEN-Mirror-ID"/);
  assert.match(template, /:handle "gsyen-cloudflare-mirror-v1"/);
  assert.match(template, /:seconds 2678400/);
  assert.match(template, /discard;\s+stop;/);
});
