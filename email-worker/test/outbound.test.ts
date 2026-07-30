import {
  applyD1Migrations,
  env,
  type D1Migration,
} from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { consumeOutbound } from "../src/outbound";
import {
  abortClaimedTrashedOutbound,
  claimOutboundRecord,
  createMailbox,
  getOutboundStatus,
  settleTrashedQueuedMessages,
} from "../src/repository";
import { sendWithResend } from "../src/providers/resend";
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
    getResendInternetMessageId: vi.fn(
      async () => "<provider-message@resend.example>",
    ),
  };
});

beforeEach(async () => {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  vi.clearAllMocks();
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

  it("settles a trashed queued message without sending or retrying", async () => {
    const mailbox = await createMailbox(testEnv, {
      ownerId: "trashed-queue-owner",
      localPart: "trashed-queue-owner",
      displayName: "Trashed",
    });
    await testEnv.DB.prepare(
      "UPDATE mailboxes SET status = 'active' WHERE id = ?",
    ).bind(mailbox.id).run();
    const now = new Date().toISOString();
    await testEnv.DB.batch([
      testEnv.DB.prepare(
        `INSERT INTO messages
          (id, mailbox_id, direction, folder, from_address, to_json, cc_json,
           subject, text_body, references_json, status, created_at, trashed_at)
         VALUES (?, ?, 'outbound', 'outbox', ?, '[]', '[]', 'Trash',
           'Body', '[]', 'queued', ?, ?)`,
      ).bind("trashed-queued-message", mailbox.id, mailbox.address, now, now),
      testEnv.DB.prepare(
        "INSERT INTO send_usage (owner_id, day_key, sent_count) VALUES (?, ?, 1)",
      ).bind(mailbox.owner_id, now.slice(0, 10)),
    ]);
    const queued = {
      body: { messageId: "trashed-queued-message" },
      ack: vi.fn(),
      retry: vi.fn(),
    };
    await consumeOutbound(
      { messages: [queued] } as unknown as MessageBatch<OutboundJob>,
      testEnv,
    );

    const state = await testEnv.DB.prepare(
      "SELECT status, error_code FROM messages WHERE id = ?",
    ).bind("trashed-queued-message")
      .first<{ status: string; error_code: string }>();
    const usage = await testEnv.DB.prepare(
      "SELECT sent_count FROM send_usage WHERE owner_id = ?",
    ).bind(mailbox.owner_id).first<{ sent_count: number }>();
    expect(state).toEqual({
      status: "failed",
      error_code: "cancelled_trashed",
    });
    expect(usage?.sent_count).toBe(0);
    expect(queued.ack).toHaveBeenCalledOnce();
    expect(queued.retry).not.toHaveBeenCalled();
    expect(sendWithResend).not.toHaveBeenCalled();
  });

  it("can abort a claimed message if it is trashed before provider send", async () => {
    const mailbox = await createMailbox(testEnv, {
      ownerId: "claimed-trash-owner",
      localPart: "claimed-trash-owner",
      displayName: "Claimed Trash",
    });
    await testEnv.DB.prepare(
      "UPDATE mailboxes SET status = 'active' WHERE id = ?",
    ).bind(mailbox.id).run();
    const now = new Date().toISOString();
    await testEnv.DB.batch([
      testEnv.DB.prepare(
        `INSERT INTO messages
          (id, mailbox_id, direction, folder, from_address, to_json, cc_json,
           subject, text_body, references_json, status, created_at)
         VALUES (?, ?, 'outbound', 'outbox', ?, '[]', '[]', 'Race',
           'Body', '[]', 'queued', ?)`,
      ).bind("claimed-trash-message", mailbox.id, mailbox.address, now),
      testEnv.DB.prepare(
        "INSERT INTO send_usage (owner_id, day_key, sent_count) VALUES (?, ?, 1)",
      ).bind(mailbox.owner_id, now.slice(0, 10)),
    ]);
    expect(await claimOutboundRecord(testEnv, "claimed-trash-message"))
      .not.toBeNull();
    await testEnv.DB.prepare(
      "UPDATE messages SET trashed_at = ? WHERE id = ?",
    ).bind(new Date().toISOString(), "claimed-trash-message").run();

    await expect(abortClaimedTrashedOutbound(testEnv, "claimed-trash-message"))
      .resolves.toBe(true);
    expect(await getOutboundStatus(testEnv, "claimed-trash-message")).toBe("failed");
    const usage = await testEnv.DB.prepare(
      "SELECT sent_count FROM send_usage WHERE owner_id = ?",
    ).bind(mailbox.owner_id).first<{ sent_count: number }>();
    expect(usage?.sent_count).toBe(0);
  });

  it("settles abandoned trashed queue records during scheduled maintenance", async () => {
    const mailbox = await createMailbox(testEnv, {
      ownerId: "sweep-trash-owner",
      localPart: "sweep-trash-owner",
      displayName: "Sweep Trash",
    });
    const now = new Date().toISOString();
    await testEnv.DB.batch([
      testEnv.DB.prepare(
        `INSERT INTO messages
          (id, mailbox_id, direction, folder, from_address, to_json, cc_json,
           subject, text_body, references_json, status, created_at, trashed_at)
         VALUES (?, ?, 'outbound', 'outbox', ?, '[]', '[]', 'Sweep',
           'Body', '[]', 'queued', ?, ?)`,
      ).bind("sweep-trash-message", mailbox.id, mailbox.address, now, now),
      testEnv.DB.prepare(
        "INSERT INTO send_usage (owner_id, day_key, sent_count) VALUES (?, ?, 1)",
      ).bind(mailbox.owner_id, now.slice(0, 10)),
    ]);

    await expect(settleTrashedQueuedMessages(testEnv)).resolves.toBe(1);
    await expect(settleTrashedQueuedMessages(testEnv)).resolves.toBe(0);
    const state = await testEnv.DB.prepare(
      "SELECT status, error_code FROM messages WHERE id = ?",
    ).bind("sweep-trash-message")
      .first<{ status: string; error_code: string }>();
    const usage = await testEnv.DB.prepare(
      "SELECT sent_count FROM send_usage WHERE owner_id = ?",
    ).bind(mailbox.owner_id).first<{ sent_count: number }>();
    expect(state).toEqual({
      status: "failed",
      error_code: "cancelled_trashed",
    });
    expect(usage?.sent_count).toBe(0);
    expect(sendWithResend).not.toHaveBeenCalled();
  });

});
