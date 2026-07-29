import {
  claimOutboundRecord,
  getOutboundStatus,
  markOutboundFailed,
  markOutboundSent,
} from "./repository";
import {
  MailProviderError,
  sendWithResend,
} from "./providers/resend";
import type { MailEnv, OutboundJob } from "./types";

class InvalidStoredMessageError extends Error {
  readonly code = "invalid_stored_message";
}

function parseArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return parsed;
    }
  } catch {
    // Converted below to a permanent stored-message failure.
  }
  throw new InvalidStoredMessageError("Invalid stored recipient data");
}

function errorCode(error: unknown): string {
  if (error instanceof MailProviderError) return error.code;
  if (error instanceof InvalidStoredMessageError) return error.code;
  return "unknown_send_error";
}

async function persistSentState(
  env: MailEnv,
  messageId: string,
  providerMessageId: string,
): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      if (await markOutboundSent(env, messageId, providerMessageId)) return true;
    } catch (error) {
      console.error(JSON.stringify({
        event: "mail_sent_state_update_retry",
        messageId,
        attempt: attempt + 1,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }
  try {
    await env.MAIL_OBJECTS.put(
      `delivery-receipts/${messageId}.json`,
      JSON.stringify({ messageId, providerMessageId, sentAt: new Date().toISOString() }),
      {
        httpMetadata: { contentType: "application/json; charset=utf-8" },
        customMetadata: { reconciliation: "required" },
      },
    );
  } catch (error) {
    console.error(JSON.stringify({
      event: "mail_delivery_receipt_fallback_failed",
      messageId,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
  return false;
}

export async function consumeOutbound(
  batch: MessageBatch<OutboundJob>,
  env: MailEnv,
): Promise<void> {
  for (const queueMessage of batch.messages) {
    const messageId = queueMessage.body.messageId;
    try {
      const record = await claimOutboundRecord(env, messageId);
      if (!record) {
        const status = await getOutboundStatus(env, messageId);
        if (status === "sending") queueMessage.retry({ delaySeconds: 600 });
        else queueMessage.ack();
        continue;
      }
      if (record.mailbox_status !== "active") {
        await markOutboundFailed(env, record.id, "mailbox_inactive");
        queueMessage.ack();
        continue;
      }
      const references = parseArray(record.references_json);
      const headers: Record<string, string> = {
        "X-GSYEN-Message-ID": record.id,
      };
      if (record.in_reply_to) headers["In-Reply-To"] = record.in_reply_to;
      if (references.length > 0) headers.References = references.join(" ");
      const result = await sendWithResend(env, {
        id: record.id,
        to: parseArray(record.to_json),
        cc: parseArray(record.cc_json),
        fromAddress: record.from_address,
        displayName: record.display_name,
        replyTo: record.from_address,
        subject: record.subject,
        text: record.text_body,
        headers,
      });
      const persisted = await persistSentState(env, record.id, result.messageId);
      if (!persisted) {
        console.error(JSON.stringify({
          event: "mail_sent_state_update_failed",
          messageId: record.id,
          providerMessageId: result.messageId,
        }));
      }
      queueMessage.ack();
    } catch (error) {
      const code = errorCode(error);
      try {
        await markOutboundFailed(env, messageId, code);
      } catch (stateError) {
        console.error(JSON.stringify({
          event: "mail_failed_state_update_failed",
          messageId,
          error: stateError instanceof Error ? stateError.message : String(stateError),
        }));
      }
      console.error(JSON.stringify({
        event: "mail_send_failed",
        messageId,
        code,
      }));
      if (error instanceof InvalidStoredMessageError
        || (error instanceof MailProviderError && error.permanent)) {
        queueMessage.ack();
      } else if (error instanceof MailProviderError && error.retryAfterSeconds) {
        queueMessage.retry({ delaySeconds: error.retryAfterSeconds });
      } else {
        queueMessage.retry();
      }
    }
  }
}
