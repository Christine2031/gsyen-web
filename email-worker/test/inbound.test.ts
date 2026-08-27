import {
  applyD1Migrations,
  env,
  type D1Migration,
} from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import {
  cleanupObjectDeletionJobs,
  deleteTrashedMessage,
  updateMessageState,
} from "../src/repository";
import {
  assertInboundSchemaReady,
  backfillStalwartMirrorOutbox,
  INBOUND_EXTRACTION_CHUNK_SIZE,
  INBOUND_MAX_D1_QUERY_BUDGET,
  INBOUND_MAX_R2_OPERATION_BUDGET,
  INBOUND_POST_BATCH_FAILURE_D1_QUERIES,
  INBOUND_PRIMARY_D1_QUERY_OVERHEAD,
  receiveEmail,
  recoverInboundIngestReceipts,
} from "../src/inbound";
import type { MailEnv } from "../src/types";

type TestEnv = MailEnv & {
  TEST_MIGRATIONS: D1Migration[];
};

const testEnv = env as TestEnv;

beforeEach(async () => {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  await testEnv.DB.batch([
    testEnv.DB.prepare("DELETE FROM stalwart_mirror_outbox"),
    testEnv.DB.prepare("DELETE FROM inbound_manual_interventions"),
    testEnv.DB.prepare("DELETE FROM attachments"),
    testEnv.DB.prepare("DELETE FROM messages"),
    testEnv.DB.prepare("DELETE FROM inbound_ingest_receipts"),
    testEnv.DB.prepare("DELETE FROM audit_events"),
    testEnv.DB.prepare("DELETE FROM send_usage"),
    testEnv.DB.prepare("DELETE FROM mailboxes"),
  ]);
});

function emailMessage(
  to: string,
  raw: string,
  onReject: (reason: string) => void,
  from = "sender@example.com",
): ForwardableEmailMessage {
  const bytes = new TextEncoder().encode(raw);
  return {
    from,
    to,
    raw: new Blob([bytes]).stream(),
    rawSize: bytes.byteLength,
    headers: new Headers(),
    setReject: onReject,
  } as unknown as ForwardableEmailMessage;
}

