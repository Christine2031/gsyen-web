import {
  applyD1Migrations,
  env,
  type D1Migration,
} from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import {
  cleanupObjectDeletionJobs,
  createMailbox,
  deleteTrashedMessage,
  updateMessageState,
} from "../src/repository";
import type { MailEnv } from "../src/types";

type TestEnv = MailEnv & { TEST_MIGRATIONS: D1Migration[] };
const testEnv = env as TestEnv;
const objectStore = testEnv.MAIL_OBJECTS;

beforeEach(async () => {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
});

async function storedMessage(): Promise<{ mailboxId: string; messageId: string }> {
  const mailbox = await createMailbox(testEnv, {
    ownerId: "delete-owner",
    localPart: "delete-owner",
    displayName: "Delete",
  });
  const messageId = "00000000-0000-4000-8000-000000000201";
  const now = new Date().toISOString();
  await testEnv.DB.batch([
    testEnv.DB.prepare(
      `INSERT INTO messages
        (id, mailbox_id, direction, folder, from_address, to_json, cc_json,
         subject, text_body, raw_object_key, html_object_key, references_json,
         status, created_at, received_at)
       VALUES (?, ?, 'inbound', 'inbox', ?, '[]', '[]', 'Delete', 'Body',
         'raw/delete.eml', 'html/delete.html', '[]', 'received', ?, ?)`,
    ).bind(messageId, mailbox.id, "sender@example.com", now, now),
    testEnv.DB.prepare(
      `INSERT INTO attachments
        (id, message_id, filename, mime_type, disposition, size_bytes, object_key)
       VALUES (?, ?, 'file.txt', 'text/plain', 'attachment', 4, 'attachments/delete')`,
    ).bind("00000000-0000-4000-8000-000000000202", messageId),
  ]);
  await Promise.all([
    testEnv.MAIL_OBJECTS.put("raw/delete.eml", "raw"),
    testEnv.MAIL_OBJECTS.put("html/delete.html", "html"),
    testEnv.MAIL_OBJECTS.put("attachments/delete", "file"),
  ]);
  return { mailboxId: mailbox.id, messageId };
}

