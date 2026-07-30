import { getResendInternetMessageId } from "./providers/resend";
import {
  markOutboundSent,
  reconcileOutboundSent,
} from "./repository";
import type { MailEnv } from "./types";
import { MAX_RFC_MESSAGE_ID_LENGTH } from "./validation";

const RECEIPT_PREFIX = "delivery-receipts/";
const REPLAY_CHECKPOINT_KEY = "reconciliation/delivery-receipt-checkpoint";
const MAX_RECEIPT_BYTES = 8_192;
const MAX_LOOKUP_ATTEMPTS = 12;
type DeliveryReceipt = {
  version: 1;
  messageId: string;
  providerMessageId: string;
  sentAt: string;
  internetMessageId: string | null;
  statePersisted: boolean;
  lookupAttempts: number;
  nextLookupAt: string;
};

export type DeliveryPersistenceResult = {
  statePersisted: boolean;
  receiptRecorded: boolean;
};

function receiptKey(messageId: string): string {
  return `${RECEIPT_PREFIX}${messageId}.json`;
}

function nextLookupAt(attempt: number): string {
  const exponent = Math.min(5, Math.max(0, attempt - 1));
  const delayMs = 15 * 60_000 * (2 ** exponent);
  return new Date(Date.now() + delayMs).toISOString();
}

function validReceipt(value: unknown, key: string): DeliveryReceipt | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Partial<DeliveryReceipt>;
  if (
    item.version !== 1
    || typeof item.messageId !== "string"
    || receiptKey(item.messageId) !== key
    || typeof item.providerMessageId !== "string"
    || item.providerMessageId.length === 0
    || item.providerMessageId.length > 200
    || typeof item.sentAt !== "string"
    || Number.isNaN(Date.parse(item.sentAt))
    || (item.internetMessageId !== null
      && (typeof item.internetMessageId !== "string"
        || item.internetMessageId.length > MAX_RFC_MESSAGE_ID_LENGTH
        || !/^<[^<>\s@]+@[^<>\s@]+>$/.test(item.internetMessageId)))
    || typeof item.statePersisted !== "boolean"
    || typeof item.lookupAttempts !== "number"
    || !Number.isInteger(item.lookupAttempts)
    || item.lookupAttempts < 0
    || typeof item.nextLookupAt !== "string"
    || Number.isNaN(Date.parse(item.nextLookupAt))
  ) {
    return null;
  }
  return item as DeliveryReceipt;
}

async function storeReceipt(env: MailEnv, receipt: DeliveryReceipt): Promise<void> {
  await env.MAIL_OBJECTS.put(receiptKey(receipt.messageId), JSON.stringify(receipt), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
    customMetadata: { reconciliation: "required" },
  });
}

