import {
  applyD1Migrations,
  env,
  type D1Migration,
} from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { routeMessageRequest } from "../src/messageApi";
import { createMailbox } from "../src/repository";
import type { AuthUser, MailEnv } from "../src/types";

type TestEnv = MailEnv & { TEST_MIGRATIONS: D1Migration[] };
const testEnv = env as TestEnv;
const user: AuthUser = {
  id: "sync-trigger-owner",
  email: "sync-trigger@gsyen.com",
  isAdmin: false,
  userMetadata: {},
};
const ctx = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
} as unknown as ExecutionContext;

beforeEach(async () => {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  vi.clearAllMocks();
});

async function activeMailbox(owner = user) {
  const mailbox = await createMailbox(testEnv, {
    ownerId: owner.id,
    localPart: owner.id.replace(/[^a-z0-9]/gi, ""),
    displayName: "Sync Trigger",
  });
  await testEnv.DB.prepare(
    "UPDATE mailboxes SET status = 'active' WHERE id = ?",
  ).bind(mailbox.id).run();
  return mailbox;
}

async function route(path: string, owner = user) {
  const request = new Request(`https://mail.test${path}`);
  return routeMessageRequest(
    request,
    testEnv,
    ctx,
    owner,
    new URL(request.url).pathname,
    new URL(request.url),
  );
}

describe("message synchronization events", () => {
  it("records insert, update, and delete changes atomically", async () => {
    const mailbox = await activeMailbox();
    const messageId = "00000000-0000-4000-8000-000000000401";
    await testEnv.DB.prepare(
      `INSERT INTO messages
        (id, mailbox_id, direction, folder, from_address, to_json, cc_json,
         subject, text_body, references_json, status, created_at)
       VALUES (?, ?, 'inbound', 'inbox', 'sender@example.com', '[]', '[]',
         'Original', 'Body', '[]', 'received', ?)`,
    ).bind(messageId, mailbox.id, new Date().toISOString()).run();

    const snapshot = await route("/v1/messages?folder=all");
    const snapshotBody = await snapshot?.json<{ syncCursor: number }>();
    expect(snapshotBody?.syncCursor).toBeGreaterThan(0);

    await testEnv.DB.prepare(
      "UPDATE messages SET subject = 'Updated' WHERE id = ?",
    ).bind(messageId).run();
    const updated = await route(
      `/v1/messages/changes?after=${snapshotBody?.syncCursor}`,
    );
    const updatedBody = await updated?.json<{
      changes: Array<{
        cursor: number;
        operation: string;
        messageId: string;
        message: { subject: string } | null;
      }>;
    }>();
    expect(updatedBody?.changes).toEqual([
      expect.objectContaining({
        operation: "upsert",
        messageId,
        message: expect.objectContaining({ subject: "Updated" }),
      }),
    ]);
    const updateCursor = updatedBody?.changes.at(-1)?.cursor;
    expect(updateCursor).toBeGreaterThan(snapshotBody?.syncCursor ?? 0);

    await testEnv.DB.prepare(
      "DELETE FROM messages WHERE id = ? AND mailbox_id = ?",
    ).bind(messageId, mailbox.id).run();
    const deleted = await route(`/v1/messages/changes?after=${updateCursor}`);
    const deletedBody = await deleted?.json<{
      changes: Array<{
        operation: string;
        messageId: string;
        message: unknown;
      }>;
    }>();
    expect(deletedBody?.changes).toEqual([
      expect.objectContaining({
        operation: "delete",
        messageId,
        message: null,
      }),
    ]);
  });
});
