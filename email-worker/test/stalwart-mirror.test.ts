import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  consumeStalwartMirror,
  consumeStalwartMirrorDeadLetters,
  deriveStalwartMirrorDeliveryId,
  drainStalwartMirrorOutbox,
  enqueueStalwartMirror,
  requeueStalwartMirrorDeadLetters,
  STALWART_MIRROR_OUTBOX_MAX_ATTEMPTS,
} from "../src/stalwartMirror";
import { getOperationsSnapshot } from "../src/operations";
import type { MailEnv, StalwartMirrorJob } from "../src/types";

const job: StalwartMirrorJob = {
  kind: "stalwart_mirror",
  messageId: "mirror-message-1",
  rawObjectKey: "raw/mirror-message-1.eml",
  rawSha256: "a".repeat(64),
  deliveryId: "df70f439ffd9196359b71e558df78e5a21e52aa9eb537dd4ea6c6cbaff5dc099",
  envelopeFrom: "sender@example.com",
  recipient: "ethan@gsyen.com",
};

const testEnv = env as MailEnv & { TEST_MIGRATIONS: D1Migration[] };

beforeEach(async () => {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  await testEnv.DB.prepare("DELETE FROM stalwart_mirror_outbox").run();
  await testEnv.DB.prepare("DELETE FROM stalwart_mirror_dead_letters").run();
  await testEnv.DB.prepare("DELETE FROM stalwart_mirror_terminal_events").run();
  await testEnv.MAIL_OBJECTS.delete(job.rawObjectKey);
});

