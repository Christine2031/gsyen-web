import {
  applyD1Migrations,
  env,
  type D1Migration,
} from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  consumeDeadLetters,
  replayDeadLetter,
} from "../src/deadLetters";
import {
  getOperationsSnapshot,
  refreshOperationalIncidents,
} from "../src/operations";
import { createMailbox } from "../src/repository";
import type { MailEnv, OutboundJob } from "../src/types";

type TestEnv = MailEnv & { TEST_MIGRATIONS: D1Migration[] };
const testEnv = env as TestEnv;

beforeEach(async () => {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  await testEnv.DB.batch([
    testEnv.DB.prepare("DELETE FROM dead_letter_events"),
    testEnv.DB.prepare("DELETE FROM mail_operational_incidents"),
    testEnv.DB.prepare("DELETE FROM messages"),
    testEnv.DB.prepare("DELETE FROM send_usage"),
    testEnv.DB.prepare("DELETE FROM mailbox_addresses"),
    testEnv.DB.prepare("DELETE FROM mailboxes"),
  ]);
  vi.clearAllMocks();
});

type QueueTestMessage = {
  id: string;
  timestamp: Date;
  body: unknown;
  attempts: number;
  ack: ReturnType<typeof vi.fn>;
  retry: ReturnType<typeof vi.fn>;
};

function queueMessage(
  id: string,
  body: unknown,
  attempts = 4,
): QueueTestMessage {
  return {
    id,
    timestamp: new Date(),
    body,
    attempts,
    ack: vi.fn(),
    retry: vi.fn(),
  };
}

function deadLetterBatch(
  ...messages: QueueTestMessage[]
): MessageBatch<unknown> {
  return {
    queue: "gsyen-mail-outbound-dlq-production",
    messages,
    ackAll: vi.fn(),
    retryAll: vi.fn(),
  } as unknown as MessageBatch<unknown>;
}

async function insertOutbound(
  id: string,
  status: "queued" | "sent" | "failed",
): Promise<void> {
  const mailbox = await createMailbox(testEnv, {
    ownerId: `owner-${id}`,
    localPart: `owner-${id}`,
    displayName: "DLQ",
  });
  await testEnv.DB.prepare(
    `INSERT INTO messages
      (id, mailbox_id, direction, folder, from_address, to_json, cc_json,
       subject, text_body, references_json, status, created_at)
     VALUES (?, ?, 'outbound', ?, ?, '[]', '[]', 'DLQ', 'Body', '[]', ?, ?)`,
  ).bind(
    id,
    mailbox.id,
    status === "sent" ? "sent" : "outbox",
    mailbox.address,
    status,
    new Date().toISOString(),
  ).run();
}

