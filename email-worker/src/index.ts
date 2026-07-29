import { errorResponse } from "./http";
import { receiveEmail } from "./inbound";
import { consumeOutbound } from "./outbound";
import { routeRequest } from "./routes";
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
    await consumeOutbound(batch, env);
  },
} satisfies ExportedHandler<MailEnv, OutboundJob>;

