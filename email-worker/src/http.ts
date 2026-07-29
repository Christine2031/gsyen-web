import type { MailEnv } from "./types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function corsHeaders(request: Request, env: MailEnv): Headers {
  const headers = new Headers({
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Idempotency-Key",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
  });
  const origin = request.headers.get("Origin");
  const allowed = new Set(env.ALLOWED_ORIGINS.split(",").map((item) => item.trim()));
  if (origin && allowed.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
}

export function json(
  request: Request,
  env: MailEnv,
  data: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders(request, env),
  });
}

export function errorResponse(
  request: Request,
  env: MailEnv,
  error: unknown,
): Response {
  if (error instanceof ApiError) {
    return json(request, env, { error: error.code, message: error.message }, error.status);
  }
  console.error(JSON.stringify({
    event: "mail_api_unhandled_error",
    error: error instanceof Error ? error.message : String(error),
    path: new URL(request.url).pathname,
  }));
  return json(
    request,
    env,
    { error: "internal_error", message: "Internal server error" },
    500,
  );
}

export async function readJson<T>(
  request: Request,
  maxBytes = 128_000,
): Promise<T> {
  const length = Number(request.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(length) && length > maxBytes) {
    throw new ApiError(413, "payload_too_large", "Request body is too large");
  }
  const reader = request.body?.getReader();
  if (!reader) {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON");
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel("payload_too_large");
      throw new ApiError(413, "payload_too_large", "Request body is too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON");
  }
}
