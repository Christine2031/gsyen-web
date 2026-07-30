import {
  applyD1Migrations,
  env,
  type D1Migration,
} from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  persistProviderDelivery,
  replayDeliveryReceipts,
} from "../src/deliveryReceipts";
import { createMailbox } from "../src/repository";
import type { MailEnv } from "../src/types";

type TestEnv = MailEnv & { TEST_MIGRATIONS: D1Migration[] };
const testEnv = env as TestEnv;

vi.mock("../src/providers/resend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/providers/resend")>();
  return {
    ...actual,
    getResendInternetMessageId: vi.fn(
      async () => "<replayed@resend.example>",
    ),
  };
});

beforeEach(async () => {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  vi.clearAllMocks();
});

async function insertSendingMessage(id: string, ownerId: string): Promise<void> {
  const mailbox = await createMailbox(testEnv, {
    ownerId,
    localPart: ownerId,
    displayName: "Receipt",
  });
  const now = new Date().toISOString();
  await testEnv.DB.prepare(
    `INSERT INTO messages
      (id, mailbox_id, direction, folder, from_address, to_json, cc_json,
       subject, text_body, references_json, status, created_at, last_attempt_at)
     VALUES (?, ?, 'outbound', 'outbox', ?, '[]', '[]', 'Receipt',
       'Body', '[]', 'sending', ?, ?)`,
  ).bind(id, mailbox.id, mailbox.address, now, now).run();
}

async function putReceipt(
  messageId: string,
  nextLookupAt: string,
  statePersisted = true,
): Promise<void> {
  await testEnv.MAIL_OBJECTS.put(
    `delivery-receipts/${messageId}.json`,
    JSON.stringify({
      version: 1,
      messageId,
      providerMessageId: `provider-${messageId}`,
      sentAt: new Date(Date.now() - 60_000).toISOString(),
      internetMessageId: null,
      statePersisted,
      lookupAttempts: 1,
      nextLookupAt,
    }),
  );
}