export async function persistProviderDelivery(
  env: MailEnv,
  messageId: string,
  providerMessageId: string,
  internetMessageId: string | null,
  sentAt = new Date().toISOString(),
): Promise<DeliveryPersistenceResult> {
  const receipt: DeliveryReceipt = {
    version: 1,
    messageId,
    providerMessageId,
    sentAt,
    internetMessageId,
    statePersisted: false,
    lookupAttempts: internetMessageId ? 0 : 1,
    nextLookupAt: nextLookupAt(1),
  };
  let stored = false;
  try {
    await storeReceipt(env, receipt);
    stored = true;
  } catch (error) {
    console.error(JSON.stringify({
      event: "mail_delivery_receipt_fallback_failed",
      messageId,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
  let persisted = false;
  for (let attempt = 0; attempt < 3 && !persisted; attempt += 1) {
    try {
      persisted = await markOutboundSent(
        env,
        messageId,
        providerMessageId,
        internetMessageId,
        sentAt,
      );
    } catch (error) {
      console.error(JSON.stringify({
        event: "mail_sent_state_update_retry",
        messageId,
        attempt: attempt + 1,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }
  if (!stored) {
    return { statePersisted: persisted, receiptRecorded: false };
  }
  try {
    if (persisted && internetMessageId) {
      await env.MAIL_OBJECTS.delete(receiptKey(messageId));
    } else if (persisted) {
      await storeReceipt(env, { ...receipt, statePersisted: true });
    }
  } catch (error) {
    console.error(JSON.stringify({
      event: "mail_delivery_receipt_finalize_failed",
      messageId,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
  return { statePersisted: persisted, receiptRecorded: true };
}

async function replayReceipt(
  env: MailEnv,
  receipt: DeliveryReceipt,
): Promise<"replayed" | "pending" | "orphaned"> {
  let current = receipt;
  if (!current.statePersisted) {
    const reconciled = await reconcileOutboundSent(
      env,
      current.messageId,
      current.providerMessageId,
      current.sentAt,
      current.internetMessageId,
    );
    if (!reconciled) return "orphaned";
    current = { ...current, statePersisted: true };
  }
  if (current.internetMessageId) return "replayed";
  if (Date.parse(current.nextLookupAt) > Date.now()) {
    await storeReceipt(env, current);
    return "pending";
  }
  const internetMessageId = await getResendInternetMessageId(
    env,
    current.providerMessageId,
  );
  const lookupAttempts = current.lookupAttempts + 1;
  if (internetMessageId) {
    await reconcileOutboundSent(
      env,
      current.messageId,
      current.providerMessageId,
      current.sentAt,
      internetMessageId,
    );
    return "replayed";
  }
  if (lookupAttempts >= MAX_LOOKUP_ATTEMPTS) return "replayed";
  await storeReceipt(env, {
    ...current,
    lookupAttempts,
    nextLookupAt: nextLookupAt(lookupAttempts),
  });
  return "pending";
}

async function readReplayCheckpoint(env: MailEnv): Promise<string | undefined> {
  try {
    const object = await env.MAIL_OBJECTS.head(REPLAY_CHECKPOINT_KEY);
    const lastKey = object?.customMetadata?.lastKey;
    return lastKey?.startsWith(RECEIPT_PREFIX) ? lastKey : undefined;
  } catch (error) {
    console.error(JSON.stringify({
      event: "mail_delivery_receipt_checkpoint_read_failed",
      error: error instanceof Error ? error.message : String(error),
    }));
    return undefined;
  }
}

async function writeReplayCheckpoint(
  env: MailEnv,
  lastKey: string,
): Promise<void> {
  try {
    await env.MAIL_OBJECTS.put(REPLAY_CHECKPOINT_KEY, "", {
      customMetadata: { lastKey },
    });
  } catch (error) {
    console.error(JSON.stringify({
      event: "mail_delivery_receipt_checkpoint_write_failed",
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

export async function replayDeliveryReceipts(
  env: MailEnv,
  limit = 50,
): Promise<{ replayed: number; pending: number; invalid: number }> {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const checkpoint = await readReplayCheckpoint(env);
  let replayed = 0;
  let pending = 0;
  let invalid = 0;
  let inspected = 0;
  let cursor: string | undefined;
  let startAfter = checkpoint;
  let wrapped = !checkpoint;
  let lastInspected: string | undefined;
  let done = false;
  while (inspected < safeLimit && !done) {
    const listed = await env.MAIL_OBJECTS.list({
      prefix: RECEIPT_PREFIX,
      limit: safeLimit - inspected,
      ...(cursor ? { cursor } : startAfter ? { startAfter } : {}),
    });
    for (const item of listed.objects) {
      if (inspected >= safeLimit) break;
      if (wrapped && checkpoint && item.key > checkpoint) {
        done = true;
        break;
      }
      inspected += 1;
      lastInspected = item.key;
      if (item.size > MAX_RECEIPT_BYTES) {
        await env.MAIL_OBJECTS.delete(item.key);
        invalid += 1;
        continue;
      }
      const object = await env.MAIL_OBJECTS.get(item.key);
      if (!object) continue;
      let receipt: DeliveryReceipt | null = null;
      try {
        receipt = validReceipt(JSON.parse(await object.text()), item.key);
      } catch {
        // Invalid private receipt data is removed below.
      }
      if (!receipt) {
        await env.MAIL_OBJECTS.delete(item.key);
        invalid += 1;
        continue;
      }
      if (
        receipt.statePersisted
        && !receipt.internetMessageId
        && Date.parse(receipt.nextLookupAt) > Date.now()
      ) {
        pending += 1;
        continue;
      }
      try {
        const outcome = await replayReceipt(env, receipt);
        if (outcome === "pending") pending += 1;
        else {
          await env.MAIL_OBJECTS.delete(item.key);
          replayed += 1;
        }
      } catch (error) {
        pending += 1;
        console.error(JSON.stringify({
          event: "mail_delivery_receipt_replay_failed",
          messageId: receipt.messageId,
          error: error instanceof Error ? error.message : String(error),
        }));
      }
    }
    if (done || inspected >= safeLimit) break;
    if (listed.truncated) {
      cursor = listed.cursor;
      startAfter = undefined;
    } else if (!wrapped && checkpoint) {
      wrapped = true;
      cursor = undefined;
      startAfter = undefined;
    } else {
      break;
    }
  }
  if (lastInspected) await writeReplayCheckpoint(env, lastInspected);
  return { replayed, pending, invalid };
}
