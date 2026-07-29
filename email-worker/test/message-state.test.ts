import {
  applyD1Migrations,
  env,
  type D1Migration,
} from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
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
});