async function createActiveMailbox(): Promise<void> {
  const now = new Date().toISOString();
  await testEnv.DB.prepare(
    `INSERT INTO mailboxes
      (id, owner_id, local_part, address, display_name, status, created_at, approved_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
  ).bind(
    "mailbox-inbound",
    "user-inbound",
    "ethan",
    "ethan@gsyen.com",
    "Ethan",
    now,
    now,
  ).run();
  await testEnv.DB.prepare(
    `INSERT INTO mailbox_addresses
      (address, local_part, mailbox_id, kind, created_at)
     VALUES (?, ?, ?, 'primary', ?)`,
  ).bind("ethan@gsyen.com", "ethan", "mailbox-inbound", now).run();
}

function rawWithAttachments(
  count: number,
  messageId = `<attachments-${count}@example.com>`,
): string {
  const boundary = `attachments-${count}-boundary`;
  const parts = Array.from({ length: count }, (_, index) => [
    `--${boundary}`,
    `Content-Type: text/plain; name=file-${index}.txt`,
    `Content-Disposition: attachment; filename=file-${index}.txt`,
    "",
    `file-${index}`,
  ].join("\r\n"));
  return [
    "From: Sender <sender@example.com>",
    "To: Ethan <ethan@gsyen.com>",
    `Message-ID: ${messageId}`,
    `Subject: ${count} attachments`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary=${boundary}`,
    "",
    ...parts,
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

describe("inbound email", () => {
  it("parses, stores, and deduplicates the same raw envelope delivery", async () => {
    await createActiveMailbox();
    const raw = [
      "From: Sender <sender@example.com>",
      "To: Ethan <ethan@gsyen.com>",
      "Message-ID: <message-1@example.com>",
      "Subject: Test message",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Safe plain text",
    ].join("\r\n");
    let rejection = "";
    await receiveEmail(emailMessage(
      "ethan+test@gsyen.com",
      raw,
      (reason) => { rejection = reason; },
    ), testEnv);
    await receiveEmail(emailMessage(
      "ethan+test@gsyen.com",
      raw,
      (reason) => { rejection = reason; },
    ), testEnv);
    const result = await testEnv.DB.prepare(
      `SELECT subject, text_body, raw_object_key, raw_sha256,
              envelope_from_address, envelope_to_address,
              mailbox_lookup_address, delivery_target_address
         FROM messages WHERE mailbox_id = ?`,
    ).bind("mailbox-inbound").all<{
      subject: string;
      text_body: string;
      raw_object_key: string;
      raw_sha256: string;
      envelope_from_address: string;
      envelope_to_address: string;
      mailbox_lookup_address: string;
      delivery_target_address: string;
    }>();
    expect(rejection).toBe("");
    expect(result.results).toHaveLength(1);
    expect(result.results[0].subject).toBe("Test message");
    expect(result.results[0].text_body).toContain("Safe plain text");
    expect(result.results[0].envelope_from_address).toBe("sender@example.com");
    expect(result.results[0].envelope_to_address).toBe("ethan+test@gsyen.com");
    expect(result.results[0].mailbox_lookup_address).toBe("ethan@gsyen.com");
    expect(result.results[0].delivery_target_address).toBe("ethan+test@gsyen.com");
    expect(result.results[0].raw_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(await testEnv.MAIL_OBJECTS.head(result.results[0].raw_object_key)).not.toBeNull();
  });

  it("keeps separate deliveries of the same raw message to distinct envelope targets", async () => {
    await createActiveMailbox();
    const raw = [
      "From: Sender <sender@example.com>",
      "To: Ethan <ethan@gsyen.com>",
      "Message-ID: <multi-target@example.com>",
      "Subject: Multi target",
      "",
      "Same bytes, two SMTP targets",
    ].join("\r\n");

    await receiveEmail(emailMessage("ethan@gsyen.com", raw, () => {}), testEnv);
    await receiveEmail(emailMessage("ethan+archive@gsyen.com", raw, () => {}), testEnv);

    const deliveries = await testEnv.DB.prepare(
      `SELECT envelope_to_address, mailbox_lookup_address,
              delivery_target_address, raw_sha256
         FROM messages WHERE internet_message_id = ?
         ORDER BY envelope_to_address`,
    ).bind("<multi-target@example.com>").all<{
      envelope_to_address: string;
      mailbox_lookup_address: string;
      delivery_target_address: string;
      raw_sha256: string;
    }>();
    expect(deliveries.results).toHaveLength(2);
    expect(new Set(deliveries.results.map((delivery) => delivery.raw_sha256)).size).toBe(1);
    expect(deliveries.results.map((delivery) => delivery.envelope_to_address)).toEqual([
      "ethan+archive@gsyen.com",
      "ethan@gsyen.com",
    ]);
    expect(deliveries.results.every(
      (delivery) => delivery.mailbox_lookup_address === "ethan@gsyen.com"
        && delivery.delivery_target_address === delivery.envelope_to_address,
    )).toBe(true);
  });

  it("commits one durable outbox record before an async Queue failure", async () => {
    await createActiveMailbox();
    const raw = [
      "From: Sender <sender@example.com>",
      "To: Ethan <ethan@gsyen.com>",
      "Message-ID: <durable-outbox@example.com>",
      "Subject: Durable mirror",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Persist before mirror",
    ].join("\r\n");
    const send = vi.fn(async () => {
      throw new Error("queue unavailable");
    });
    const mirrorEnv = {
      ...testEnv,
      STALWART_MIRROR_ENABLED: "true",
      STALWART_MIRROR_URL: "https://mail-ingest.example/internal/mail/mirror",
      STALWART_MIRROR_TOKEN: "test-token",
      STALWART_MIRROR_QUEUE: { send },
    } as unknown as MailEnv;
    const background: Promise<unknown>[] = [];
    const ctx = {
      waitUntil(promise: Promise<unknown>) {
        background.push(promise);
      },
      passThroughOnException() {},
      props: {},
    } as unknown as ExecutionContext;
    const first = emailMessage("ethan@gsyen.com", raw, () => {});
    const duplicate = emailMessage("ethan@gsyen.com", raw, () => {});

    await expect(worker.email(first, mirrorEnv, ctx)).resolves.toBeUndefined();
    await expect(Promise.all(background)).resolves.toBeDefined();
    await expect(worker.email(duplicate, mirrorEnv, ctx)).resolves.toBeUndefined();
    await expect(Promise.all(background)).resolves.toBeDefined();

    expect(send).toHaveBeenCalledOnce();
    const stored = await testEnv.DB.prepare(
      `SELECT m.id, m.raw_object_key, m.raw_sha256, o.idempotency_key,
              o.delivery_id, o.payload_json,
              o.status, o.attempts
         FROM messages m
         JOIN stalwart_mirror_outbox o ON o.message_id = m.id
        WHERE m.internet_message_id = ?`,
    ).bind("<durable-outbox@example.com>").all<{
      id: string;
      raw_object_key: string;
      raw_sha256: string;
      idempotency_key: string;
      delivery_id: string;
      payload_json: string;
      status: string;
      attempts: number;
    }>();
    expect(stored.results).toHaveLength(1);
    expect(stored.results[0].idempotency_key).toBe(stored.results[0].id);
    expect(stored.results[0].status).toBe("pending");
    expect(stored.results[0].attempts).toBe(1);
    expect(JSON.parse(stored.results[0].payload_json)).toEqual({
      kind: "stalwart_mirror",
      messageId: stored.results[0].id,
      rawObjectKey: stored.results[0].raw_object_key,
      rawSha256: stored.results[0].raw_sha256,
      deliveryId: stored.results[0].delivery_id,
      envelopeFrom: "sender@example.com",
      recipient: "ethan@gsyen.com",
    });
  });

  it("persists a null SMTP reverse-path in the durable mirror job", async () => {
    await createActiveMailbox();
    const raw = [
      "From: Mail Delivery Subsystem <mailer-daemon@example.com>",
      "To: Ethan <ethan@gsyen.com>",
      "Message-ID: <null-reverse-path@example.com>",
      "Subject: Delivery status",
      "",
      "Status notification",
    ].join("\r\n");
    const mirrorEnv = {
      ...testEnv,
      STALWART_MIRROR_ENABLED: "true",
    } as unknown as MailEnv;

    await receiveEmail(
      emailMessage("ethan@gsyen.com", raw, () => {}, ""),
      mirrorEnv,
    );

    const stored = await testEnv.DB.prepare(
      `SELECT delivery_id, payload_json FROM stalwart_mirror_outbox
        WHERE message_id = (
          SELECT id FROM messages WHERE internet_message_id = ?
        )`,
    ).bind("<null-reverse-path@example.com>").first<{
      delivery_id: string;
      payload_json: string;
    }>();
    expect(stored?.delivery_id).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.parse(stored?.payload_json ?? "{}")).toMatchObject({
      envelopeFrom: "",
      deliveryId: stored?.delivery_id,
    });
  });

  it("stores SHA-256 values for the raw EML and every attachment", async () => {
    await createActiveMailbox();
    const raw = [
      "From: Sender <sender@example.com>",
      "To: Ethan <ethan@gsyen.com>",
      "Message-ID: <attachment-hash@example.com>",
      "Subject: Attachment hashes",
      "MIME-Version: 1.0",
      "Content-Type: multipart/mixed; boundary=hash-boundary",
      "",
      "--hash-boundary",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Body",
      "--hash-boundary",
      "Content-Type: text/plain; name=proof.txt",
      "Content-Disposition: attachment; filename=proof.txt",
      "Content-Transfer-Encoding: base64",
      "",
      "cHJvb2Y=",
      "--hash-boundary--",
      "",
    ].join("\r\n");

    await receiveEmail(emailMessage("ethan@gsyen.com", raw, () => {}), testEnv);

    const message = await testEnv.DB.prepare(
      "SELECT id, raw_sha256 FROM messages WHERE internet_message_id = ?",
    ).bind("<attachment-hash@example.com>").first<{
      id: string;
      raw_sha256: string;
    }>();
    const attachment = await testEnv.DB.prepare(
      "SELECT filename, sha256 FROM attachments WHERE message_id = ?",
    ).bind(message?.id).first<{ filename: string; sha256: string }>();
    expect(message?.raw_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(attachment).toEqual({
      filename: "proof.txt",
      sha256: "c1cda26362828b69266512052b97cb3729e3b052e4ade47c0a1e3383defe73c7",
    });
  });

  it("stores distinct raw messages that reuse the same Message-ID", async () => {
    await createActiveMailbox();
    const prefix = [
      "From: Sender <sender@example.com>",
      "To: Ethan <ethan@gsyen.com>",
      "Message-ID: <conflicting-message-id@example.com>",
      "Subject: Conflict",
      "",
    ].join("\r\n");
    await receiveEmail(emailMessage(
      "ethan@gsyen.com",
      `${prefix}\r\nfirst`,
      () => {},
    ), testEnv);

    await expect(receiveEmail(emailMessage(
      "ethan@gsyen.com",
      `${prefix}\r\nsecond`,
      () => {},
    ), testEnv)).resolves.toBeUndefined();

    const messages = await testEnv.DB.prepare(
      `SELECT id, raw_sha256 FROM messages
        WHERE internet_message_id = ? AND mailbox_id = ?`,
    ).bind(
      "<conflicting-message-id@example.com>",
      "mailbox-inbound",
    ).all<{ id: string; raw_sha256: string }>();
    expect(messages.results).toHaveLength(2);
    expect(new Set(messages.results.map((message) => message.raw_sha256)).size).toBe(2);
  });

  it("preserves exact envelope targets and reverse-path casing for mirror delivery", async () => {
    await createActiveMailbox();
    const raw = [
      "From: Sender <sender@example.com>",
      "To: Ethan <ethan@gsyen.com>",
      "Message-ID: <original-envelope@example.com>",
      "Subject: Original envelope",
      "",
      "Preserve the SMTP transaction",
    ].join("\r\n");
    const mirrorEnv = {
      ...testEnv,
      STALWART_MIRROR_ENABLED: "true",
    } as unknown as MailEnv;

    await receiveEmail(emailMessage(
      "E.than+CaseTag@gsyen.com",
      raw,
      () => {},
      "Sender.Tag+Route@Example.COM",
    ), mirrorEnv);

    const stored = await testEnv.DB.prepare(
      `SELECT m.envelope_from_address, m.envelope_to_address,
              m.mailbox_lookup_address, m.delivery_target_address,
              o.payload_json
         FROM messages AS m
         JOIN stalwart_mirror_outbox AS o ON o.message_id = m.id
        WHERE m.internet_message_id = ?`,
    ).bind("<original-envelope@example.com>").first<{
      envelope_from_address: string;
      envelope_to_address: string;
      mailbox_lookup_address: string;
      delivery_target_address: string;
      payload_json: string;
    }>();
    expect(stored).toMatchObject({
      envelope_from_address: "Sender.Tag+Route@Example.COM",
      envelope_to_address: "E.than+CaseTag@gsyen.com",
      mailbox_lookup_address: "ethan@gsyen.com",
      delivery_target_address: "E.than+CaseTag@gsyen.com",
    });
    expect(JSON.parse(stored?.payload_json ?? "{}")).toMatchObject({
      envelopeFrom: "Sender.Tag+Route@Example.COM",
      recipient: "E.than+CaseTag@gsyen.com",
    });
  });

  it("retains staged R2 objects and resumes after a D1 outbox failure", async () => {
    await createActiveMailbox();
    await testEnv.DB.prepare(
      `CREATE TRIGGER reject_test_mirror_outbox
         BEFORE INSERT ON stalwart_mirror_outbox
         BEGIN
           SELECT RAISE(ABORT, 'forced_outbox_failure');
         END`,
    ).run();
    const mirrorEnv = {
      ...testEnv,
      STALWART_MIRROR_ENABLED: "true",
    } as unknown as MailEnv;
    const raw = [
      "From: Sender <sender@example.com>",
      "To: Ethan <ethan@gsyen.com>",
      "Message-ID: <outbox-rollback@example.com>",
      "Subject: Roll back",
      "",
      "This message must not commit alone",
    ].join("\r\n");

    try {
      await expect(receiveEmail(
        emailMessage("ethan@gsyen.com", raw, () => {}),
        mirrorEnv,
      )).rejects.toThrow();
    } finally {
      await testEnv.DB.prepare("DROP TRIGGER reject_test_mirror_outbox").run();
    }

    const messageCount = await testEnv.DB.prepare(
      "SELECT count(*) AS count FROM messages WHERE internet_message_id = ?",
    ).bind("<outbox-rollback@example.com>").first<{ count: number }>();
    const outboxCount = await testEnv.DB.prepare(
      "SELECT count(*) AS count FROM stalwart_mirror_outbox",
    ).first<{ count: number }>();
    const receipt = await testEnv.DB.prepare(
      `SELECT status, extraction_status, raw_object_key
         FROM inbound_ingest_receipts ORDER BY created_at DESC LIMIT 1`,
    ).first<{
      status: string;
      extraction_status: string;
      raw_object_key: string;
    }>();
    expect(messageCount?.count).toBe(0);
    expect(outboxCount?.count).toBe(0);
    expect(receipt?.status).toBe("reconcile_needed");
    expect(receipt?.extraction_status).toBe("pending");
    expect(await testEnv.MAIL_OBJECTS.head(receipt?.raw_object_key ?? "")).not.toBeNull();

    await expect(recoverInboundIngestReceipts(mirrorEnv)).resolves.toMatchObject({
      committed: 1,
      completed: 1,
    });
    expect(await testEnv.DB.prepare(
      "SELECT count(*) AS count FROM messages WHERE internet_message_id = ?",
    ).bind("<outbox-rollback@example.com>").first<{ count: number }>())
      .toEqual({ count: 1 });
    expect(await testEnv.DB.prepare(
      "SELECT status FROM inbound_ingest_receipts WHERE internet_message_id = ?",
    ).bind("<outbox-rollback@example.com>").first<{ status: string }>())
      .toEqual({ status: "committed" });
  });

  it("verifies the receipt after an ambiguous D1 batch response", async () => {
    await createActiveMailbox();
    let failAfterCommit = true;
    const ambiguousDb = {
      prepare: (query: string) => testEnv.DB.prepare(query),
      withSession: (constraint?: D1SessionBookmark | D1SessionConstraint) => (
        testEnv.DB.withSession(constraint)
      ),
      batch: async (statements: D1PreparedStatement[]) => {
        const result = await testEnv.DB.batch(statements);
        if (failAfterCommit) {
          failAfterCommit = false;
          throw new Error("ambiguous response after commit");
        }
        return result;
      },
    } as unknown as D1Database;
    const ambiguousEnv = {
      ...testEnv,
      DB: ambiguousDb,
    } as MailEnv;
    const raw = [
      "From: Sender <sender@example.com>",
      "To: Ethan <ethan@gsyen.com>",
      "Message-ID: <ambiguous-batch@example.com>",
      "Subject: Ambiguous batch",
      "",
      "Verify by internal receipt ID",
    ].join("\r\n");

    await expect(receiveEmail(
      emailMessage("ethan@gsyen.com", raw, () => {}),
      ambiguousEnv,
    )).resolves.toBeUndefined();
    const stored = await testEnv.DB.prepare(
      `SELECT r.status, m.id FROM inbound_ingest_receipts AS r
       JOIN messages AS m ON m.ingest_receipt_id = r.id
       WHERE r.internet_message_id = ?`,
    ).bind("<ambiguous-batch@example.com>").all<{
      status: string;
      id: string;
    }>();
    expect(stored.results).toHaveLength(1);
    expect(stored.results[0].status).toBe("committed");
  });

  it("accepts the primary record and scheduled recovery resumes attachment R2 failure", async () => {
    await createActiveMailbox();
    const raw = [
      "From: Sender <sender@example.com>",
      "To: Ethan <ethan@gsyen.com>",
      "Message-ID: <r2-resume@example.com>",
      "Subject: R2 resume",
      "MIME-Version: 1.0",
      "Content-Type: multipart/mixed; boundary=resume-boundary",
      "",
      "--resume-boundary",
      "Content-Type: text/plain",
      "",
      "Body",
      "--resume-boundary",
      "Content-Type: text/plain; name=resume.txt",
      "Content-Disposition: attachment; filename=resume.txt",
      "",
      "attachment",
      "--resume-boundary--",
      "",
    ].join("\r\n");
    const failingBucket = {
      put: async (
        key: string,
        value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob,
        options?: R2PutOptions,
      ) => {
        if (key.startsWith("attachments/")) {
          throw new Error("simulated attachment write failure");
        }
        return testEnv.MAIL_OBJECTS.put(key, value, options);
      },
      get: (key: string) => testEnv.MAIL_OBJECTS.get(key),
      head: (key: string) => testEnv.MAIL_OBJECTS.head(key),
    } as unknown as R2Bucket;
    const failingEnv = {
      ...testEnv,
      MAIL_OBJECTS: failingBucket,
    } as MailEnv;

    await expect(receiveEmail(
      emailMessage("ethan@gsyen.com", raw, () => {}),
      failingEnv,
    )).resolves.toBeUndefined();
    const staged = await testEnv.DB.prepare(
      `SELECT status, extraction_status, raw_object_key
         FROM inbound_ingest_receipts
        WHERE internet_message_id = ?`,
    ).bind("<r2-resume@example.com>").first<{
      status: string;
      extraction_status: string;
      raw_object_key: string;
    }>();
    expect(staged?.status).toBe("committed");
    expect(staged?.extraction_status).toBe("pending");
    expect(await testEnv.MAIL_OBJECTS.head(staged?.raw_object_key ?? "")).not.toBeNull();

    await testEnv.DB.prepare(
      `UPDATE inbound_ingest_receipts
          SET next_extraction_attempt_at = ? WHERE internet_message_id = ?`,
    ).bind(new Date(0).toISOString(), "<r2-resume@example.com>").run();
    await expect(recoverInboundIngestReceipts(testEnv)).resolves.toMatchObject({
      completed: 1,
    });
    expect(await testEnv.DB.prepare(
      "SELECT status FROM inbound_ingest_receipts WHERE internet_message_id = ?",
    ).bind("<r2-resume@example.com>").first<{ status: string }>())
      .toEqual({ status: "committed" });
    expect(await testEnv.DB.prepare(
      "SELECT count(*) AS count FROM attachments",
    ).first<{ count: number }>()).toEqual({ count: 1 });
  });

  it("accepts and fully persists 33 attachments without truncation", async () => {
    await createActiveMailbox();
    const boundary = "too-many-attachments";
    const parts = Array.from({ length: 33 }, (_, index) => [
      `--${boundary}`,
      `Content-Type: text/plain; name=file-${index}.txt`,
      `Content-Disposition: attachment; filename=file-${index}.txt`,
      "",
      `file-${index}`,
    ].join("\r\n"));
    const raw = [
      "From: Sender <sender@example.com>",
      "To: Ethan <ethan@gsyen.com>",
      "Message-ID: <too-many-attachments@example.com>",
      "Subject: Too many attachments",
      "MIME-Version: 1.0",
      `Content-Type: multipart/mixed; boundary=${boundary}`,
      "",
      ...parts,
      `--${boundary}--`,
      "",
    ].join("\r\n");
    let rejection = "";

    await receiveEmail(emailMessage(
      "ethan@gsyen.com",
      raw,
      (reason) => { rejection = reason; },
    ), testEnv);
    expect(rejection).toBe("");
    expect(await testEnv.DB.prepare(
      "SELECT count(*) AS count FROM messages",
    ).first<{ count: number }>()).toEqual({ count: 1 });
    expect(await testEnv.DB.prepare(
      "SELECT count(*) AS count FROM attachments",
    ).first<{ count: number }>()).toEqual({ count: 30 });
    const pending = await testEnv.DB.prepare(
      `SELECT r.extraction_status, r.attachment_total_count,
              r.extracted_attachment_count, m.extraction_status AS message_status,
              m.attachment_total_count AS message_total
         FROM inbound_ingest_receipts AS r
         JOIN messages AS m ON m.ingest_receipt_id = r.id`,
    ).first<{
      extraction_status: string;
      attachment_total_count: number;
      extracted_attachment_count: number;
      message_status: string;
      message_total: number;
    }>();
    expect(pending).toEqual({
      extraction_status: "pending",
      attachment_total_count: 33,
      extracted_attachment_count: 30,
      message_status: "pending",
      message_total: 33,
    });
    await expect(recoverInboundIngestReceipts(testEnv)).resolves.toMatchObject({
      completed: 1,
    });
    expect(await testEnv.DB.prepare(
      `SELECT r.extraction_status, r.extracted_attachment_count,
              (SELECT COUNT(*) FROM attachments AS a
                WHERE a.message_id = r.message_id) AS stored_count
         FROM inbound_ingest_receipts AS r`,
    ).first()).toMatchObject({
      extraction_status: "complete",
      extracted_attachment_count: 33,
      stored_count: 33,
    });
    expect(INBOUND_EXTRACTION_CHUNK_SIZE).toBe(30);
  });

  it("keeps a partial attachment chunk hidden until scheduled completion", async () => {
    await createActiveMailbox();
    const raw = rawWithAttachments(34);

    await expect(receiveEmail(
      emailMessage("ethan@gsyen.com", raw, () => {}),
      testEnv,
    )).resolves.toBeUndefined();

    const pending = await testEnv.DB.prepare(
      `SELECT m.id, m.extraction_status, m.attachment_total_count,
              (SELECT COUNT(*) FROM attachments AS a WHERE a.message_id = m.id)
                AS stored_count
         FROM messages AS m WHERE m.internet_message_id = ?`,
    ).bind("<attachments-34@example.com>").first<{
      id: string;
      extraction_status: string;
      attachment_total_count: number;
      stored_count: number;
    }>();
    expect(pending).toMatchObject({
      extraction_status: "pending",
      attachment_total_count: 34,
      stored_count: 30,
    });
    const publicRows = await testEnv.DB.prepare(
      `SELECT COUNT(*) AS count FROM attachments AS a
         JOIN messages AS m ON m.id = a.message_id
        WHERE a.message_id = ? AND m.extraction_status = 'complete'`,
    ).bind(pending?.id).first<{ count: number }>();
    expect(publicRows).toEqual({ count: 0 });

    await expect(recoverInboundIngestReceipts(testEnv)).resolves.toMatchObject({
      completed: 1,
    });
    expect(await testEnv.DB.prepare(
      `SELECT m.extraction_status,
              (SELECT COUNT(*) FROM attachments AS a WHERE a.message_id = m.id)
                AS stored_count
         FROM messages AS m WHERE m.id = ?`,
    ).bind(pending?.id).first()).toMatchObject({
      extraction_status: "complete",
      stored_count: 34,
    });
  });

  it("uses a receipt lease so concurrent scheduled recovery finalizes once", async () => {
    await createActiveMailbox();
    await receiveEmail(emailMessage(
      "ethan@gsyen.com",
      rawWithAttachments(34, "<lease-concurrency@example.com>"),
      () => {},
    ), testEnv);
    const results = await Promise.all([
      recoverInboundIngestReceipts(testEnv),
      recoverInboundIngestReceipts(testEnv),
    ]);
    expect(results.reduce((count, result) => count + result.completed, 0)).toBe(1);
    const state = await testEnv.DB.prepare(
      `SELECT r.extraction_status, r.extraction_attempts,
              r.extraction_lease_token, r.extracted_attachment_count,
              (SELECT COUNT(*) FROM attachments AS a
                WHERE a.message_id = r.message_id) AS stored_count
         FROM inbound_ingest_receipts AS r
        WHERE r.internet_message_id = ?`,
    ).bind("<lease-concurrency@example.com>").first<{
      extraction_status: string;
      extraction_attempts: number;
      extraction_lease_token: string | null;
      extracted_attachment_count: number;
      stored_count: number;
    }>();
    expect(state).toEqual({
      extraction_status: "complete",
      extraction_attempts: 0,
      extraction_lease_token: null,
      extracted_attachment_count: 34,
      stored_count: 34,
    });
  });

  it("retries a transient R2 read error and resolves prior receipt incidents on success", async () => {
    await createActiveMailbox();
    await receiveEmail(emailMessage(
      "ethan@gsyen.com",
      rawWithAttachments(34, "<transient-r2@example.com>"),
      () => {},
    ), testEnv);
    const receipt = await testEnv.DB.prepare(
      `SELECT id, message_id FROM inbound_ingest_receipts
        WHERE internet_message_id = ?`,
    ).bind("<transient-r2@example.com>").first<{
      id: string;
      message_id: string;
    }>();
    const now = new Date().toISOString();
    await testEnv.DB.prepare(
      `INSERT INTO inbound_manual_interventions
        (id, receipt_id, message_id, reason_code, status, created_at, updated_at)
       VALUES (?, ?, ?, 'operator_recovery_watch', 'open', ?, ?)`,
    ).bind(
      `test-watch:${receipt?.id}`,
      receipt?.id,
      receipt?.message_id,
      now,
      now,
    ).run();
    const transientEnv = {
      ...testEnv,
      MAIL_OBJECTS: {
        get: async () => { throw new Error("temporary_r2_timeout"); },
      },
    } as unknown as MailEnv;
    await expect(recoverInboundIngestReceipts(transientEnv)).resolves.toMatchObject({
      pending: 1,
      terminal: 0,
    });
    expect(await testEnv.DB.prepare(
      `SELECT extraction_status, extraction_last_error
         FROM inbound_ingest_receipts WHERE id = ?`,
    ).bind(receipt?.id).first()).toMatchObject({
      extraction_status: "pending",
      extraction_last_error: "temporary_r2_timeout",
    });
    expect(await testEnv.DB.prepare(
      "SELECT status FROM inbound_manual_interventions WHERE receipt_id = ?",
    ).bind(receipt?.id).first()).toEqual({ status: "open" });

    await testEnv.DB.prepare(
      `UPDATE inbound_ingest_receipts
          SET next_extraction_attempt_at = CASE WHEN id = ? THEN ? ELSE ? END
        WHERE extraction_status = 'pending'`,
    ).bind(
      receipt?.id,
      new Date(0).toISOString(),
      new Date("2999-01-01T00:00:00.000Z").toISOString(),
    ).run();
    await expect(recoverInboundIngestReceipts(testEnv)).resolves.toMatchObject({
      completed: 1,
      terminal: 0,
    });
    expect(await testEnv.DB.prepare(
      `SELECT status, resolved_at FROM inbound_manual_interventions
        WHERE receipt_id = ?`,
    ).bind(receipt?.id).first()).toMatchObject({ status: "resolved" });
  });

  it("keeps the extraction chunk below D1 and R2 operation ceilings", () => {
    const extractionStatements = 1 // reset prior attachment rows
      + INBOUND_EXTRACTION_CHUNK_SIZE
      + 2; // message + receipt state; mirror capture is in primary overhead
    const successfulInvocationQueries =
      INBOUND_PRIMARY_D1_QUERY_OVERHEAD + extractionStatements;
    expect(successfulInvocationQueries)
      .toBeLessThanOrEqual(INBOUND_MAX_D1_QUERY_BUDGET - 3);
    expect(successfulInvocationQueries + INBOUND_POST_BATCH_FAILURE_D1_QUERIES)
      .toBeLessThanOrEqual(INBOUND_MAX_D1_QUERY_BUDGET - 1);
    const worstCaseR2Operations = 2 // raw put + verified readback
      + 2 // quarantined HTML put + head
      + (INBOUND_EXTRACTION_CHUNK_SIZE * 2); // attachment put + hash readback
    expect(worstCaseR2Operations).toBe(INBOUND_MAX_R2_OPERATION_BUDGET);
  });

  it("captures a durable mirror outbox row while delivery is disabled and backfills gaps", async () => {
    await createActiveMailbox();
    const raw = [
      "From: Sender <sender@example.com>",
      "To: Ethan <ethan@gsyen.com>",
      "Message-ID: <disabled-capture@example.com>",
      "Subject: Capture while disabled",
      "",
      "Primary delivery",
    ].join("\r\n");
    expect(testEnv.STALWART_MIRROR_ENABLED).not.toBe("true");

    await receiveEmail(emailMessage("ethan@gsyen.com", raw, () => {}), testEnv);
    const captured = await testEnv.DB.prepare(
      `SELECT o.status, o.message_id
         FROM stalwart_mirror_outbox AS o
         JOIN messages AS m ON m.id = o.message_id
        WHERE m.internet_message_id = ?`,
    ).bind("<disabled-capture@example.com>").first<{
      status: string;
      message_id: string;
    }>();
    expect(captured?.status).toBe("pending");

    await testEnv.DB.prepare(
      "DELETE FROM stalwart_mirror_outbox WHERE message_id = ?",
    ).bind(captured?.message_id).run();
    await expect(backfillStalwartMirrorOutbox(testEnv)).resolves.toBe(1);
    expect(await testEnv.DB.prepare(
      "SELECT COUNT(*) AS count FROM stalwart_mirror_outbox WHERE message_id = ?",
    ).bind(captured?.message_id).first<{ count: number }>()).toEqual({ count: 1 });
  });

  it("retains a deletion tombstone and never resurrects a replayed delivery", async () => {
    await createActiveMailbox();
    const raw = [
      "From: Sender <sender@example.com>",
      "To: Ethan <ethan@gsyen.com>",
      "Message-ID: <deleted-tombstone@example.com>",
      "Subject: Delete safely",
      "",
      "Primary record",
    ].join("\r\n");
    await receiveEmail(emailMessage("ethan@gsyen.com", raw, () => {}), testEnv);
    const stored = await testEnv.DB.prepare(
      `SELECT m.id, m.raw_object_key, m.ingest_receipt_id
         FROM messages AS m WHERE m.internet_message_id = ?`,
    ).bind("<deleted-tombstone@example.com>").first<{
      id: string;
      raw_object_key: string;
      ingest_receipt_id: string;
    }>();
    await updateMessageState(testEnv, "mailbox-inbound", stored!.id, { trashed: true });
    await deleteTrashedMessage(testEnv, "mailbox-inbound", stored!.id);
    const tombstone = await testEnv.DB.prepare(
      `SELECT status, extraction_status, deleted_at, retention_hold
         FROM inbound_ingest_receipts WHERE id = ?`,
    ).bind(stored?.ingest_receipt_id).first<{
      status: string;
      extraction_status: string;
      deleted_at: string;
      retention_hold: number;
    }>();
    expect(tombstone).toMatchObject({
      status: "committed",
      extraction_status: "terminal",
      retention_hold: 1,
    });
    expect(tombstone?.deleted_at).toBeTruthy();
    expect(await testEnv.DB.prepare(
      "SELECT status FROM stalwart_mirror_outbox WHERE message_id = ?",
    ).bind(stored?.id).first<{ status: string }>()).toEqual({ status: "terminal" });
    await cleanupObjectDeletionJobs(testEnv);
    expect(await testEnv.MAIL_OBJECTS.get(stored?.raw_object_key ?? "")).toBeNull();

    await expect(receiveEmail(
      emailMessage("ethan@gsyen.com", raw, () => {}),
      testEnv,
    )).resolves.toBeUndefined();
    expect(await testEnv.DB.prepare(
      "SELECT COUNT(*) AS count FROM messages WHERE internet_message_id = ?",
    ).bind("<deleted-tombstone@example.com>").first<{ count: number }>())
      .toEqual({ count: 0 });
    expect(await testEnv.DB.prepare(
      "SELECT COUNT(*) AS count FROM inbound_ingest_receipts WHERE id = ?",
    ).bind(stored?.ingest_receipt_id).first<{ count: number }>())
      .toEqual({ count: 1 });
  });

  it("requires the complete mirror schema even when delivery is disabled", async () => {
    await testEnv.DB.prepare(
      "DROP INDEX stalwart_mirror_outbox_raw_object",
    ).run();
    try {
      await expect(assertInboundSchemaReady(testEnv))
        .rejects.toThrow("0022_inbound_identity_contract.sql");
    } finally {
      await testEnv.DB.prepare(
        `CREATE INDEX stalwart_mirror_outbox_raw_object
           ON stalwart_mirror_outbox(raw_object_key, status)`,
      ).run();
    }
  });

  it("preserves an extreme attachment message as raw-only terminal evidence", async () => {
    await createActiveMailbox();
    let rejection = "";
    await receiveEmail(emailMessage(
      "ethan@gsyen.com",
      rawWithAttachments(257, "<extreme-attachments@example.com>"),
      (reason) => { rejection = reason; },
    ), testEnv);
    expect(rejection).toBe("");
    const stored = await testEnv.DB.prepare(
      `SELECT m.extraction_status, m.attachment_total_count, m.raw_object_key,
              r.extraction_status AS receipt_status,
              r.extraction_last_error, i.reason_code
         FROM messages AS m
         JOIN inbound_ingest_receipts AS r ON r.id = m.ingest_receipt_id
         JOIN inbound_manual_interventions AS i ON i.receipt_id = r.id
        WHERE m.internet_message_id = ?`,
    ).bind("<extreme-attachments@example.com>").first<{
      extraction_status: string;
      attachment_total_count: number;
      raw_object_key: string;
      receipt_status: string;
      extraction_last_error: string;
      reason_code: string;
    }>();
    expect(stored).toMatchObject({
      extraction_status: "terminal",
      attachment_total_count: 257,
      receipt_status: "terminal",
      extraction_last_error: "attachment_count_exceeds_automatic_limit",
      reason_code: "attachment_count_exceeds_automatic_limit",
    });
    expect(await testEnv.MAIL_OBJECTS.get(stored?.raw_object_key ?? "")).not.toBeNull();
    expect(await testEnv.DB.prepare(
      "SELECT COUNT(*) AS count FROM attachments",
    ).first<{ count: number }>()).toEqual({ count: 0 });
  });

  it("keeps the legacy index during expand so an old/new crash retry cannot duplicate", async () => {
    await createActiveMailbox();
    const legacyMessageId = "00000000-0000-4000-8000-000000000777";
    const internetId = "<old-new-crash@example.com>";
    const now = new Date().toISOString();
    await testEnv.DB.prepare(
      `INSERT INTO messages
        (id, mailbox_id, direction, folder, internet_message_id, from_address,
         to_json, cc_json, subject, text_body, references_json, status,
         created_at, received_at)
       VALUES (?, 'mailbox-inbound', 'inbound', 'inbox', ?, 'sender@example.com',
         '["ethan@gsyen.com"]', '[]', 'Legacy committed', 'Body', '[]',
         'received', ?, ?)`,
    ).bind(legacyMessageId, internetId, now, now).run();
    await testEnv.DB.prepare(
      `CREATE UNIQUE INDEX messages_inbound_dedupe
         ON messages(mailbox_id, internet_message_id)
       WHERE direction = 'inbound' AND internet_message_id IS NOT NULL`,
    ).run();
    await testEnv.DB.prepare(
      `UPDATE mail_worker_release_contract
          SET value = 'gsyen-inbound-receipt-v2-expand-0021'
        WHERE name = 'inbound_primary_path'`,
    ).run();
    const retryRaw = [
      "From: Sender <sender@example.com>",
      "To: Ethan <ethan@gsyen.com>",
      `Message-ID: ${internetId}`,
      "Subject: Retry after ambiguous old commit",
      "",
      "Same SMTP retry cannot be proven from legacy metadata",
    ].join("\r\n");
    try {
      await expect(receiveEmail(
        emailMessage("ethan@gsyen.com", retryRaw, () => {}),
        testEnv,
      )).rejects.toThrow();
      expect(await testEnv.DB.prepare(
        "SELECT COUNT(*) AS count FROM messages WHERE internet_message_id = ?",
      ).bind(internetId).first<{ count: number }>()).toEqual({ count: 1 });
      const staged = await testEnv.DB.prepare(
        `SELECT r.status, r.extraction_status, r.extraction_last_error,
                r.raw_object_key, i.reason_code
           FROM inbound_ingest_receipts AS r
           JOIN inbound_manual_interventions AS i ON i.receipt_id = r.id
          LIMIT 1`,
      ).first<{
        status: string;
        extraction_status: string;
        extraction_last_error: string;
        raw_object_key: string;
        reason_code: string;
      }>();
      expect(staged).toMatchObject({
        status: "reconcile_needed",
        extraction_status: "terminal",
        extraction_last_error: "legacy_identity_ambiguous",
        reason_code: "legacy_identity_ambiguous",
      });
      expect(await testEnv.MAIL_OBJECTS.get(staged?.raw_object_key ?? "")).not.toBeNull();
      await expect(assertInboundSchemaReady(testEnv)).resolves.toBe("expand");
    } finally {
      await testEnv.DB.prepare("DROP INDEX IF EXISTS messages_inbound_dedupe").run();
      await testEnv.DB.prepare(
        `UPDATE mail_worker_release_contract
            SET value = 'gsyen-inbound-receipt-v2-contract-0022'
          WHERE name = 'inbound_primary_path'`,
      ).run();
    }
    await expect(recoverInboundIngestReceipts(testEnv)).resolves.toMatchObject({
      inspected: 0,
      committed: 0,
      completed: 0,
    });
    expect(await testEnv.DB.prepare(
      "SELECT COUNT(*) AS count FROM messages WHERE internet_message_id = ?",
    ).bind(internetId).first<{ count: number }>()).toEqual({ count: 1 });
  });

  it("hard-stops a mismatched expand/contract schema pair", async () => {
    await expect(assertInboundSchemaReady(testEnv)).resolves.toBe("contract");
    await testEnv.DB.prepare(
      `CREATE UNIQUE INDEX messages_inbound_dedupe
         ON messages(mailbox_id, internet_message_id)
       WHERE direction = 'inbound' AND internet_message_id IS NOT NULL`,
    ).run();
    try {
      await expect(assertInboundSchemaReady(testEnv))
        .rejects.toThrow("0022_inbound_identity_contract.sql");
    } finally {
      await testEnv.DB.prepare("DROP INDEX messages_inbound_dedupe").run();
    }
  });

  it("rejects the retired mail subdomain without storing content", async () => {
    let rejection = "";
    await receiveEmail(emailMessage(
      "ethan@mail.gsyen.com",
      "From: sender@example.com\r\n\r\nHello",
      (reason) => { rejection = reason; },
    ), testEnv);
    const count = await testEnv.DB.prepare(
      "SELECT count(*) AS count FROM messages",
    ).first<{ count: number }>();
    expect(rejection).toContain("domain is not accepted");
    expect(count?.count).toBe(0);
  });

  it("rejects an unknown root-domain recipient without storing content", async () => {
    let rejection = "";
    await receiveEmail(emailMessage(
      "unknown@gsyen.com",
      "From: sender@example.com\r\n\r\nHello",
      (reason) => { rejection = reason; },
    ), testEnv);
    const count = await testEnv.DB.prepare(
      "SELECT count(*) AS count FROM messages",
    ).first<{ count: number }>();
    expect(rejection).toContain("Mailbox does not exist or is inactive");
    expect(rejection).not.toContain("domain is not accepted");
    expect(count?.count).toBe(0);
  });
});
