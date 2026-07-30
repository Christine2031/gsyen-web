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
import { createMailbox } from "../src/repository";
import type { MailEnv, OutboundJob } from "../src/types";

type TestEnv = MailEnv & { TEST_MIGRATIONS: D1Migration[] };
const testEnv = env as TestEnv;

beforeEach(async () => {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  await testEnv.DB.batch([
    testEnv.DB.prepare("DELETE FROM dead_letter_events"),
    testEnv.DB.prepare("DELETE FROM messages"),
    testEnv.DB.prepare("DELETE FROM mailbox_addresses"),
    testEnv.DB.prepare("DELETE FROM mailboxes"),
  ]);
  vi.clearAllMocks();
});

function queueMessage(id: string, body: unknown): Message<unknown> {
  return {
    id,
    timestamp: new Date(),
    body,
    attempts: 4,
    ack: vi.fn(),
    retry: vi.fn(),
  } as unknown as Message<unknown>;
}

async function capture(id: string, body: unknown): Promise<void> {
  await consumeDeadLetters({
    queue: "gsyen-mail-outbound-dlq-production",
    messages: [queueMessage(id, body)],
    ackAll: vi.fn(),
    retryAll: vi.fn(),
  } as unknown as MessageBatch<unknown>, testEnv);
}

async function insertFailedOutbound(id: string): Promise<void> {
  const mailbox = await createMailbox(testEnv, {
    ownerId: `owner${id}`,
    localPart: `owner${id}`.replace(/[^a-z0-9.]/g, ""),
    displayName: "Replay",
  });
  await testEnv.DB.prepare(
    `INSERT INTO messages
      (id, mailbox_id, direction, folder, from_address, to_json, cc_json,
       subject, text_body, references_json, status, created_at)
     VALUES (?, ?, 'outbound', 'outbox', ?, '[]', '[]', 'Replay',
       'Body', '[]', 'failed', ?)`,
  ).bind(
    id,
    mailbox.id,
    mailbox.address,
    new Date().toISOString(),
  ).run();
}

function replayEnv(
  send: (job: OutboundJob, options?: { delaySeconds?: number }) => Promise<void>,
): MailEnv {
  return Object.assign(Object.create(testEnv), {
    OUTBOUND_QUEUE: { send },
  }) as MailEnv;
}

describe("dead-letter replay concurrency", () => {
  it("does not overwrite a competing transition to sending", async () => {
    const messageId = "competing-message";
    const eventId = "competing-event";
    await insertFailedOutbound(messageId);
    await capture(eventId, { kind: "send", messageId });
    await testEnv.DB.prepare(
      "UPDATE messages SET status = 'sending' WHERE id = ?",
    ).bind(messageId).run();
    const send = vi.fn(async () => undefined);

    await expect(replayDeadLetter(replayEnv(send), eventId)).resolves.toEqual({
      replayed: false,
      resolution: "already_sending",
      messageId,
    });
    expect(send).not.toHaveBeenCalled();
    await expect(testEnv.DB.prepare(
      "SELECT status FROM messages WHERE id = ?",
    ).bind(messageId).first()).resolves.toEqual({ status: "sending" });
  });

  it("allows only one dispatcher to replay the same dead letter", async () => {
    const messageId = "single-dispatch-message";
    const eventId = "single-dispatch-event";
    await insertFailedOutbound(messageId);
    await capture(eventId, { kind: "send", messageId });
    const send = vi.fn(async () => undefined);
    const activeEnv = replayEnv(send);

    const results = await Promise.allSettled([
      replayDeadLetter(activeEnv, eventId),
      replayDeadLetter(activeEnv, eventId),
    ]);

    expect(send).toHaveBeenCalledOnce();
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  it("stores a canonical valid job instead of truncating raw extra data", async () => {
    const eventId = "canonical-event";
    const job = {
      kind: "reconcile",
      messageId: "canonical-message",
      providerMessageId: "provider-id",
      internetMessageId: "<canonical@example.com>",
      sentAt: "2026-07-30T08:00:00.000Z",
      ignored: "x".repeat(8_000),
    };
    await capture(eventId, job);

    const stored = await testEnv.DB.prepare(
      "SELECT payload_json FROM dead_letter_events WHERE id = ?",
    ).bind(eventId).first<{ payload_json: string }>();
    expect(JSON.parse(stored?.payload_json ?? "{}")).toEqual({
      kind: "reconcile",
      messageId: "canonical-message",
      providerMessageId: "provider-id",
      internetMessageId: "<canonical@example.com>",
      sentAt: "2026-07-30T08:00:00.000Z",
    });

    const send = vi.fn(async () => undefined);
    await expect(replayDeadLetter(replayEnv(send), eventId)).resolves.toEqual({
      replayed: true,
      messageId: "canonical-message",
    });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "reconcile" }),
      { delaySeconds: 5 },
    );
  });
});
