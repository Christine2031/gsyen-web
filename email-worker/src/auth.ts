import { ApiError } from "./http";
import type { AuthUser, MailEnv } from "./types";
import { resolveMailRequestId } from "./messageApiDiagnostics";

type SupabaseUser = {
  id?: unknown;
  email?: unknown;
  email_confirmed_at?: unknown;
  app_metadata?: unknown;
  user_metadata?: unknown;
};

type AuthFailureContext = {
  stage: string;
  upstreamStatus?: number;
};

const authFailureByRequest = new WeakMap<Request, AuthFailureContext>();

export async function requireUser(
  request: Request,
  env: MailEnv,
): Promise<AuthUser> {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ") || authorization.length > 8_192) {
    logAuthFailure(request, "auth_missing_or_oversized_bearer");
    throw new ApiError(401, "unauthorized", "A valid login is required");
  }
  const response = await fetch(`${env.AUTH_API_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: authorization,
    },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    logAuthFailure(request, "auth_supabase_user_rejected", response.status);
    throw new ApiError(401, "unauthorized", "Login has expired or is invalid");
  }
  const data = await response.json<SupabaseUser>();
  if (typeof data.id !== "string" || typeof data.email !== "string") {
    logAuthFailure(request, "auth_identity_invalid");
    throw new ApiError(401, "unauthorized", "Identity response is invalid");
  }
  if (typeof data.email_confirmed_at !== "string") {
    logAuthFailure(request, "auth_email_unverified");
    throw new ApiError(403, "email_unverified", "Verify your account email before creating a mailbox");
  }
  const metadata =
    data.app_metadata && typeof data.app_metadata === "object"
      ? data.app_metadata as Record<string, unknown>
      : {};
  const userMetadata =
    data.user_metadata && typeof data.user_metadata === "object"
      ? data.user_metadata as Record<string, unknown>
      : {};
  return {
    id: data.id,
    email: data.email.toLowerCase(),
    isAdmin: metadata.mail_admin === true,
    userMetadata,
  };
}

function logAuthFailure(
  request: Request,
  stage: string,
  upstreamStatus?: number,
): void {
  const path = new URL(request.url).pathname;
  if (!path.startsWith("/v1/")) return;
  const context = { stage, ...(upstreamStatus ? { upstreamStatus } : {}) };
  authFailureByRequest.set(request, context);
  console.warn(JSON.stringify({
    event: "mail_auth_failed",
    requestId: resolveMailRequestId(request),
    path,
    stage,
    ...(upstreamStatus ? { upstreamStatus } : {}),
  }));
}

export function consumeAuthFailure(request: Request): AuthFailureContext | undefined {
  const value = authFailureByRequest.get(request);
  if (!value) return undefined;
  authFailureByRequest.delete(request);
  return value;
}


export function requireInternalService(request: Request, env: MailEnv): void {
  const headerKey = "x-mail-internal-token";
  const token = request.headers.get(headerKey);
  if (!env.MAIL_WORKER_INTERNAL_TOKEN) {
    throw new ApiError(500, "internal_token_missing", "Internal service token is not configured");
  }
  if (!token || !constantTimeEqual(token, env.MAIL_WORKER_INTERNAL_TOKEN)) {
    throw new ApiError(401, "internal_unauthorized", "Invalid internal service token");
  }
}

function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const maxLength = Math.max(leftBytes.length, rightBytes.length);
  let diff = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < maxLength; index += 1) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return diff === 0;
}

export function requireAdmin(user: AuthUser): void {
  if (!user.isAdmin) {
    throw new ApiError(403, "forbidden", "Mail administrator access is required");
  }
}
