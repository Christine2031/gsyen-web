import {
  applyD1Migrations,
  env,
  type D1Migration,
} from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { consumeOutbound } from "../src/outbound";
import { sendWithResend } from "../src/providers/resend";
import { createMailbox } from "../src/repository";
import type { MailEnv, OutboundJob } from "../src/types";

type TestEnv = MailEnv & { TEST_MIGRATIONS: D1Migration[] };
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

async function insertQueuedMessage(
  messageId = "dual-write-message",
  ownerId = "dual-write-owner",
): Promise<void> {
  const mailbox = await createMailbox(testEnv, {
    ownerId,
    localPart: ownerId,
    displayName: "Dual Write",
  });
  await testEnv.DB.prepare(
    "UPDATE mailboxes SET status = 'active' WHERE id = ?",
  ).bind(mailbox.id).run();
  await testEnv.DB.prepare(
    `INSERT INTO messages
      (id, mailbox_id, direction, folder, from_address, to_json, cc_json,
       subject, text_body, references_json, status, created_at)
     VALUES (?, ?, 'outbound', 'outbox', ?, ?, '[]', 'Persist',
       'Body', '[]', 'queued', ?)`,
  ).bind(
    messageId,
    mailbox.id,
    mailbox.address,
    JSON.stringify(["recipient@example.com"]),
    new Date().toISOString(),
  ).run();
}

function unavailablePersistenceEnv(
  recoverySend: (
    job: OutboundJob,
    options?: { delaySeconds?: number },
  ) => Promise<void>,
): MailEnv {
  const failingDb = new Proxy(testEnv.DB, {
    get(target, property) {
      if (property !== "prepare") return Reflect.get(target, property);
      return (query: string) => {
        if (query.includes("SET status = 'sent'")) {
          return {
            bind: () => ({
            run: async () => {
              throw new Error("D1 sent-state unavailable");
            },
          }),
          } as unknown as D1PreparedStatement;
        }
        return target.prepare(query);
      };
    },
  });
  const failingObjects = new Proxy(testEnv.MAIL_OBJECTS, {
    get(target, property) {
      if (property !== "put") return Reflect.get(target, property);
      return async () => {
        throw new Error("R2 receipt unavailable");
      };
    },
  });
  return new Proxy(testEnv, {
    get(target, property) {
      if (property === "DB") return failingDb;
      if (property === "MAIL_OBJECTS") return failingObjects;
      if (property === "OUTBOUND_QUEUE") return { send: recoverySend };
      return Reflect.get(target, property);
    },
  });
}

describe("accepted outbound reconciliation", () => {
  it("does not mark failed or call Resend twice when D1 and R2 both fail", async () => {
    await insertQueuedMessage();
    const recoverySend = vi.fn<(
      job: OutboundJob,
      options?: { delaySeconds?: number },
    ) => Promise<void>>(async () => undefined);
    const queued = {
      body: { messageId: "dual-write-message" },
      ack: vi.fn(),
      retry: vi.fn(),
    };
    await consumeOutbound(
      { messages: [queued] } as unknown as MessageBatch<OutboundJob>,
      unavailablePersistenceEnv(recoverySend),
    );

    expect(queued.ack).toHaveBeenCalledOnce();
    expect(queued.retry).not.toHaveBeenCalled();
    expect(recoverySend).toHaveBeenCalledOnce();
    await expect(testEnv.DB.prepare(
      "SELECT status, error_code FROM messages WHERE id = ?",
    ).bind("dual-write-message").first()).resolves.toEqual({
      status: "sending",
      error_code: null,
    });

    const reconciliation = {
      body: recoverySend.mock.calls[0][0] as OutboundJob,
      ack: vi.fn(),
      retry: vi.fn(),
    };
    await consumeOutbound(
      { messages: [reconciliation] } as unknown as MessageBatch<OutboundJob>,
      testEnv,
    );

    expect(reconciliation.ack).toHaveBeenCalledOnce();
    expect(reconciliation.retry).not.toHaveBeenCalled();
    expect(sendWithResend).toHaveBeenCalledOnce();
    await expect(testEnv.DB.prepare(
      `SELECT status, error_code, provider_message_id
         FROM messages WHERE id = ?`,
    ).bind("dual-write-message").first()).resolves.toEqual({
      status: "sent",
      error_code: null,
      provider_message_id: "provider-message",
    });
  });

  it("retries a reconciliation job without invoking the sending provider", async () => {
    const messageId = "reconcile-only-message";
    await insertQueuedMessage(messageId, "reconcile-only-owner");
    await testEnv.DB.prepare(
      "UPDATE messages SET status = 'sending' WHERE id = ?",
    ).bind(messageId).run();
    const recoverySend = vi.fn<(
      job: OutboundJob,
      options?: { delaySeconds?: number },
    ) => Promise<void>>(async () => undefined);
    const reconciliation = {
      body: {
        kind: "reconcile",
        messageId,
        providerMessageId: "already-accepted-provider-id",
        internetMessageId: "<already-accepted@resend.example>",
        sentAt: new Date().toISOString(),
      } satisfies OutboundJob,
      ack: vi.fn(),
      retry: vi.fn(),
    };

    await consumeOutbound(
      { messages: [reconciliation] } as unknown as MessageBatch<OutboundJob>,
      unavailablePersistenceEnv(recoverySend),
    );

    expect(reconciliation.ack).not.toHaveBeenCalled();
    expect(reconciliation.retry).toHaveBeenCalledOnce();
    expect(sendWithResend).not.toHaveBeenCalled();
    await expect(testEnv.DB.prepare(
      "SELECT status, error_code FROM messages WHERE id = ?",
    ).bind(messageId).first()).resolves.toEqual({
      status: "sending",
      error_code: null,
    });
  });
});