async function insertOutbox(options: {
  status?: "pending" | "leased" | "enqueued" | "delivered" | "dead_letter" | "terminal";
  attempts?: number;
  nextAttemptAt?: string;
  leaseToken?: string | null;
  leaseExpiresAt?: string | null;
  enqueuedAt?: string | null;
  payloadJson?: string;
  mirrorJob?: StalwartMirrorJob;
} = {}): Promise<void> {
  const now = "2026-08-26T00:00:00.000Z";
  const mirrorJob = options.mirrorJob ?? job;
  await testEnv.DB.prepare(
    `INSERT INTO stalwart_mirror_outbox
      (idempotency_key, message_id, raw_object_key, delivery_id, payload_json, status, attempts,
       next_attempt_at, lease_token, lease_expires_at, enqueued_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    mirrorJob.messageId,
    mirrorJob.messageId,
    mirrorJob.rawObjectKey,
    mirrorJob.deliveryId,
    options.payloadJson ?? JSON.stringify(mirrorJob),
    options.status ?? "pending",
    options.attempts ?? 0,
    options.nextAttemptAt ?? now,
    options.leaseToken ?? null,
    options.leaseExpiresAt ?? null,
    options.enqueuedAt ?? null,
    now,
    now,
  ).run();
}

function configuredEnv(send: ReturnType<typeof vi.fn>): MailEnv {
  return {
    ...testEnv,
    STALWART_MIRROR_ENABLED: "true",
    STALWART_MIRROR_URL: "https://mail-ingest.example/internal/mail/mirror",
    STALWART_MIRROR_ALLOWED_HOST: "mail-ingest.example",
    STALWART_MIRROR_TOKEN: "test-token",
    STALWART_MIRROR_QUEUE: { send },
  } as unknown as MailEnv;
}

function queueMessage(
  body: StalwartMirrorJob,
  options: { id?: string; attempts?: number } = {},
) {
  return {
    id: options.id ?? "queue-message-1",
    timestamp: new Date(),
    body,
    attempts: options.attempts ?? 1,
    ack: vi.fn(),
    retry: vi.fn(),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Stalwart mirror", () => {
  it("derives the cross-runtime delivery ID from message, recipient, and raw hash", async () => {
    expect(await deriveStalwartMirrorDeliveryId(
      job.messageId,
      job.recipient.toUpperCase(),
      job.rawSha256,
    )).toBe(job.deliveryId);
  });

  it("does nothing while the mirror is disabled", async () => {
    const send = vi.fn();
    await enqueueStalwartMirror({
      ...env,
      STALWART_MIRROR_ENABLED: "false",
      STALWART_MIRROR_QUEUE: { send },
    } as unknown as MailEnv, job);
    expect(send).not.toHaveBeenCalled();
  });

  it("requires every mirror setting when enabled", async () => {
    await expect(enqueueStalwartMirror({
      ...env,
      STALWART_MIRROR_ENABLED: "true",
    } as unknown as MailEnv, job)).rejects.toThrow(
      "stalwart_mirror_enabled_but_not_configured",
    );
  });

  it("refuses to enqueue when the mirror URL could expose its bearer token", async () => {
    await expect(enqueueStalwartMirror({
      ...env,
      STALWART_MIRROR_ENABLED: "true",
      STALWART_MIRROR_URL: "http://mail-ingest.example/internal/mail/mirror",
      STALWART_MIRROR_TOKEN: "test-token",
      STALWART_MIRROR_QUEUE: { send: vi.fn() },
    } as unknown as MailEnv, job)).rejects.toThrow(
      "stalwart_mirror_enabled_but_not_configured",
    );
  });

  it("requires the configured URL to match one exact HTTPS host and path", async () => {
    for (const url of [
      "https://other.example/internal/mail/mirror",
      "https://mail-ingest.example:8443/internal/mail/mirror",
      "https://mail-ingest.example/internal/mail/mirror?next=other",
      "https://mail-ingest.example/other",
    ]) {
      await expect(enqueueStalwartMirror({
        ...env,
        STALWART_MIRROR_ENABLED: "true",
        STALWART_MIRROR_URL: url,
        STALWART_MIRROR_ALLOWED_HOST: "mail-ingest.example",
        STALWART_MIRROR_TOKEN: "test-token",
        STALWART_MIRROR_QUEUE: { send: vi.fn() },
      } as unknown as MailEnv, job)).rejects.toThrow(
        "stalwart_mirror_enabled_but_not_configured",
      );
    }
  });

  it("posts the original MIME and acknowledges successful delivery", async () => {
    await insertOutbox({ status: "enqueued" });
    await env.MAIL_OBJECTS.put(job.rawObjectKey, "Subject: mirror\r\n\r\nhello");
    const fetchMock = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) => new Response(null, {
      status: 204,
      headers: {
        "X-GSYEN-Delivery-ID": job.deliveryId,
        "X-GSYEN-Raw-SHA256": job.rawSha256,
      },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const message = queueMessage(job);
    const mirrorEnv = configuredEnv(vi.fn());

    await consumeStalwartMirror({
      queue: "gsyen-mail-stalwart-mirror-test",
      messages: [message],
      ackAll: vi.fn(),
      retryAll: vi.fn(),
    } as unknown as MessageBatch<StalwartMirrorJob>, mirrorEnv);

    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect((request.headers as Record<string, string>)["Idempotency-Key"])
      .toBe(job.messageId);
    expect((request.headers as Record<string, string>)["X-GSYEN-Raw-SHA256"])
      .toBe(job.rawSha256);
    expect((request.headers as Record<string, string>)["X-GSYEN-Delivery-ID"])
      .toBe(job.deliveryId);
    expect(request.redirect).toBe("error");
    expect(request.signal).toBeInstanceOf(AbortSignal);
    const outbox = await mirrorEnv.DB.prepare(
      "SELECT status, delivered_at FROM stalwart_mirror_outbox WHERE idempotency_key = ?",
    ).bind(job.messageId).first<{ status: string; delivered_at: string | null }>();
    expect(outbox?.status).toBe("delivered");
    expect(outbox?.delivered_at).not.toBeNull();
  });

  it("repairs a matching pending outbox when Queue acceptance won the D1 race", async () => {
    await insertOutbox({ status: "pending" });
    await env.MAIL_OBJECTS.put(job.rawObjectKey, "Subject: mirror\r\n\r\nhello");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, {
      status: 204,
      headers: {
        "X-GSYEN-Delivery-ID": job.deliveryId,
        "X-GSYEN-Raw-SHA256": job.rawSha256,
      },
    })));
    const message = queueMessage(job);

    await consumeStalwartMirror({
      queue: "gsyen-mail-stalwart-mirror-test",
      messages: [message],
      ackAll: vi.fn(),
      retryAll: vi.fn(),
    } as unknown as MessageBatch<StalwartMirrorJob>, configuredEnv(vi.fn()));

    expect(message.ack).toHaveBeenCalledOnce();
    const stored = await testEnv.DB.prepare(
      `SELECT status FROM stalwart_mirror_outbox WHERE idempotency_key = ?`,
    ).bind(job.messageId).first<{ status: string }>();
    expect(stored?.status).toBe("delivered");
  });

  it("terminalizes an enqueued job whose authoritative R2 object is missing", async () => {
    await insertOutbox({ status: "enqueued" });
    const message = queueMessage(job);

    await consumeStalwartMirror({
      queue: "gsyen-mail-stalwart-mirror-test",
      messages: [message],
      ackAll: vi.fn(),
      retryAll: vi.fn(),
    } as unknown as MessageBatch<StalwartMirrorJob>, configuredEnv(vi.fn()));

    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
    const stored = await testEnv.DB.prepare(
      `SELECT status, last_error FROM stalwart_mirror_outbox
        WHERE idempotency_key = ?`,
    ).bind(job.messageId).first<{ status: string; last_error: string }>();
    expect(stored).toEqual({
      status: "terminal",
      last_error: "stalwart_mirror_raw_object_missing",
    });
  });

  it("retries when the gateway is unavailable", async () => {
    await insertOutbox({ status: "enqueued" });
    await env.MAIL_OBJECTS.put(job.rawObjectKey, "Subject: mirror\r\n\r\nhello");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
    const message = queueMessage(job);

    await consumeStalwartMirror({
      queue: "gsyen-mail-stalwart-mirror-test",
      messages: [message],
      ackAll: vi.fn(),
      retryAll: vi.fn(),
    } as unknown as MessageBatch<StalwartMirrorJob>, configuredEnv(vi.fn()));

    expect(message.ack).not.toHaveBeenCalled();
    expect(message.retry).toHaveBeenCalledWith({ delaySeconds: 60 });
  });

  it("retries recoverable auth, route, timeout, overload, and gateway HTTP failures", async () => {
    for (const scenario of [
      { response: new Response(null, { status: 401 }), delaySeconds: 60 },
      { response: new Response(null, { status: 403 }), delaySeconds: 60 },
      { response: new Response(null, { status: 404 }), delaySeconds: 60 },
      { response: new Response(null, { status: 408 }), delaySeconds: 60 },
      { response: new Response(null, { status: 425 }), delaySeconds: 60 },
      {
        response: new Response(null, {
          status: 429,
          headers: { "Retry-After": "7" },
        }),
        delaySeconds: 7,
      },
      { response: new Response(null, { status: 502 }), delaySeconds: 60 },
      { response: new Response(null, {
        status: 409,
        headers: {
          "Retry-After": "3",
          "X-GSYEN-Error-Code": "delivery_in_progress",
        },
      }), delaySeconds: 3 },
    ]) {
      await testEnv.DB.prepare("DELETE FROM stalwart_mirror_outbox").run();
      await insertOutbox({ status: "enqueued" });
      await env.MAIL_OBJECTS.put(job.rawObjectKey, "Subject: mirror\r\n\r\nhello");
      vi.stubGlobal("fetch", vi.fn(async () => scenario.response));
      const message = queueMessage(job);

      await consumeStalwartMirror({
        queue: "gsyen-mail-stalwart-mirror-test",
        messages: [message],
        ackAll: vi.fn(),
        retryAll: vi.fn(),
      } as unknown as MessageBatch<StalwartMirrorJob>, configuredEnv(vi.fn()));

      expect(message.ack).not.toHaveBeenCalled();
      expect(message.retry).toHaveBeenCalledOnce();
      expect(message.retry).toHaveBeenCalledWith({
        delaySeconds: scenario.delaySeconds,
      });
      const outbox = await testEnv.DB.prepare(
        `SELECT status, last_error, delivery_cycles
           FROM stalwart_mirror_outbox WHERE idempotency_key = ?`,
      ).bind(job.messageId).first<{
        status: string;
        last_error: string | null;
        delivery_cycles: number;
      }>();
      expect(outbox).toEqual({
        status: "enqueued",
        last_error: null,
        delivery_cycles: 0,
      });
    }
  });

  it("persists 400/409-conflict/413/422 as terminal and acknowledges", async () => {
    for (const status of [400, 409, 413, 422]) {
      await testEnv.DB.prepare("DELETE FROM stalwart_mirror_terminal_events").run();
      await testEnv.DB.prepare("DELETE FROM stalwart_mirror_outbox").run();
      await insertOutbox({ status: "enqueued" });
      await env.MAIL_OBJECTS.put(job.rawObjectKey, "Subject: mirror\r\n\r\nhello");
      vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status })));
      const message = queueMessage(job);

      await consumeStalwartMirror({
        queue: "gsyen-mail-stalwart-mirror-test",
        messages: [message],
        ackAll: vi.fn(),
        retryAll: vi.fn(),
      } as unknown as MessageBatch<StalwartMirrorJob>, configuredEnv(vi.fn()));

      expect(message.ack).toHaveBeenCalledOnce();
      expect(message.retry).not.toHaveBeenCalled();
      const outbox = await testEnv.DB.prepare(
        `SELECT status, last_error FROM stalwart_mirror_outbox
          WHERE idempotency_key = ?`,
      ).bind(job.messageId).first<{ status: string; last_error: string }>();
      expect(outbox?.status).toBe("terminal");
      expect(outbox?.last_error).toContain(`stalwart_mirror_http_${status}`);
    }
  });

  it("terminalizes non-204 success and acknowledgement metadata conflicts", async () => {
    await env.MAIL_OBJECTS.put(job.rawObjectKey, "Subject: mirror\r\n\r\nhello");
    for (const response of [
      new Response(null, { status: 200 }),
      new Response(null, {
        status: 204,
        headers: {
          "X-GSYEN-Delivery-ID": "0".repeat(64),
          "X-GSYEN-Raw-SHA256": job.rawSha256,
        },
      }),
    ]) {
      await testEnv.DB.prepare("DELETE FROM stalwart_mirror_terminal_events").run();
      await testEnv.DB.prepare("DELETE FROM stalwart_mirror_outbox").run();
      await insertOutbox({ status: "enqueued" });
      vi.stubGlobal("fetch", vi.fn(async () => response));
      const message = queueMessage(job);
      await consumeStalwartMirror({
        queue: "gsyen-mail-stalwart-mirror-test",
        messages: [message],
        ackAll: vi.fn(),
        retryAll: vi.fn(),
      } as unknown as MessageBatch<StalwartMirrorJob>, configuredEnv(vi.fn()));
      expect(message.ack).toHaveBeenCalledOnce();
      expect(message.retry).not.toHaveBeenCalled();
      const stored = await testEnv.DB.prepare(
        `SELECT status, terminal_at FROM stalwart_mirror_outbox
          WHERE idempotency_key = ?`,
      ).bind(job.messageId).first<{
        status: string;
        terminal_at: string | null;
      }>();
      expect(stored?.status).toBe("terminal");
      expect(stored?.terminal_at).not.toBeNull();
      const events = await testEnv.DB.prepare(
        "SELECT count(*) AS count FROM stalwart_mirror_terminal_events",
      ).first<{ count: number }>();
      expect(events?.count).toBe(1);
    }
  });

  it("preserves an empty Cloudflare envelope sender through the mirror HTTP header", async () => {
    const messageId = "mirror-null-sender";
    const nullSenderJob: StalwartMirrorJob = {
      ...job,
      messageId,
      rawObjectKey: "raw/mirror-null-sender.eml",
      deliveryId: await deriveStalwartMirrorDeliveryId(
        messageId,
        job.recipient,
        job.rawSha256,
      ),
      envelopeFrom: "",
    };
    await insertOutbox({ status: "enqueued", mirrorJob: nullSenderJob });
    await env.MAIL_OBJECTS.put(nullSenderJob.rawObjectKey, "Subject: DSN\r\n\r\nstatus");
    const fetchMock = vi.fn(async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ) => new Response(null, {
      status: 204,
      headers: {
        "X-GSYEN-Delivery-ID": nullSenderJob.deliveryId,
        "X-GSYEN-Raw-SHA256": nullSenderJob.rawSha256,
      },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const message = queueMessage(nullSenderJob);

    await consumeStalwartMirror({
      queue: "gsyen-mail-stalwart-mirror-test",
      messages: [message],
      ackAll: vi.fn(),
      retryAll: vi.fn(),
    } as unknown as MessageBatch<StalwartMirrorJob>, configuredEnv(vi.fn()));

    expect(message.ack).toHaveBeenCalledOnce();
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect((request.headers as Record<string, string>)["X-GSYEN-Envelope-From"])
      .toBe("");
  });

  it("acknowledges a late duplicate whose delivered raw object was already cleaned", async () => {
    await insertOutbox({ status: "delivered" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const message = queueMessage(job);

    await consumeStalwartMirror({
      queue: "gsyen-mail-stalwart-mirror-test",
      messages: [message],
      ackAll: vi.fn(),
      retryAll: vi.fn(),
    } as unknown as MessageBatch<StalwartMirrorJob>, configuredEnv(vi.fn()));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
    const stored = await testEnv.DB.prepare(
      "SELECT status FROM stalwart_mirror_outbox WHERE idempotency_key = ?",
    ).bind(job.messageId).first<{ status: string }>();
    expect(stored?.status).toBe("delivered");
  });

  it("acks but persistently records a Queue job with no authoritative outbox", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const message = queueMessage(job);

    await consumeStalwartMirror({
      queue: "gsyen-mail-stalwart-mirror-test",
      messages: [message],
      ackAll: vi.fn(),
      retryAll: vi.fn(),
    } as unknown as MessageBatch<StalwartMirrorJob>, configuredEnv(vi.fn()));

    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    const event = await testEnv.DB.prepare(
      `SELECT reason, message_id FROM stalwart_mirror_terminal_events
        WHERE queue_message_id = ?`,
    ).bind(message.id).first<{ reason: string; message_id: string }>();
    expect(event).toEqual({ reason: "outbox_missing", message_id: job.messageId });
  });

  it("terminally records mailbox control-character poison while disabled", async () => {
    const poisoned = {
      ...job,
      recipient: "ethan\u0000@gsyen.com",
    } as StalwartMirrorJob;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const message = queueMessage(poisoned);

    await consumeStalwartMirror({
      queue: "gsyen-mail-stalwart-mirror-test",
      messages: [message],
      ackAll: vi.fn(),
      retryAll: vi.fn(),
    } as unknown as MessageBatch<StalwartMirrorJob>, {
      ...configuredEnv(vi.fn()),
      STALWART_MIRROR_ENABLED: "false",
    });

    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    const event = await testEnv.DB.prepare(
      `SELECT reason FROM stalwart_mirror_terminal_events
        WHERE queue_message_id = ?`,
    ).bind(message.id).first<{ reason: string }>();
    expect(event?.reason).toBe("queue_job_invalid");
  });

  for (const scenario of [
    { phase: "delivery", mode: "disabled" },
    { phase: "delivery", mode: "unconfigured" },
    { phase: "dead_letter", mode: "disabled" },
    { phase: "dead_letter", mode: "unconfigured" },
  ] as const) {
    it(`defers ${scenario.phase} work while mirror is ${scenario.mode} and recovers it`, async () => {
      await insertOutbox({
        status: "enqueued",
        attempts: STALWART_MIRROR_OUTBOX_MAX_ATTEMPTS,
      });
      await testEnv.DB.prepare(
        `UPDATE stalwart_mirror_outbox SET delivery_cycles = 1
          WHERE idempotency_key = ?`,
      ).bind(job.messageId).run();
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const inactiveSend = vi.fn();
      const inactiveEnv = {
        ...configuredEnv(inactiveSend),
        STALWART_MIRROR_ENABLED: scenario.mode === "disabled" ? "false" : "true",
        STALWART_MIRROR_TOKEN: scenario.mode === "unconfigured"
          ? undefined
          : "test-token",
      } as unknown as MailEnv;
      const message = queueMessage(job, {
        id: `inactive-${scenario.phase}-${scenario.mode}`,
        attempts: 10,
      });
      const batch = {
        queue: `gsyen-mail-stalwart-mirror-${scenario.phase}-test`,
        messages: [message],
        ackAll: vi.fn(),
        retryAll: vi.fn(),
      } as unknown as MessageBatch<StalwartMirrorJob>;

      if (scenario.phase === "delivery") {
        await consumeStalwartMirror(batch, inactiveEnv);
      } else {
        await consumeStalwartMirrorDeadLetters(batch, inactiveEnv);
      }

      expect(fetchMock).not.toHaveBeenCalled();
      expect(inactiveSend).not.toHaveBeenCalled();
      expect(message.ack).toHaveBeenCalledOnce();
      expect(message.retry).not.toHaveBeenCalled();
      const deferred = await testEnv.DB.prepare(
        `SELECT status, attempts, delivery_cycles, lease_token, enqueued_at
           FROM stalwart_mirror_outbox WHERE idempotency_key = ?`,
      ).bind(job.messageId).first<{
        status: string;
        attempts: number;
        delivery_cycles: number;
        lease_token: string | null;
        enqueued_at: string | null;
      }>();
      expect(deferred).toEqual({
        status: "pending",
        attempts: 0,
        delivery_cycles: 1,
        lease_token: null,
        enqueued_at: null,
      });
      if (scenario.phase === "dead_letter") {
        const audit = await testEnv.DB.prepare(
          "SELECT status FROM stalwart_mirror_dead_letters WHERE id = ?",
        ).bind(message.id).first<{ status: string }>();
        expect(audit?.status).toBe("requeued");
      }

      const recoveredSend = vi.fn(async () => {});
      const recovered = await drainStalwartMirrorOutbox(
        configuredEnv(recoveredSend),
        { now: new Date(Date.now() + 1_000) },
      );
      expect(recovered.enqueued).toBe(1);
      expect(recoveredSend).toHaveBeenCalledWith(job);
      const reenabled = await testEnv.DB.prepare(
        `SELECT status, delivery_cycles FROM stalwart_mirror_outbox
          WHERE idempotency_key = ?`,
      ).bind(job.messageId).first<{
        status: string;
        delivery_cycles: number;
      }>();
      expect(reenabled).toEqual({ status: "enqueued", delivery_cycles: 1 });
    });
  }

  it("terminalizes a Queue job whose hash/recipient metadata conflicts with D1", async () => {
    await insertOutbox({ status: "enqueued" });
    const conflicting = {
      ...job,
      recipient: "other@gsyen.com",
    };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const message = queueMessage(conflicting);

    await consumeStalwartMirror({
      queue: "gsyen-mail-stalwart-mirror-test",
      messages: [message],
      ackAll: vi.fn(),
      retryAll: vi.fn(),
    } as unknown as MessageBatch<StalwartMirrorJob>, configuredEnv(vi.fn()));

    expect(message.ack).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
    const outbox = await testEnv.DB.prepare(
      `SELECT status, last_error FROM stalwart_mirror_outbox
        WHERE idempotency_key = ?`,
    ).bind(job.messageId).first<{ status: string; last_error: string }>();
    expect(outbox).toEqual({
      status: "terminal",
      last_error: "outbox_metadata_conflict",
    });
  });

  it("persists exhausted mirror jobs and requeues them", async () => {
    await insertOutbox({ status: "enqueued" });
    const deadLetter = queueMessage(job);
    await consumeStalwartMirrorDeadLetters({
      queue: "gsyen-mail-stalwart-mirror-dlq-test",
      messages: [deadLetter],
      ackAll: vi.fn(),
      retryAll: vi.fn(),
    } as unknown as MessageBatch<StalwartMirrorJob>, configuredEnv(vi.fn()));
    expect(deadLetter.ack).toHaveBeenCalledOnce();
    const deadLetterState = await testEnv.DB.prepare(
      "SELECT status FROM stalwart_mirror_outbox WHERE idempotency_key = ?",
    ).bind(job.messageId).first<{ status: string }>();
    expect(deadLetterState?.status).toBe("dead_letter");

    const send = vi.fn(async () => {});
    const requeued = await requeueStalwartMirrorDeadLetters({
      ...testEnv,
      STALWART_MIRROR_ENABLED: "true",
      STALWART_MIRROR_URL: "https://mail-ingest.example/internal/mail/mirror",
      STALWART_MIRROR_TOKEN: "test-token",
      STALWART_MIRROR_QUEUE: { send },
    } as unknown as MailEnv);
    expect(requeued).toBe(1);
    expect(send).toHaveBeenCalledWith(job, { delaySeconds: 5 });
    const stored = await testEnv.DB.prepare(
      "SELECT status FROM stalwart_mirror_dead_letters WHERE id = ?",
    ).bind(deadLetter.id).first<{ status: string }>();
    expect(stored?.status).toBe("requeued");
    const outbox = await testEnv.DB.prepare(
      "SELECT status FROM stalwart_mirror_outbox WHERE idempotency_key = ?",
    ).bind(job.messageId).first<{ status: string }>();
    expect(outbox?.status).toBe("enqueued");
  });

  it("does not count the same committed DLQ Queue message twice after redelivery", async () => {
    await insertOutbox({ status: "enqueued" });
    const queueMessageId = "dead-letter-commit-before-ack";
    const firstDelivery = queueMessage(job, {
      id: queueMessageId,
      attempts: 4,
    });
    const batch = (message: ReturnType<typeof queueMessage>) => ({
      queue: "gsyen-mail-stalwart-mirror-dlq-test",
      messages: [message],
      ackAll: vi.fn(),
      retryAll: vi.fn(),
    } as unknown as MessageBatch<StalwartMirrorJob>);
    const mirrorEnv = configuredEnv(vi.fn());

    // The first invocation commits its D1 batch. Replaying the same Queue ID
    // models a Worker crash before Cloudflare observed the first ack.
    await consumeStalwartMirrorDeadLetters(batch(firstDelivery), mirrorEnv);
    expect(firstDelivery.ack).toHaveBeenCalledOnce();

    const redelivery = queueMessage(job, {
      id: queueMessageId,
      attempts: 5,
    });
    await consumeStalwartMirrorDeadLetters(batch(redelivery), mirrorEnv);

    expect(redelivery.ack).toHaveBeenCalledOnce();
    expect(redelivery.retry).not.toHaveBeenCalled();
    const outbox = await testEnv.DB.prepare(
      `SELECT status, delivery_cycles, last_error
         FROM stalwart_mirror_outbox WHERE idempotency_key = ?`,
    ).bind(job.messageId).first<{
      status: string;
      delivery_cycles: number;
      last_error: string;
    }>();
    expect(outbox).toEqual({
      status: "dead_letter",
      delivery_cycles: 1,
      last_error: "queue_delivery_exhausted",
    });
    const receipt = await testEnv.DB.prepare(
      `SELECT status, attempts FROM stalwart_mirror_dead_letters WHERE id = ?`,
    ).bind(queueMessageId).first<{ status: string; attempts: number }>();
    expect(receipt).toEqual({ status: "pending", attempts: 5 });

    const send = vi.fn(async () => {});
    expect(await requeueStalwartMirrorDeadLetters(configuredEnv(send))).toBe(1);
    const lateRedelivery = queueMessage(job, {
      id: queueMessageId,
      attempts: 6,
    });
    await consumeStalwartMirrorDeadLetters(batch(lateRedelivery), mirrorEnv);

    expect(lateRedelivery.ack).toHaveBeenCalledOnce();
    expect(lateRedelivery.retry).not.toHaveBeenCalled();
    const advanced = await testEnv.DB.prepare(
      `SELECT status, delivery_cycles, last_error
         FROM stalwart_mirror_outbox WHERE idempotency_key = ?`,
    ).bind(job.messageId).first<{
      status: string;
      delivery_cycles: number;
      last_error: string | null;
    }>();
    expect(advanced).toEqual({
      status: "enqueued",
      delivery_cycles: 1,
      last_error: null,
    });
  });

  it("caps Queue-to-DLQ replay cycles and never requeues a terminal outbox", async () => {
    await insertOutbox({ status: "enqueued" });
    const send = vi.fn(async () => {});
    const mirrorEnv = configuredEnv(send);

    for (let cycle = 1; cycle <= 3; cycle += 1) {
      const deadLetter = queueMessage(job, { id: `dead-letter-cycle-${cycle}` });
      await consumeStalwartMirrorDeadLetters({
        queue: "gsyen-mail-stalwart-mirror-dlq-test",
        messages: [deadLetter],
        ackAll: vi.fn(),
        retryAll: vi.fn(),
      } as unknown as MessageBatch<StalwartMirrorJob>, mirrorEnv);
      expect(deadLetter.ack).toHaveBeenCalledOnce();

      const stored = await testEnv.DB.prepare(
        `SELECT status, delivery_cycles FROM stalwart_mirror_outbox
          WHERE idempotency_key = ?`,
      ).bind(job.messageId).first<{
        status: string;
        delivery_cycles: number;
      }>();
      expect(stored?.delivery_cycles).toBe(cycle);
      if (cycle < 3) {
        expect(stored?.status).toBe("dead_letter");
        expect(await requeueStalwartMirrorDeadLetters(mirrorEnv)).toBe(1);
      } else {
        expect(stored?.status).toBe("terminal");
      }
    }

    expect(await requeueStalwartMirrorDeadLetters(mirrorEnv)).toBe(0);
    expect(send).toHaveBeenCalledTimes(2);
    const event = await testEnv.DB.prepare(
      `SELECT reason FROM stalwart_mirror_terminal_events
        WHERE phase = 'dead_letter' ORDER BY observed_at DESC LIMIT 1`,
    ).first<{ reason: string }>();
    expect(event?.reason).toBe("delivery_cycles_exhausted");
  });

  it("recovers a crashed final DLQ requeue claim as terminal", async () => {
    await insertOutbox({ status: "enqueued" });
    const deadLetter = queueMessage(job, { id: "dead-letter-crashed-final-claim" });
    await consumeStalwartMirrorDeadLetters({
      queue: "gsyen-mail-stalwart-mirror-dlq-test",
      messages: [deadLetter],
      ackAll: vi.fn(),
      retryAll: vi.fn(),
    } as unknown as MessageBatch<StalwartMirrorJob>, configuredEnv(vi.fn()));
    await testEnv.DB.prepare(
      `UPDATE stalwart_mirror_dead_letters
          SET status = 'requeueing', requeue_attempts = 6,
              last_seen_at = '2020-01-01T00:00:00.000Z'
        WHERE id = ?`,
    ).bind(deadLetter.id).run();
    const send = vi.fn(async () => {});

    expect(await requeueStalwartMirrorDeadLetters(configuredEnv(send))).toBe(0);
    expect(send).not.toHaveBeenCalled();
    const outbox = await testEnv.DB.prepare(
      `SELECT status, last_error FROM stalwart_mirror_outbox
        WHERE idempotency_key = ?`,
    ).bind(job.messageId).first<{ status: string; last_error: string }>();
    expect(outbox).toEqual({
      status: "terminal",
      last_error: "dead_letter_requeue_attempts_exhausted",
    });
    const stored = await testEnv.DB.prepare(
      `SELECT status, requeued_at FROM stalwart_mirror_dead_letters
        WHERE id = ?`,
    ).bind(deadLetter.id).first<{ status: string; requeued_at: string | null }>();
    expect(stored?.status).toBe("requeued");
    expect(stored?.requeued_at).not.toBeNull();
  });

  it("does not let a late DLQ message regress a delivered outbox", async () => {
    await insertOutbox({ status: "delivered" });
    const deadLetter = queueMessage(job);

    await consumeStalwartMirrorDeadLetters({
      queue: "gsyen-mail-stalwart-mirror-dlq-test",
      messages: [deadLetter],
      ackAll: vi.fn(),
      retryAll: vi.fn(),
    } as unknown as MessageBatch<StalwartMirrorJob>, configuredEnv(vi.fn()));

    expect(deadLetter.ack).toHaveBeenCalledOnce();
    const outbox = await testEnv.DB.prepare(
      "SELECT status FROM stalwart_mirror_outbox WHERE idempotency_key = ?",
    ).bind(job.messageId).first<{ status: string }>();
    expect(outbox?.status).toBe("delivered");

    const resolvedBeforeReplay = await testEnv.DB.prepare(
      "SELECT status, requeued_at FROM stalwart_mirror_dead_letters WHERE id = ?",
    ).bind(deadLetter.id).first<{
      status: string;
      requeued_at: string | null;
    }>();
    expect(resolvedBeforeReplay?.status).toBe("requeued");
    expect(resolvedBeforeReplay?.requeued_at).not.toBeNull();

    const send = vi.fn(async () => {});
    expect(await requeueStalwartMirrorDeadLetters(configuredEnv(send))).toBe(0);
    expect(send).not.toHaveBeenCalled();
    const stored = await testEnv.DB.prepare(
      "SELECT status, requeued_at FROM stalwart_mirror_dead_letters WHERE id = ?",
    ).bind(deadLetter.id).first<{
      status: string;
      requeued_at: string | null;
    }>();
    expect(stored?.status).toBe("requeued");
    expect(stored?.requeued_at).not.toBeNull();
  });

  it("leases and enqueues a pending durable outbox record", async () => {
    const now = new Date("2026-08-26T00:00:00.000Z");
    await insertOutbox();
    const send = vi.fn(async () => {});

    const result = await drainStalwartMirrorOutbox(configuredEnv(send), { now });

    expect(result).toEqual({ inspected: 1, enqueued: 1, failed: 0, terminal: 0 });
    expect(send).toHaveBeenCalledWith(job);
    const stored = await testEnv.DB.prepare(
      `SELECT status, attempts, lease_token, lease_expires_at, enqueued_at
         FROM stalwart_mirror_outbox WHERE idempotency_key = ?`,
    ).bind(job.messageId).first<{
      status: string;
      attempts: number;
      lease_token: string | null;
      lease_expires_at: string | null;
      enqueued_at: string | null;
    }>();
    expect(stored).toMatchObject({
      status: "enqueued",
      attempts: 1,
      lease_token: null,
      lease_expires_at: null,
      enqueued_at: now.toISOString(),
    });
  });

  it("releases a failed Queue send with exponential retry metadata", async () => {
    const now = new Date("2026-08-26T00:00:00.000Z");
    await insertOutbox();
    const send = vi.fn(async () => {
      throw new Error("queue unavailable");
    });

    await expect(drainStalwartMirrorOutbox(configuredEnv(send), { now }))
      .resolves.toEqual({ inspected: 1, enqueued: 0, failed: 1, terminal: 0 });
    const stored = await testEnv.DB.prepare(
      `SELECT status, attempts, next_attempt_at, lease_token,
              lease_expires_at, last_error
         FROM stalwart_mirror_outbox WHERE idempotency_key = ?`,
    ).bind(job.messageId).first<{
      status: string;
      attempts: number;
      next_attempt_at: string;
      lease_token: string | null;
      lease_expires_at: string | null;
      last_error: string | null;
    }>();
    expect(stored).toEqual({
      status: "pending",
      attempts: 1,
      next_attempt_at: "2026-08-26T00:01:00.000Z",
      lease_token: null,
      lease_expires_at: null,
      last_error: "queue unavailable",
    });
  });

  it("reclaims an expired lease using the same idempotency key", async () => {
    const now = new Date("2026-08-26T00:10:00.000Z");
    await insertOutbox({
      status: "leased",
      attempts: 2,
      leaseToken: "expired-lease",
      leaseExpiresAt: "2026-08-26T00:09:59.000Z",
    });
    const send = vi.fn(async () => {});

    const result = await drainStalwartMirrorOutbox(configuredEnv(send), { now });

    expect(result.enqueued).toBe(1);
    expect(send).toHaveBeenCalledWith(job);
    const stored = await testEnv.DB.prepare(
      "SELECT status, attempts FROM stalwart_mirror_outbox WHERE idempotency_key = ?",
    ).bind(job.messageId).first<{ status: string; attempts: number }>();
    expect(stored).toEqual({ status: "enqueued", attempts: 3 });
  });

  it("recovers and reports a stale enqueued row without changing its idempotency key", async () => {
    const now = new Date("2026-08-27T00:00:01.000Z");
    await insertOutbox({
      status: "enqueued",
      attempts: 1,
      enqueuedAt: "2020-01-01T00:00:00.000Z",
    });
    const send = vi.fn(async () => {});

    const degraded = await getOperationsSnapshot(testEnv);
    expect(degraded.pendingStalwartMirror).toBe(1);
    expect(degraded.healthy).toBe(false);

    const result = await drainStalwartMirrorOutbox(configuredEnv(send), { now });

    expect(result).toEqual({ inspected: 1, enqueued: 1, failed: 0, terminal: 0 });
    expect(send).toHaveBeenCalledWith(job);
    const stored = await testEnv.DB.prepare(
      `SELECT status, attempts, enqueued_at, last_error
         FROM stalwart_mirror_outbox WHERE idempotency_key = ?`,
    ).bind(job.messageId).first<{
      status: string;
      attempts: number;
      enqueued_at: string | null;
      last_error: string | null;
    }>();
    expect(stored).toEqual({
      status: "enqueued",
      attempts: 2,
      enqueued_at: now.toISOString(),
      last_error: null,
    });
  });

  it("does not replay a recently enqueued mirror job", async () => {
    const now = new Date("2026-08-26T00:30:00.000Z");
    await insertOutbox({
      status: "enqueued",
      attempts: 1,
      enqueuedAt: "2026-08-26T00:00:00.000Z",
    });
    const send = vi.fn(async () => {});

    expect(await drainStalwartMirrorOutbox(configuredEnv(send), { now }))
      .toEqual({ inspected: 0, enqueued: 0, failed: 0, terminal: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it("marks a repeatedly failing outbox record terminal", async () => {
    const now = new Date("2026-08-26T00:00:00.000Z");
    await insertOutbox({ attempts: STALWART_MIRROR_OUTBOX_MAX_ATTEMPTS - 1 });
    const send = vi.fn(async () => {
      throw new Error("queue remains unavailable");
    });
    const mirrorEnv = configuredEnv(send);

    const result = await drainStalwartMirrorOutbox(mirrorEnv, { now });

    expect(result).toEqual({ inspected: 1, enqueued: 0, failed: 0, terminal: 1 });
    const stored = await testEnv.DB.prepare(
      `SELECT status, attempts, terminal_at, last_error
         FROM stalwart_mirror_outbox WHERE idempotency_key = ?`,
    ).bind(job.messageId).first<{
      status: string;
      attempts: number;
      terminal_at: string | null;
      last_error: string | null;
    }>();
    expect(stored).toEqual({
      status: "terminal",
      attempts: STALWART_MIRROR_OUTBOX_MAX_ATTEMPTS,
      terminal_at: now.toISOString(),
      last_error: "queue remains unavailable",
    });

    await drainStalwartMirrorOutbox(mirrorEnv, {
      now: new Date("2026-08-27T00:00:00.000Z"),
    });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
