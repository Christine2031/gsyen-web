import {
  abortClaimedTrashedOutbound,
  claimOutboundRecord,
  getOutboundStatus,
  markOutboundFailed,
  settleTrashedQueuedOutbound,
} from "./repository";
import {
  getResendInternetMessageId,
  MailProviderError,
  sendWithResend,
} from "./providers/resend";
import { persistProviderDelivery } from "./deliveryReceipts";
import type { MailEnv, OutboundJob } from "./types";

class InvalidStoredMessageError extends Error {
  readonly code = "invalid_stored_message";
}

class DeliveryRecoveryQueueError extends Error {
  readonly code = "delivery_recovery_queue_unavailable";
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
  if (error instanceof DeliveryRecoveryQueueError) return error.code;
  return "unknown_send_error";
}

async function reconcileAcceptedDelivery(
  queueMessage: Message<OutboundJob>,
  env: MailEnv,
): Promise<void> {
  const job = queueMessage.body;
  if (job.kind !== "reconcile") return;
  try {
    const persistence = await persistProviderDelivery(
      env,
      job.messageId,
      job.providerMessageId,
      job.internetMessageId,
      job.sentAt,
    );
    if (persistence.statePersisted || persistence.receiptRecorded) {
      queueMessage.ack();
    } else {
      queueMessage.retry();
    }
  } catch (error) {
    console.error(JSON.stringify({
      event: "mail_delivery_reconciliation_failed",
      messageId: job.messageId,
      error: error instanceof Error ? error.message : String(error),
    }));
    queueMessage.retry();
  }
}

export async function consumeOutbound(
  batch: MessageBatch<OutboundJob>,
  env: MailEnv,
): Promise<void> {
  for (const queueMessage of batch.messages) {
    if (queueMessage.body.kind === "reconcile") {
      await reconcileAcceptedDelivery(queueMessage, env);
      continue;
    }
    const messageId = queueMessage.body.messageId;
    try {
      if (await settleTrashedQueuedOutbound(env, messageId)) {
        queueMessage.ack();
        continue;
      }
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
      if (await abortClaimedTrashedOutbound(env, record.id)) {
        queueMessage.ack();
        continue;
      }
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
      const internetMessageId = await getResendInternetMessageId(
        env,
        result.messageId,
      );
      const sentAt = new Date().toISOString();
      const persistence = await persistProviderDelivery(
        env,
        record.id,
        result.messageId,
        internetMessageId,
        sentAt,
      );
      if (!persistence.statePersisted && !persistence.receiptRecorded) {
        try {
          await env.OUTBOUND_QUEUE.send({
            kind: "reconcile",
            messageId: record.id,
            providerMessageId: result.messageId,
            internetMessageId,
            sentAt,
          }, { delaySeconds: 60 });
        } catch {
          throw new DeliveryRecoveryQueueError(
            "Accepted delivery could not be queued for reconciliation",
          );
        }
        console.warn(JSON.stringify({
          event: "mail_delivery_reconciliation_queued",
          messageId: record.id,
          providerMessageId: result.messageId,
        }));
      }
      if (!persistence.statePersisted && persistence.receiptRecorded) {
        console.warn(JSON.stringify({
          event: "mail_sent_state_deferred_to_receipt",
          messageId: record.id,
          providerMessageId: result.messageId,
        }));
      }
      queueMessage.ack();
    } catch (error) {
      const code = errorCode(error);
      if (!(error instanceof DeliveryRecoveryQueueError)) {
        try {
          await markOutboundFailed(env, messageId, code);
        } catch (stateError) {
          console.error(JSON.stringify({
            event: "mail_failed_state_update_failed",
            messageId,
            error: stateError instanceof Error ? stateError.message : String(stateError),
          }));
        }
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
