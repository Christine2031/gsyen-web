import {
  applyD1Migrations,
  env,
  type D1Migration,
} from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { routeMessageRequest } from "../src/messageApi";
import { createMailbox, updateMessageState } from "../src/repository";
import type { AuthUser, MailEnv } from "../src/types";

type TestEnv = MailEnv & { TEST_MIGRATIONS: D1Migration[] };
const testEnv = env as TestEnv;
const user: AuthUser = { id: "apiowner", email: "api@gsyen.com", isAdmin: false, userMetadata: {} };
const ctx = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
} as unknown as ExecutionContext;

beforeEach(async () => {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  vi.clearAllMocks();
});

describe("message API representation", () => {
  it("exposes provider IDs but hides non-RFC inbound dedupe hashes", async () => {
    const mailbox = await createMailbox(testEnv, {
      ownerId: user.id,
      localPart: "apiowner",
      displayName: "API",
    });
    await testEnv.DB.prepare(
      "UPDATE mailboxes SET status = 'active' WHERE id = ?",
    ).bind(mailbox.id).run();
    const now = new Date().toISOString();
    await testEnv.DB.prepare(
      `INSERT INTO messages
        (id, mailbox_id, direction, folder, provider_message_id,
         internet_message_id, from_address, to_json, cc_json, subject,
         text_body, references_json, status, created_at, received_at, category)
       VALUES (?, ?, 'inbound', 'inbox', 'provider-123', 'sha256:dedupe',
         'sender@example.com', '[]', '[]', 'Hello', 'Body', '[]',
         'received', ?, ?, 'updates')`,
    ).bind(
      "00000000-0000-4000-8000-000000000301",
      mailbox.id,
      now,
      now,
    ).run();
    const request = new Request("https://mail.test/v1/messages?folder=inbox");
    const response = await routeMessageRequest(
      request,
      testEnv,
      ctx,
      user,
      "/v1/messages",
      new URL(request.url),
    );
    const body = await response?.json<{
      messages: Array<{
        providerMessageId: string;
        internetMessageId: string | null;
        category: string;
      }>;
      nextCursor: string | null;
    }>();
    expect(body?.messages[0]).toMatchObject({
      providerMessageId: "provider-123",
      internetMessageId: null,
      category: "updates",
    });
    expect(body?.nextCursor).toBeNull();
  });

  it("lists all folders in one mailbox-scoped page", async () => {
    const allUser: AuthUser = {
      id: "all-apiowner",
      email: "all-api@gsyen.com",
      isAdmin: false,
      userMetadata: {},
    };
    const mailbox = await createMailbox(testEnv, {
      ownerId: allUser.id,
      localPart: "allowner",
      displayName: "All",
    });
    const other = await createMailbox(testEnv, {
      ownerId: "otherowner",
      localPart: "otherowner",
      displayName: "Other",
    });
    await testEnv.DB.prepare(
      "UPDATE mailboxes SET status = 'active' WHERE id IN (?, ?)",
    ).bind(mailbox.id, other.id).run();
    const insert = (id: string, mailboxId: string, trashedAt: string | null) =>
      testEnv.DB.prepare(
        `INSERT INTO messages
          (id, mailbox_id, direction, folder, from_address, to_json, cc_json,
           subject, text_body, references_json, status, created_at, trashed_at)
         VALUES (?, ?, 'inbound', 'inbox', 'sender@example.com', '[]', '[]',
           'Hello', 'Body', '[]', 'received', ?, ?)`,
      ).bind(id, mailboxId, new Date().toISOString(), trashedAt).run();
    await insert("00000000-0000-4000-8000-000000000311", mailbox.id, null);
    await insert(
      "00000000-0000-4000-8000-000000000312",
      mailbox.id,
      new Date().toISOString(),
    );
    await insert("00000000-0000-4000-8000-000000000313", other.id, null);

    const request = new Request("https://mail.test/v1/messages?folder=all");
    const response = await routeMessageRequest(
      request,
      testEnv,
      ctx,
      allUser,
      "/v1/messages",
      new URL(request.url),
    );
    const body = await response?.json<{ messages: Array<{ id: string }> }>();
    expect(body?.messages.map((item) => item.id).sort()).toEqual([
      "00000000-0000-4000-8000-000000000311",
      "00000000-0000-4000-8000-000000000312",
    ]);
  });

  it("returns the persisted delivery state for an idempotent send retry", async () => {
    const retryUser: AuthUser = {
      id: "sendretryowner",
      email: "send-retry@gsyen.com",
      isAdmin: false,
      userMetadata: {},
    };
    const mailbox = await createMailbox(testEnv, {
      ownerId: retryUser.id,
      localPart: "sendretryowner",
      displayName: "Retry",
    });
    await testEnv.DB.prepare(
      "UPDATE mailboxes SET status = 'active' WHERE id = ?",
    ).bind(mailbox.id).run();
    const requestFor = () => new Request("https://mail.test/v1/messages/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "client:20260730:send-retry",
      },
      body: JSON.stringify({
        to: ["recipient@example.com"],
        cc: [],
        subject: "Retry",
        text: "Body",
      }),
    });
    const firstRequest = requestFor();
    const first = await routeMessageRequest(
      firstRequest,
      testEnv,
      ctx,
      retryUser,
      "/v1/messages/send",
      new URL(firstRequest.url),
    );
    const firstBody = await first?.json<{ messageId: string; status: string }>();
    await testEnv.DB.prepare(
      "UPDATE messages SET status = 'sent' WHERE id = ?",
    ).bind(firstBody?.messageId).run();

    const retryRequest = requestFor();
    const retry = await routeMessageRequest(
      retryRequest,
      testEnv,
      ctx,
      retryUser,
      "/v1/messages/send",
      new URL(retryRequest.url),
    );
    await expect(retry?.json()).resolves.toMatchObject({
      messageId: firstBody?.messageId,
      status: "sent",
      duplicate: true,
    });
  });

  it("rejects a null batch body through the 400 validation path", async () => {
    const batchUser: AuthUser = {
      id: "batchnullowner",
      email: "batch-null@gsyen.com",
      isAdmin: false,
      userMetadata: {},
    };
    const mailbox = await createMailbox(testEnv, {
      ownerId: batchUser.id,
      localPart: "batchnullowner",
      displayName: "Batch Null",
    });
    await testEnv.DB.prepare(
      "UPDATE mailboxes SET status = 'active' WHERE id = ?",
    ).bind(mailbox.id).run();
    const request = new Request("https://mail.test/v1/messages/batch", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "null",
    });

    await expect(routeMessageRequest(
      request,
      testEnv,
      ctx,
      batchUser,
      "/v1/messages/batch",
      new URL(request.url),
    )).rejects.toMatchObject({
      status: 400,
      code: "invalid_message_ids",
    });
  });
  it("returns changes after a snapshot cursor for another client's state update", async () => {
    const syncUser: AuthUser = {
      id: "sync-apiowner",
      email: "sync-api@gsyen.com",
      isAdmin: false,
      userMetadata: {},
    };
    const mailbox = await createMailbox(testEnv, {
      ownerId: syncUser.id,
      localPart: "syncowner",
      displayName: "Sync",
    });
    await testEnv.DB.prepare(
      "UPDATE mailboxes SET status = 'active' WHERE id = ?",
    ).bind(mailbox.id).run();
    const messageId = "00000000-0000-4000-8000-000000000314";
    await testEnv.DB.prepare(
      `INSERT INTO messages
        (id, mailbox_id, direction, folder, from_address, to_json, cc_json,
         subject, text_body, references_json, status, created_at)
       VALUES (?, ?, 'inbound', 'inbox', 'sender@example.com', '[]', '[]',
         'Hello', 'Body', '[]', 'received', ?)`,
    ).bind(messageId, mailbox.id, new Date().toISOString()).run();

    const snapshotRequest = new Request("https://mail.test/v1/messages?folder=all");
    const snapshot = await routeMessageRequest(
      snapshotRequest, testEnv, ctx, syncUser, "/v1/messages", new URL(snapshotRequest.url),
    );
    const snapshotBody = await snapshot?.json<{ syncCursor: number }>();
    expect(snapshotBody?.syncCursor).toBeGreaterThan(0);

    await updateMessageState(testEnv, mailbox.id, messageId, { isStarred: true });
    const changesRequest = new Request(
      `https://mail.test/v1/messages/changes?after=${snapshotBody?.syncCursor}`,
    );
    const changes = await routeMessageRequest(
      changesRequest, testEnv, ctx, syncUser, "/v1/messages/changes", new URL(changesRequest.url),
    );
    const changesBody = await changes?.json<{
      changes: Array<{ cursor: number; operation: string; messageId: string; message: { isStarred: boolean } }>;
      nextCursor: number | null;
    }>();
    expect(changesBody?.changes).toEqual([
      expect.objectContaining({ operation: "upsert", messageId, message: expect.objectContaining({ isStarred: true }) }),
    ]);
    expect(changesBody?.nextCursor).toBeNull();
  });
});
