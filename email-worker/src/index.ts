import { errorResponse } from "./http";
import { receiveEmail } from "./inbound";
import { consumeOutbound } from "./outbound";
import {
  consumeDeadLetters,
} from "./deadLetters";
import { refreshOperationalIncidents } from "./operations";
import { routeRequest } from "./routes";
import {
  cleanupObjectDeletionJobs,
  requeueStaleOutboundMessages,
  settleTrashedQueuedMessages,
} from "./repository";
import { replayDeliveryReceipts } from "./deliveryReceipts";
import type { MailEnv, OutboundJob } from "./types";

export default {
  async fetch(request, env, ctx): Promise<Response> {
    try {
      return await routeRequest(request, env, ctx);
    } catch (error) {
      return errorResponse(request, env, error);
    }
  },

  async email(message, env): Promise<void> {
    try {
      await receiveEmail(message, env);
    } catch (error) {
      console.error(JSON.stringify({
        event: "mail_receive_failed",
        recipient: message.to,
        error: error instanceof Error ? error.message : String(error),
      }));
      throw error;
    }
  },

  async queue(batch, env): Promise<void> {
    if (batch.queue.includes("outbound-dlq")) {
      await consumeDeadLetters(batch, env);
      return;
    }
    await consumeOutbound(batch, env);
  },

  async scheduled(_controller, env): Promise<void> {
    const results = await Promise.allSettled([
      cleanupObjectDeletionJobs(env),
      replayDeliveryReceipts(env),
      requeueStaleOutboundMessages(env),
      settleTrashedQueuedMessages(env),
      refreshOperationalIncidents(env),
    ]);
    for (const result of results) {
      if (result.status === "rejected") {
        console.error(JSON.stringify({
          event: "mail_scheduled_maintenance_failed",
          error: result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
        }));
      }
    }
  },
} satisfies ExportedHandler<MailEnv, OutboundJob>;
