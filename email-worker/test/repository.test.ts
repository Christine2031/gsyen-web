import {
  applyD1Migrations,
  env,
  type D1Migration,
} from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelOutboundMessage,
  createMailbox,
  queueOutboundMessage,
  requeueStaleOutboundMessages,
} from "../src/repository";
import type { MailEnv } from "../src/types";

type TestEnv = MailEnv & {
  TEST_MIGRATIONS: D1Migration[];
};

const testEnv = env as TestEnv;

beforeEach(async () => {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
});

describe("mailbox repository", () => {
  it("creates one pending mailbox per owner", async () => {
    const first = await createMailbox(testEnv, {
      ownerId: "user-1",
      localPart: "ethan",
      displayName: "Ethan",
    });
    const second = await createMailbox(testEnv, {
      ownerId: "user-1",
      localPart: "different",
      displayName: "Different",
    });
    expect(first.status).toBe("pending");
    expect(first.address).toBe("ethan@gsyen.com");
    expect(second.id).toBe(first.id);
  });

  it("keeps gmail-style usernames unique across dot variants", async () => {
    await createMailbox(testEnv, {
      ownerId: "owner-dotted",
      localPart: "ethan.smith",
      displayName: "Owner Dotted",
    });

    await expect(createMailbox(testEnv, {
      ownerId: "owner-nodot",
      localPart: "ethansmith",
      displayName: "Owner No Dot",
    })).rejects.toMatchObject({
      status: 409,
      code: "mailbox_unavailable",
    });
  });

  it("deduplicates client retries before consuming quota twice", async () => {
    await testEnv.DB.prepare(
      `INSERT INTO mailboxes
        (id, owner_id, local_part, address, display_name, status, created_at, approved_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
    ).bind(
      "mailbox-1",
      "user-2",
      "sender",
      "sender@gsyen.com",
      "Sender",
      new Date().toISOString(),
      new Date().toISOString(),
    ).run();
    const mailbox = {
      id: "mailbox-1",
      owner_id: "user-2",
      local_part: "sender",
      address: "sender@gsyen.com",
      display_name: "Sender",
      status: "active" as const,
      created_at: new Date().toISOString(),
      approved_at: new Date().toISOString(),
    };
    const request = {
      to: ["recipient@example.com"],
      cc: [],
      subject: "Hello",
      text: "Message",
    };
    const first = await queueOutboundMessage(
      testEnv,
      mailbox,
      request,
      "client:20260729:00000001",
    );
    const second = await queueOutboundMessage(
      testEnv,
      mailbox,
      request,
      "client:20260729:00000001",
    );
    expect(first.created).toBe(true);
    expect(second).toEqual({
      messageId: first.messageId,
      created: false,
      status: "queued",
    });
    await testEnv.DB.prepare(
      "UPDATE messages SET status = 'sent' WHERE id = ?",
    ).bind(first.messageId).run();
    const completedRetry = await queueOutboundMessage(
      testEnv,
      mailbox,
      request,
      "client:20260729:00000001",
    );
    expect(completedRetry.status).toBe("sent");
    const usage = await testEnv.DB.prepare(
      "SELECT sent_count FROM send_usage WHERE owner_id = ?",
    ).bind("user-2").first<{ sent_count: number }>();
    expect(usage?.sent_count).toBe(1);
  });

  it("rejects an invalid daily send limit as a server configuration error", async () => {
    const mailbox = await createMailbox(testEnv, {
      ownerId: "invalidlimit-owner",
      localPart: "invalidlimit",
      displayName: "Invalid Limit",
    });
    await testEnv.DB.prepare(
      "UPDATE mailboxes SET status = 'active' WHERE id = ?",
    ).bind(mailbox.id).run();
    const invalidEnv = Object.assign(Object.create(testEnv), {
      DAILY_SEND_LIMIT: "not-a-number",
    }) as MailEnv;

    await expect(queueOutboundMessage(
      invalidEnv,
      { ...mailbox, status: "active" },
      { to: ["recipient@example.com"], cc: [], subject: "Hello", text: "Body" },
      "client:20260729:invalidlimit",
    )).rejects.toMatchObject({
      status: 500,
      code: "config_invalid",
    });
  });

  it("delays delivery briefly and refunds quota when a queued send is cancelled", async () => {
    const mailbox = await createMailbox(testEnv, {
      ownerId: "cancelowner",
      localPart: "cancelowner",
      displayName: "Cancel",
    });
    await testEnv.DB.prepare(
      "UPDATE mailboxes SET status = 'active' WHERE id = ?",
    ).bind(mailbox.id).run();
    const send = vi.fn(async () => undefined);
    const queueEnv = Object.assign(Object.create(testEnv), {
      DAILY_SEND_LIMIT: "30",
      OUTBOUND_QUEUE: { send },
    }) as MailEnv;
    const queued = await queueOutboundMessage(
      queueEnv,
      { ...mailbox, status: "active" },
      { to: ["recipient@example.com"], cc: [], subject: "Hello", text: "Body" },
      "client:20260729:cancelowner",
    );
    expect(send).toHaveBeenCalledWith(
      { messageId: queued.messageId },
      { delaySeconds: 20 },
    );

    await cancelOutboundMessage(queueEnv, mailbox.id, mailbox.owner_id, queued.messageId);
    const message = await testEnv.DB.prepare(
      "SELECT id FROM messages WHERE id = ?",
    ).bind(queued.messageId).first();
    const usage = await testEnv.DB.prepare(
      "SELECT sent_count FROM send_usage WHERE owner_id = ?",
    ).bind(mailbox.owner_id).first<{ sent_count: number }>();
    expect(message).toBeNull();
    expect(usage?.sent_count).toBe(0);
  });

  it("persists an explicit message category", async () => {
    const mailbox = await createMailbox(testEnv, {
      ownerId: "categoryowner",
      localPart: "categoryowner",
      displayName: "Category",
    });
    await testEnv.DB.prepare(
      "UPDATE mailboxes SET status = 'active' WHERE id = ?",
    ).bind(mailbox.id).run();
    const send = vi.fn(async () => undefined);
    const queueEnv = Object.assign(Object.create(testEnv), {
      OUTBOUND_QUEUE: { send },
    }) as MailEnv;
    const queued = await queueOutboundMessage(
      queueEnv,
      { ...mailbox, status: "active" },
      {
        to: ["recipient@example.com"],
        cc: [],
        subject: "Category",
        text: "Body",
        category: "promotions",
      },
      "client:20260730:categoryowner",
    );
    const message = await testEnv.DB.prepare(
      "SELECT category FROM messages WHERE id = ?",
    ).bind(queued.messageId).first<{ category: string }>();
    expect(message?.category).toBe("promotions");
  });

  it("keeps a durable queued outbox record when the Queue binding is unavailable", async () => {
    const mailbox = await createMailbox(testEnv, {
      ownerId: "durablequeueowner",
      localPart: "durablequeueowner",
      displayName: "Durable Queue",
    });
    await testEnv.DB.prepare(
      "UPDATE mailboxes SET status = 'active' WHERE id = ?",
    ).bind(mailbox.id).run();
    const failedSend = vi.fn(async () => {
      throw new Error("queue unavailable");
    });
    const failedEnv = Object.assign(Object.create(testEnv), {
      OUTBOUND_QUEUE: { send: failedSend },
    }) as MailEnv;
    const queued = await queueOutboundMessage(
      failedEnv,
      { ...mailbox, status: "active" },
      { to: ["recipient@example.com"], cc: [], subject: "Durable", text: "Body" },
      "client:20260730:durable-queue",
    );
    const persisted = await testEnv.DB.prepare(
      `SELECT status, queue_dispatched_at FROM messages WHERE id = ?`,
    ).bind(queued.messageId).first<{
      status: string;
      queue_dispatched_at: string | null;
    }>();
    const usage = await testEnv.DB.prepare(
      "SELECT sent_count FROM send_usage WHERE owner_id = ?",
    ).bind(mailbox.owner_id).first<{ sent_count: number }>();
    expect(queued).toMatchObject({ created: true, status: "queued" });
    expect(persisted).toEqual({
      status: "queued",
      queue_dispatched_at: null,
    });
    expect(usage?.sent_count).toBe(1);

    await testEnv.DB.prepare(
      "UPDATE messages SET created_at = ? WHERE id = ?",
    ).bind(
      new Date(Date.now() - 5 * 60_000).toISOString(),
      queued.messageId,
    ).run();
    const recoveredSend = vi.fn(async () => undefined);
    const recoveredEnv = Object.assign(Object.create(testEnv), {
      OUTBOUND_QUEUE: { send: recoveredSend },
    }) as MailEnv;
    await expect(requeueStaleOutboundMessages(recoveredEnv)).resolves.toEqual({
      inspected: 1,
      enqueued: 1,
      failed: 0,
    });
    expect(recoveredSend).toHaveBeenCalledWith({ messageId: queued.messageId });
    await expect(requeueStaleOutboundMessages(recoveredEnv)).resolves.toEqual({
      inspected: 0,
      enqueued: 0,
      failed: 0,
    });
  });
});
