import { ApiError } from "./http";
import type { AuthUser, MailEnv } from "./types";

type SupabaseUser = {
  id?: unknown;
  email?: unknown;
  email_confirmed_at?: unknown;
  app_metadata?: unknown;
};

export async function requireUser(
  request: Request,
  env: MailEnv,
): Promise<AuthUser> {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ") || authorization.length > 8_192) {
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
    throw new ApiError(401, "unauthorized", "Login has expired or is invalid");
  }
  const data = await response.json<SupabaseUser>();
  if (typeof data.id !== "string" || typeof data.email !== "string") {
    throw new ApiError(401, "unauthorized", "Identity response is invalid");
  }
  if (typeof data.email_confirmed_at !== "string") {
    throw new ApiError(403, "email_unverified", "Verify your account email before creating a mailbox");
  }
  const metadata =
    data.app_metadata && typeof data.app_metadata === "object"
      ? data.app_metadata as Record<string, unknown>
      : {};
  return {
    id: data.id,
    email: data.email.toLowerCase(),
    isAdmin: metadata.mail_admin === true,
  };
}

export function requireAdmin(user: AuthUser): void {
  if (!user.isAdmin) {
    throw new ApiError(403, "forbidden", "Mail administrator access is required");
  }
}