describe("delivery receipt reconciliation", () => {
  it("persists provider and RFC IDs and removes the temporary receipt", async () => {
    await insertSendingMessage("persisted-receipt", "receipt-persist-owner");
    await expect(persistProviderDelivery(
      testEnv,
      "persisted-receipt",
      "provider-persisted",
      "<persisted@resend.example>",
    )).resolves.toEqual({
      statePersisted: true,
      receiptRecorded: true,
    });
    const message = await testEnv.DB.prepare(
      `SELECT status, provider_message_id, internet_message_id
         FROM messages WHERE id = ?`,
    ).bind("persisted-receipt").first<{
      status: string;
      provider_message_id: string;
      internet_message_id: string;
    }>();
    expect(message).toEqual({
      status: "sent",
      provider_message_id: "provider-persisted",
      internet_message_id: "<persisted@resend.example>",
    });
    expect(await testEnv.MAIL_OBJECTS.get(
      "delivery-receipts/persisted-receipt.json",
    )).toBeNull();
  });

  it("replays an R2 fallback into D1 and cleans the receipt", async () => {
    await insertSendingMessage("replay-receipt", "receipt-replay-owner");
    const sentAt = new Date(Date.now() - 60_000).toISOString();
    await testEnv.MAIL_OBJECTS.put(
      "delivery-receipts/replay-receipt.json",
      JSON.stringify({
        version: 1,
        messageId: "replay-receipt",
        providerMessageId: "provider-replay",
        sentAt,
        internetMessageId: null,
        statePersisted: false,
        lookupAttempts: 1,
        nextLookupAt: new Date(Date.now() - 1_000).toISOString(),
      }),
    );
    await expect(replayDeliveryReceipts(testEnv)).resolves.toEqual({
      replayed: 1,
      pending: 0,
      invalid: 0,
    });
    const message = await testEnv.DB.prepare(
      `SELECT status, provider_message_id, internet_message_id, sent_at
         FROM messages WHERE id = ?`,
    ).bind("replay-receipt").first<{
      status: string;
      provider_message_id: string;
      internet_message_id: string;
      sent_at: string;
    }>();
    expect(message).toEqual({
      status: "sent",
      provider_message_id: "provider-replay",
      internet_message_id: "<replayed@resend.example>",
      sent_at: sentAt,
    });
    expect(await testEnv.MAIL_OBJECTS.get(
      "delivery-receipts/replay-receipt.json",
    )).toBeNull();
  });

  it("retries the checkpoint receipt after a transient D1 failure", async () => {
    await insertSendingMessage("checkpoint-retry", "checkpoint-retry-owner");
    await putReceipt(
      "checkpoint-retry",
      new Date(Date.now() - 1_000).toISOString(),
      false,
    );
    const unavailableDb = {
      prepare: () => {
        throw new Error("D1 unavailable");
      },
    } as unknown as D1Database;
    const unavailableEnv = {
      ...testEnv,
      DB: unavailableDb,
    } as MailEnv;

    await expect(replayDeliveryReceipts(unavailableEnv)).resolves.toEqual({
      replayed: 0,
      pending: 1,
      invalid: 0,
    });
    await expect(replayDeliveryReceipts(testEnv)).resolves.toEqual({
      replayed: 1,
      pending: 0,
      invalid: 0,
    });
    expect(await testEnv.MAIL_OBJECTS.get(
      "delivery-receipts/checkpoint-retry.json",
    )).toBeNull();
  });

  it("removes malformed private receipt objects", async () => {
    await testEnv.MAIL_OBJECTS.put(
      "delivery-receipts/invalid.json",
      "{\"providerMessageId\":true}",
    );
    await expect(replayDeliveryReceipts(testEnv)).resolves.toEqual({
      replayed: 0,
      pending: 0,
      invalid: 1,
    });
    expect(await testEnv.MAIL_OBJECTS.get(
      "delivery-receipts/invalid.json",
    )).toBeNull();
  });

  it("inspects at most the limit and rotates past future receipts", async () => {
    const future = new Date(Date.now() + 60 * 60_000).toISOString();
    await Promise.all(Array.from({ length: 50 }, (_, index) => (
      putReceipt(`a-future-${String(index).padStart(2, "0")}`, future)
    )));

    let getCount = 0;
    const bucket = testEnv.MAIL_OBJECTS;
    const countingBucket = {
      head: (...args: Parameters<R2Bucket["head"]>) => bucket.head(...args),
      list: (...args: Parameters<R2Bucket["list"]>) => bucket.list(...args),
      get: (...args: Parameters<R2Bucket["get"]>) => {
        getCount += 1;
        return bucket.get(...args);
      },
      put: (...args: Parameters<R2Bucket["put"]>) => bucket.put(...args),
      delete: (...args: Parameters<R2Bucket["delete"]>) => bucket.delete(...args),
    } as R2Bucket;
    const countingEnv = Object.assign(Object.create(testEnv), {
      MAIL_OBJECTS: countingBucket,
    }) as MailEnv;

    await expect(replayDeliveryReceipts(countingEnv, 50)).resolves.toEqual({
      replayed: 0,
      pending: 50,
      invalid: 0,
    });
    expect(getCount).toBe(50);

    await insertSendingMessage("z-due", "receipt-due-owner");
    await putReceipt("z-due", new Date(Date.now() - 1_000).toISOString());
    getCount = 0;
    await expect(replayDeliveryReceipts(countingEnv, 50)).resolves.toEqual({
      replayed: 1,
      pending: 49,
      invalid: 0,
    });
    expect(getCount).toBe(50);
    expect(await bucket.get("delivery-receipts/z-due.json")).toBeNull();
  });

  it("counts objects that disappear before GET against the inspection limit", async () => {
    let getCount = 0;
    const objects = Array.from({ length: 60 }, (_, index) => ({
      key: `delivery-receipts/missing-${index}.json`,
      size: 1,
    }));
    const missingBucket = {
      head: async () => null,
      list: async () => ({
        objects,
        delimitedPrefixes: [],
        truncated: false,
      }),
      get: async () => {
        getCount += 1;
        return null;
      },
      put: async () => null,
      delete: async () => undefined,
    } as unknown as R2Bucket;
    const missingEnv = Object.assign(Object.create(testEnv), {
      MAIL_OBJECTS: missingBucket,
    }) as MailEnv;

    await expect(replayDeliveryReceipts(missingEnv, 50)).resolves.toEqual({
      replayed: 0,
      pending: 0,
      invalid: 0,
    });
    expect(getCount).toBe(50);
  });
});
