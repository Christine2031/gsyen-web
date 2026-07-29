import {
  applyD1Migrations,
  env,
  type D1Migration,
} from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { consumeOutbound } from "../src/outbound";
import {
  claimOutboundRecord,
  createMailbox,
  getOutboundStatus,
} from "../src/repository";
import type { MailEnv, OutboundJob } from "../src/types";

type TestEnv = MailEnv & {
  TEST_MIGRATIONS: D1Migration[];
};

const testEnv = env as TestEnv;
vi.mock("../src/providers/resend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/providers/resend")>();
  return {
    ...actual,
    sendWithResend: vi.fn(async () => ({ messageId: "provider-message" })),
  };
});

beforeEach(async () => {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
});

describe("outbound delivery claim", () => {
  it("allows only one active claim for a queued message", async () => {
    const mailbox = await createMailbox(testEnv, {
      ownerId: "claim-owner",
      localPart: "claim-owner",
      displayName: "Claim",
    });
    await testEnv.DB.prepare(
      "UPDATE mailboxes SET status = 'active' WHERE id = ?",
    ).bind(mailbox.id).run();
    await testEnv.DB.prepare(
      `INSERT INTO messages
        (id, mailbox_id, direction, folder, from_address, to_json, cc_json,
         subject, text_body, references_json, status, created_at)
       VALUES (?, ?, 'outbound', 'outbox', ?, ?, '[]', ?, ?, '[]', 'queued', ?)`,
    ).bind(
      "claim-message",
      mailbox.id,
      mailbox.address,
      JSON.stringify(["recipient@example.com"]),
      "Claim test",
      "Body",
      new Date().toISOString(),
    ).run();

    const first = await claimOutboundRecord(testEnv, "claim-message");
    const second = await claimOutboundRecord(testEnv, "claim-message");

    expect(first?.id).toBe("claim-message");
    expect(second).toBeNull();
    expect(await getOutboundStatus(testEnv, "claim-message")).toBe("sending");
  });

  it("isolates a malformed message and continues the same queue batch", async () => {
    const mailbox = await createMailbox(testEnv, {
      ownerId: "batch-owner",
      localPart: "batch-owner",
      displayName: "Batch",
    });
    await testEnv.DB.prepare(
      "UPDATE mailboxes SET status = 'active' WHERE id = ?",
    ).bind(mailbox.id).run();
    const createdAt = new Date().toISOString();
    const insert = (id: string, recipients: string) => testEnv.DB.prepare(
      `INSERT INTO messages
        (id, mailbox_id, direction, folder, from_address, to_json, cc_json,
         subject, text_body, references_json, status, created_at)
       VALUES (?, ?, 'outbound', 'outbox', ?, ?, '[]', ?, ?, '[]', 'queued', ?)`,
    ).bind(id, mailbox.id, mailbox.address, recipients, "Batch test", "Body", createdAt);
    await testEnv.DB.batch([
      insert("bad-message", "not-json"),
      insert("good-message", JSON.stringify(["recipient@example.com"])),
    ]);
    const bad = { body: { messageId: "bad-message" }, ack: vi.fn(), retry: vi.fn() };
    const good = { body: { messageId: "good-message" }, ack: vi.fn(), retry: vi.fn() };

    await consumeOutbound(
      { messages: [bad, good] } as unknown as MessageBatch<OutboundJob>,
      testEnv,
    );

    expect(bad.ack).toHaveBeenCalledOnce();
    expect(bad.retry).not.toHaveBeenCalled();
    expect(good.ack).toHaveBeenCalledOnce();
    expect(good.retry).not.toHaveBeenCalled();
    expect(await getOutboundStatus(testEnv, "bad-message")).toBe("failed");
    expect(await getOutboundStatus(testEnv, "good-message")).toBe("sent");
  });
});
