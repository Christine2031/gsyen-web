import {
  applyD1Migrations,
  env,
  type D1Migration,
} from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { parseMessageCursor, serializeMessageCursor } from "../src/messageCursor";
import {
  createMailbox,
  listMessages,
  updateMessagesState,
  updateMessageState,
} from "../src/repository";
import type { MailEnv } from "../src/types";

type TestEnv = MailEnv & {
  TEST_MIGRATIONS: D1Migration[];
};

const testEnv = env as TestEnv;

beforeEach(async () => {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
});

describe("message state", () => {
  it("moves one message through starred, archive, and trash views", async () => {
    const mailbox = await createMailbox(testEnv, {
      ownerId: "stateowner",
      localPart: "stateowner",
      displayName: "State",
    });
    const now = new Date().toISOString();
    await testEnv.DB.prepare(
      `INSERT INTO messages
        (id, mailbox_id, direction, folder, from_address, to_json, cc_json,
         subject, text_body, references_json, status, created_at, received_at)
       VALUES (?, ?, 'inbound', 'inbox', ?, '[]', '[]', ?, ?, '[]',
         'received', ?, ?)`,
    ).bind(
      "state-message",
      mailbox.id,
      "sender@example.com",
      "State test",
      "Body",
      now,
      now,
    ).run();

    await updateMessageState(testEnv, mailbox.id, "state-message", {
      isRead: true,
      isStarred: true,
      archived: true,
    });
    expect(await listMessages(testEnv, mailbox.id, "inbox")).toHaveLength(0);
    expect(await listMessages(testEnv, mailbox.id, "starred")).toHaveLength(1);
    expect(await listMessages(testEnv, mailbox.id, "archive")).toHaveLength(1);

    await updateMessageState(testEnv, mailbox.id, "state-message", {
      trashed: true,
    });
    expect(await listMessages(testEnv, mailbox.id, "starred")).toHaveLength(0);
    expect(await listMessages(testEnv, mailbox.id, "trash")).toHaveLength(1);
  });

  it("paginates messages with identical timestamps without skipping rows", async () => {
    const mailbox = await createMailbox(testEnv, {
      ownerId: "cursorowner",
      localPart: "cursorowner",
      displayName: "Cursor",
    });
    const createdAt = "2020-01-01T10:00:00.000Z";
    const statements = Array.from({ length: 51 }, (_, index) => {
      const id = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
      return testEnv.DB.prepare(
        `INSERT INTO messages
          (id, mailbox_id, direction, folder, from_address, to_json, cc_json,
           subject, text_body, references_json, status, created_at, received_at)
         VALUES (?, ?, 'inbound', 'inbox', ?, '[]', '[]', ?, ?, '[]',
           'received', ?, ?)`,
      ).bind(id, mailbox.id, "sender@example.com", `Message ${index}`, "Body", createdAt, createdAt);
    });
    await testEnv.DB.batch(statements);

    const first = await listMessages(testEnv, mailbox.id, "inbox");
    const last = first.at(-1);
    const serialized = serializeMessageCursor(last);
    const cursor = parseMessageCursor(serialized);
    const second = await listMessages(testEnv, mailbox.id, "inbox", cursor);

    expect(first).toHaveLength(50);
    expect(second).toHaveLength(1);
    expect(new Set([...first, ...second].map((message) => message.id)).size).toBe(51);
  });

  it("updates a bounded batch without crossing mailbox ownership", async () => {
    const mailbox = await createMailbox(testEnv, {
      ownerId: "batchstateowner",
      localPart: "batchstate",
      displayName: "Batch State",
    });
    const other = await createMailbox(testEnv, {
      ownerId: "batchstateother",
      localPart: "batchstateother",
      displayName: "Other",
    });
    const now = new Date().toISOString();
    const insert = (id: string, mailboxId: string) => testEnv.DB.prepare(
      `INSERT INTO messages
        (id, mailbox_id, direction, folder, from_address, to_json, cc_json,
         subject, text_body, references_json, status, created_at, received_at)
       VALUES (?, ?, 'inbound', 'inbox', ?, '[]', '[]', 'Batch', 'Body',
         '[]', 'received', ?, ?)`,
    ).bind(id, mailboxId, "sender@example.com", now, now);
    const firstId = "00000000-0000-4000-8000-000000000101";
    const secondId = "00000000-0000-4000-8000-000000000102";
    const foreignId = "00000000-0000-4000-8000-000000000103";
    await testEnv.DB.batch([
      insert(firstId, mailbox.id),
      insert(secondId, mailbox.id),
      insert(foreignId, other.id),
    ]);

    const updated = await updateMessagesState(
      testEnv,
      mailbox.id,
      [firstId, secondId],
      { isStarred: true },
    );
    expect(updated).toHaveLength(2);
    await expect(updateMessagesState(
      testEnv,
      mailbox.id,
      [firstId, foreignId],
      { isImportant: true },
    )).rejects.toMatchObject({ status: 404 });
    const first = await testEnv.DB.prepare(
      "SELECT is_important FROM messages WHERE id = ?",
    ).bind(firstId).first<{ is_important: number }>();
    expect(first?.is_important).toBe(0);
  });
});