describe("permanent message deletion", () => {
  it("requires trash, deletes D1 state, and reliably clears R2 objects", async () => {
    const { mailboxId, messageId } = await storedMessage();
    await expect(deleteTrashedMessage(testEnv, mailboxId, messageId))
      .rejects.toMatchObject({ status: 409, code: "message_not_trashed" });
    await updateMessageState(testEnv, mailboxId, messageId, { trashed: true });

    const result = await deleteTrashedMessage(testEnv, mailboxId, messageId);
    expect(result.pendingObjects).toBe(3);
    const message = await testEnv.DB.prepare(
      "SELECT id FROM messages WHERE id = ?",
    ).bind(messageId).first();
    const jobs = await testEnv.DB.prepare(
      "SELECT object_key FROM object_deletion_jobs",
    ).all();
    expect(message).toBeNull();
    expect(jobs.results).toHaveLength(3);

    expect(await cleanupObjectDeletionJobs(testEnv)).toEqual({ deleted: 3, failed: 0 });
    expect(await testEnv.MAIL_OBJECTS.get("raw/delete.eml")).toBeNull();
    const remaining = await testEnv.DB.prepare(
      "SELECT object_key FROM object_deletion_jobs",
    ).all();
    expect(remaining.results).toHaveLength(0);
  });

  it("does not reveal or delete a message owned by another mailbox", async () => {
    const { messageId } = await storedMessage();
    const other = await createMailbox(testEnv, {
      ownerId: "delete-other",
      localPart: "delete-other",
      displayName: "Other",
    });
    await expect(deleteTrashedMessage(testEnv, other.id, messageId))
      .rejects.toMatchObject({ status: 404 });
  });

  it("retains a failed R2 cleanup job for the next scheduled retry", async () => {
    const now = new Date().toISOString();
    await testEnv.DB.prepare(
      `INSERT INTO object_deletion_jobs
        (object_key, attempts, last_error, created_at, updated_at)
       VALUES ('raw/retry.eml', 0, NULL, ?, ?)`,
    ).bind(now, now).run();
    const failingEnv = Object.assign(Object.create(testEnv), {
      MAIL_OBJECTS: {
        delete: async () => {
          throw new Error("temporary R2 failure");
        },
      },
    }) as MailEnv;

    expect(await cleanupObjectDeletionJobs(failingEnv)).toEqual({ deleted: 0, failed: 1 });
    const job = await testEnv.DB.prepare(
      "SELECT attempts, last_error FROM object_deletion_jobs WHERE object_key = ?",
    ).bind("raw/retry.eml").first<{ attempts: number; last_error: string }>();
    expect(job?.attempts).toBe(1);
    expect(job?.last_error).toContain("temporary R2 failure");
    const retry = await testEnv.DB.prepare(
      "SELECT next_attempt_at FROM object_deletion_jobs WHERE object_key = ?",
    ).bind("raw/retry.eml").first<{ next_attempt_at: string }>();
    expect(Date.parse(retry?.next_attempt_at ?? "")).toBeGreaterThan(Date.now());
  });

  it("backs off a poison job without starving a newly due job", async () => {
    const old = new Date(Date.now() - 60_000).toISOString();
    await testEnv.DB.prepare(
      `INSERT INTO object_deletion_jobs
        (object_key, attempts, last_error, created_at, updated_at)
       VALUES ('raw/poison.eml', 0, NULL, ?, ?)`,
    ).bind(old, old).run();
    const failingEnv = Object.assign(Object.create(testEnv), {
      MAIL_OBJECTS: {
        delete: async (key: string) => {
          if (key === "raw/poison.eml") throw new Error("poison object");
          return objectStore.delete(key);
        },
      },
    }) as MailEnv;
    expect(await cleanupObjectDeletionJobs(failingEnv, 1))
      .toEqual({ deleted: 0, failed: 1 });
    const poisonRetry = await testEnv.DB.prepare(
      "SELECT next_attempt_at FROM object_deletion_jobs WHERE object_key = ?",
    ).bind("raw/poison.eml").first<{ next_attempt_at: string }>();
    expect(Date.parse(poisonRetry?.next_attempt_at ?? ""))
      .toBeGreaterThan(Date.now());

    const now = new Date().toISOString();
    await testEnv.DB.prepare(
      `INSERT INTO object_deletion_jobs
        (object_key, attempts, last_error, created_at, updated_at)
       VALUES ('raw/new-due.eml', 0, NULL, ?, ?)`,
    ).bind(now, now).run();
    expect(await cleanupObjectDeletionJobs(failingEnv, 1))
      .toEqual({ deleted: 1, failed: 0 });
    expect(await testEnv.DB.prepare(
      "SELECT object_key FROM object_deletion_jobs WHERE object_key = ?",
    ).bind("raw/new-due.eml").first()).toBeNull();
    expect(await testEnv.DB.prepare(
      "SELECT object_key FROM object_deletion_jobs WHERE object_key = ?",
    ).bind("raw/poison.eml").first()).not.toBeNull();
  });

  it("refunds a trashed queued message before permanent deletion", async () => {
    const mailbox = await createMailbox(testEnv, {
      ownerId: "delete-queued-owner",
      localPart: "delete-queued-owner",
      displayName: "Delete Queued",
    });
    const messageId = "00000000-0000-4000-8000-000000000203";
    const now = new Date().toISOString();
    await testEnv.DB.batch([
      testEnv.DB.prepare(
        `INSERT INTO messages
          (id, mailbox_id, direction, folder, from_address, to_json, cc_json,
           subject, text_body, references_json, status, created_at, trashed_at)
         VALUES (?, ?, 'outbound', 'outbox', ?, '[]', '[]', 'Delete queued',
           'Body', '[]', 'queued', ?, ?)`,
      ).bind(messageId, mailbox.id, mailbox.address, now, now),
      testEnv.DB.prepare(
        "INSERT INTO send_usage (owner_id, day_key, sent_count) VALUES (?, ?, 1)",
      ).bind(mailbox.owner_id, now.slice(0, 10)),
    ]);

    await expect(deleteTrashedMessage(testEnv, mailbox.id, messageId))
      .resolves.toEqual({ pendingObjects: 0 });
    expect(await testEnv.DB.prepare(
      "SELECT id FROM messages WHERE id = ?",
    ).bind(messageId).first()).toBeNull();
    const usage = await testEnv.DB.prepare(
      "SELECT sent_count FROM send_usage WHERE owner_id = ?",
    ).bind(mailbox.owner_id).first<{ sent_count: number }>();
    expect(usage?.sent_count).toBe(0);
  });

  it("does not refund quota if a queued message is untrashed before deletion", async () => {
    const mailbox = await createMailbox(testEnv, {
      ownerId: "delete-race-owner",
      localPart: "delete-race-owner",
      displayName: "Delete Race",
    });
    const messageId = "00000000-0000-4000-8000-000000000204";
    const now = new Date().toISOString();
    await testEnv.DB.batch([
      testEnv.DB.prepare(
        `INSERT INTO messages
          (id, mailbox_id, direction, folder, from_address, to_json, cc_json,
           subject, text_body, references_json, status, created_at, trashed_at)
         VALUES (?, ?, 'outbound', 'outbox', ?, '[]', '[]', 'Delete race',
           'Body', '[]', 'queued', ?, ?)`,
      ).bind(messageId, mailbox.id, mailbox.address, now, now),
      testEnv.DB.prepare(
        "INSERT INTO send_usage (owner_id, day_key, sent_count) VALUES (?, ?, 1)",
      ).bind(mailbox.owner_id, now.slice(0, 10)),
    ]);
    const raceDb = new Proxy(testEnv.DB, {
      get(target, property) {
        if (property !== "batch") return Reflect.get(target, property);
        return async (statements: D1PreparedStatement[]) => {
          await target.prepare(
            "UPDATE messages SET trashed_at = NULL WHERE id = ?",
          ).bind(messageId).run();
          return target.batch(statements);
        };
      },
    });
    const raceEnv = Object.assign(Object.create(testEnv), {
      DB: raceDb,
    }) as MailEnv;

    await expect(deleteTrashedMessage(raceEnv, mailbox.id, messageId))
      .rejects.toMatchObject({ status: 409, code: "message_delete_conflict" });
    const usage = await testEnv.DB.prepare(
      "SELECT sent_count FROM send_usage WHERE owner_id = ?",
    ).bind(mailbox.owner_id).first<{ sent_count: number }>();
    expect(usage?.sent_count).toBe(1);
  });
});