describe("dead-letter recovery", () => {
  it("durably records and acknowledges a dead-lettered send without message content", async () => {
    const message = queueMessage("queue-event-1", {
      kind: "send",
      messageId: "outbound-message-1",
    });
    await consumeDeadLetters(deadLetterBatch(message), testEnv);

    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
    await expect(testEnv.DB.prepare(
      `SELECT source_queue, job_kind, message_id, attempts, status, payload_json
         FROM dead_letter_events WHERE id = ?`,
    ).bind(message.id).first()).resolves.toEqual({
      source_queue: "gsyen-mail-outbound-dlq-production",
      job_kind: "send",
      message_id: "outbound-message-1",
      attempts: 4,
      status: "pending",
      payload_json: JSON.stringify({
        kind: "send",
        messageId: "outbound-message-1",
      }),
    });
  });

  it("deduplicates a redelivered queue event and keeps the highest attempt count", async () => {
    const first = queueMessage("queue-event-2", { messageId: "message-2" }, 3);
    const second = queueMessage("queue-event-2", { messageId: "message-2" }, 7);
    await consumeDeadLetters(deadLetterBatch(first), testEnv);
    await consumeDeadLetters(deadLetterBatch(second), testEnv);

    const row = await testEnv.DB.prepare(
      "SELECT attempts, COUNT(*) AS count FROM dead_letter_events WHERE id = ?",
    ).bind("queue-event-2").first<{ attempts: number; count: number }>();
    expect(row).toEqual({ attempts: 7, count: 1 });
  });

  it("retries the DLQ event when durable persistence is unavailable", async () => {
    const message = queueMessage("queue-event-3", { messageId: "message-3" });
    const unavailable = new Proxy(testEnv, {
      get(target, property) {
        if (property === "DB") {
          return { prepare: () => { throw new Error("D1 unavailable"); } };
        }
        return Reflect.get(target, property);
      },
    }) as MailEnv;

    await consumeDeadLetters(deadLetterBatch(message), unavailable);
    expect(message.ack).not.toHaveBeenCalled();
    expect(message.retry).toHaveBeenCalledWith({ delaySeconds: 300 });
  });

  it("opens and resolves durable operational incidents from current metrics", async () => {
    const message = queueMessage("queue-event-4", { messageId: "message-4" });
    await consumeDeadLetters(deadLetterBatch(message), testEnv);
    await refreshOperationalIncidents(testEnv);

    const degraded = await getOperationsSnapshot(testEnv);
    expect(degraded.healthy).toBe(false);
    expect(degraded.pendingDeadLetters).toBe(1);
    expect(degraded.incidents).toContainEqual(expect.objectContaining({
      kind: "pending_dead_letters",
      severity: "critical",
      status: "open",
      count: 1,
    }));

    await testEnv.DB.prepare(
      `UPDATE dead_letter_events SET status = 'resolved',
        resolved_at = ? WHERE id = ?`,
    ).bind(new Date().toISOString(), message.id).run();
    await refreshOperationalIncidents(testEnv);
    const recovered = await getOperationsSnapshot(testEnv);
    expect(recovered.healthy).toBe(true);
    expect(recovered.incidents).toContainEqual(expect.objectContaining({
      kind: "pending_dead_letters",
      status: "resolved",
      count: 0,
    }));
  });

  it("requeues a failed send once and closes its dead-letter event", async () => {
    await insertOutbound("failed-message", "failed");
    const message = queueMessage("queue-event-5", {
      kind: "send",
      messageId: "failed-message",
    });
    await consumeDeadLetters(deadLetterBatch(message), testEnv);
    const send = vi.fn<(job: OutboundJob, options?: { delaySeconds?: number }) => Promise<void>>(
      async () => undefined,
    );
    const replayEnv = Object.assign(Object.create(testEnv), {
      OUTBOUND_QUEUE: { send },
    }) as MailEnv;

    await expect(replayDeadLetter(replayEnv, message.id)).resolves.toEqual({
      replayed: true,
      messageId: "failed-message",
    });
    expect(send).toHaveBeenCalledWith(
      { kind: "send", messageId: "failed-message" },
      { delaySeconds: 5 },
    );
    await expect(testEnv.DB.prepare(
      "SELECT status, queue_dispatched_at FROM messages WHERE id = ?",
    ).bind("failed-message").first()).resolves.toEqual({
      status: "queued",
      queue_dispatched_at: expect.any(String),
    });
    await expect(testEnv.DB.prepare(
      "SELECT status, replay_count FROM dead_letter_events WHERE id = ?",
    ).bind(message.id).first()).resolves.toEqual({
      status: "replayed",
      replay_count: 1,
    });
  });

  it("resolves an already-sent message without sending it again", async () => {
    await insertOutbound("sent-message", "sent");
    const message = queueMessage("queue-event-6", {
      kind: "send",
      messageId: "sent-message",
    });
    await consumeDeadLetters(deadLetterBatch(message), testEnv);
    const send = vi.fn(async () => undefined);
    const replayEnv = Object.assign(Object.create(testEnv), {
      OUTBOUND_QUEUE: { send },
    }) as MailEnv;

    await expect(replayDeadLetter(replayEnv, message.id)).resolves.toEqual({
      replayed: false,
      resolution: "already_sent",
      messageId: "sent-message",
    });
    expect(send).not.toHaveBeenCalled();
    await expect(testEnv.DB.prepare(
      "SELECT status, resolution_code FROM dead_letter_events WHERE id = ?",
    ).bind(message.id).first()).resolves.toEqual({
      status: "resolved",
      resolution_code: "already_sent",
    });
  });

  it("keeps an invalid dead letter pending for operator inspection", async () => {
    const message = queueMessage("queue-event-7", { kind: "unknown" });
    await consumeDeadLetters(deadLetterBatch(message), testEnv);

    await expect(replayDeadLetter(testEnv, message.id)).rejects.toMatchObject({
      status: 409,
      code: "dead_letter_invalid",
    });
    await expect(testEnv.DB.prepare(
      "SELECT status, job_kind FROM dead_letter_events WHERE id = ?",
    ).bind(message.id).first()).resolves.toEqual({
      status: "pending",
      job_kind: "invalid",
    });
  });

  it("reopens the dead letter when the recovery queue is unavailable", async () => {
    await insertOutbound("queue-failure-message", "failed");
    const message = queueMessage("queue-event-8", {
      kind: "send",
      messageId: "queue-failure-message",
    });
    await consumeDeadLetters(deadLetterBatch(message), testEnv);
    const replayEnv = Object.assign(Object.create(testEnv), {
      OUTBOUND_QUEUE: {
        send: vi.fn(async () => { throw new Error("Queue unavailable"); }),
      },
    }) as MailEnv;

    await expect(replayDeadLetter(replayEnv, message.id))
      .rejects.toThrow("Queue unavailable");
    await expect(testEnv.DB.prepare(
      "SELECT status FROM dead_letter_events WHERE id = ?",
    ).bind(message.id).first()).resolves.toEqual({ status: "pending" });
    await expect(testEnv.DB.prepare(
      `SELECT status, queue_dispatched_at, error_code
         FROM messages WHERE id = ?`,
    ).bind("queue-failure-message").first()).resolves.toEqual({
      status: "failed",
      queue_dispatched_at: null,
      error_code: "dead_letter_replay_enqueue_failed",
    });
  });
});
