import { consumeAuthFailure, } from "./auth";
import { ApiError, errorResponse } from "./http";
import { resolveMailRequestId } from "./messageApiDiagnostics";
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

function buildAuthHint(request: Request): string | null {
  const path = new URL(request.url).pathname;
  if (!path.startsWith("/v1/")) return null;
  const authorization = request.headers.get("Authorization");
  if (!authorization) return "auth_missing_or_oversized_bearer";
  if (authorization.length > 8_192 || !authorization.startsWith("Bearer ")) {
    return "auth_missing_or_oversized_bearer";
  }
  return null;
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const diagnostic = createApiDiagnostic(request);
    const requestWithDiagnostic = attachDiagnosticRequest(request, diagnostic);
    try {
      if (diagnostic) {
        logApiDiagnostic(diagnostic, "request_received", 200);
      }
      const response = await routeRequest(requestWithDiagnostic, env, ctx);
      logApiDiagnostic(diagnostic, "request_completed", response.status);
      return attachDiagnosticResponse(response, diagnostic, {
        stage: "request_completed",
        request: requestWithDiagnostic,
      });
    } catch (error) {
      const response = errorResponse(request, env, error);
      logApiDiagnostic(diagnostic, "request_failed", response.status, error);
      return attachDiagnosticResponse(response, diagnostic, {
        stage: "request_failed",
        error,
        request: requestWithDiagnostic,
        authHint: buildAuthHint(requestWithDiagnostic),
      });
    }
  },

  async email(message, env): Promise<void> {
    try {
      await receiveEmail(message, env);
    } catch (error) {
      console.error(JSON.stringify({
        event: "mail_receive_failed",
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

type ApiDiagnostic = {
  requestId: string;
  method: string;
  path: string;
  stage?: string;
} | null;

function createApiDiagnostic(request: Request): ApiDiagnostic {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/v1/")) return null;
  const requestId = resolveMailRequestId(request);
  return {
    requestId,
    method: request.method,
    path: url.pathname,
  };
}

function attachDiagnosticRequest(
  request: Request,
  diagnostic: ApiDiagnostic,
): Request {
  if (!diagnostic) return request;
  const headers = new Headers(request.headers);
  headers.set("x-mail-request-id", diagnostic.requestId);
  headers.set("x-request-id", diagnostic.requestId);
  return new Request(request, { headers });
}

function logApiDiagnostic(
  diagnostic: ApiDiagnostic,
  stage: string,
  status: number,
  error?: unknown,
): void {
  if (!diagnostic) return;
  const apiError = error instanceof ApiError ? error : null;
  console.log(JSON.stringify({
    event: "mail_api_request_stage",
    ...diagnostic,
    stage,
    status,
    success: status < 400,
    ...(apiError ? { code: apiError.code } : {}),
  }));
}

function attachDiagnosticResponse(
  response: Response,
  diagnostic: ApiDiagnostic,
  context: {
    stage: string;
    error?: unknown;
    request?: Request;
    authHint?: string | null;
  },
): Response {
  if (!diagnostic) return response;
  const headers = new Headers(response.headers);
  headers.set("x-mail-request-id", diagnostic.requestId);
  headers.set("x-mail-request-path", diagnostic.path);
  headers.set("x-mail-request-stage", context.stage);
  headers.set("x-mail-status", String(response.status));
  if (context.error instanceof ApiError) {
    headers.set("x-mail-error-code", context.error.code);
  }
  const request = context.request;
  if (request) {
    const authFailure = consumeAuthFailure(request);
    const authStage = authFailure?.stage
      ?? (context.authHint && response.status === 401 ? context.authHint : null);
    if (authStage) {
      headers.set("x-mail-auth-stage", authStage);
    }
    if (authFailure?.upstreamStatus) {
      headers.set("x-mail-auth-upstream", String(authFailure.upstreamStatus));
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
