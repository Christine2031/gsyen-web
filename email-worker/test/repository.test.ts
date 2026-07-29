import {
  applyD1Migrations,
  env,
  type D1Migration,
} from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createMailbox,
  queueOutboundMessage,
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
    const usage = await testEnv.DB.prepare(
      "SELECT sent_count FROM send_usage WHERE owner_id = ?",
    ).bind("user-2").first<{ sent_count: number }>();
    expect(first.created).toBe(true);
    expect(second).toEqual({ messageId: first.messageId, created: false });
    expect(usage?.sent_count).toBe(1);
  });
});
