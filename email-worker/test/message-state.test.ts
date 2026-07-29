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
      ownerId: "state-owner",
      localPart: "state-owner",
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
      ownerId: "cursor-owner",
      localPart: "cursor-owner",
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
});
