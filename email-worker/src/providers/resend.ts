import type { MailEnv } from "../types";
import { MAX_RFC_MESSAGE_ID_LENGTH } from "../validation";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const MAX_RESPONSE_BYTES = 32_768;
const SEND_TIMEOUT_MS = 15_000;
const LOOKUP_TIMEOUT_MS = 5_000;

export type ResendMessage = {
  id: string;
  fromAddress: string;
  displayName: string;
  to: string[];
  cc: string[];
  subject: string;
  text: string;
  replyTo: string;
  headers: Record<string, string>;
};

export class MailProviderError extends Error {
  constructor(
    readonly code: string,
    readonly permanent: boolean,
    readonly retryAfterSeconds?: number,
  ) {
    super(code);
  }
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function senderValue(address: string, displayName: string): string {
  if (!displayName) return address;
  const escapedName = displayName.replace(/[\\"]/g, "\\$&");
  return `"${escapedName}" <${address}>`;
}

function retryDelay(response: Response): number | undefined {
  const value = response.headers.get("Retry-After");
  if (!value) return undefined;
  const seconds = Number.parseInt(value, 10);
  if (Number.isFinite(seconds)) return Math.min(3_600, Math.max(1, seconds));
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return undefined;
  return Math.min(3_600, Math.max(1, Math.ceil((date - Date.now()) / 1_000)));
}

function safeCode(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 80);
  return normalized ? `resend_${normalized}` : fallback;
}

async function readBoundedJson(response: Response): Promise<Record<string, unknown>> {
  const length = Number(response.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) {
    await response.body?.cancel("response_too_large");
    throw new MailProviderError("resend_response_too_large", false);
  }
  const reader = response.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel("response_too_large");
      throw new MailProviderError("resend_response_too_large", false);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (bytes.byteLength === 0) return {};
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    throw new MailProviderError("resend_invalid_response", false);
  }
}

function isPermanentStatus(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

export async function sendWithResend(
  env: MailEnv,
  message: ResendMessage,
  fetcher: Fetcher = fetch,
): Promise<{ messageId: string }> {
  let response: Response;
  try {
    response = await fetcher(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `gsyen-${message.id}`,
        "User-Agent": "gsyen-mail-worker/0.1",
      },
      body: JSON.stringify({
        from: senderValue(message.fromAddress, message.displayName),
        to: message.to,
        cc: message.cc.length > 0 ? message.cc : undefined,
        reply_to: message.replyTo,
        subject: message.subject,
        text: message.text,
        headers: message.headers,
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch {
    throw new MailProviderError("resend_network_error", false);
  }

  const payload = await readBoundedJson(response);
  if (!response.ok) {
    throw new MailProviderError(
      safeCode(payload.name, `resend_http_${response.status}`),
      isPermanentStatus(response.status),
      retryDelay(response),
    );
  }
  if (typeof payload.id !== "string" || payload.id.length === 0 || payload.id.length > 200) {
    throw new MailProviderError("resend_missing_message_id", false);
  }
  return { messageId: payload.id };
}

export async function getResendInternetMessageId(
  env: MailEnv,
  providerMessageId: string,
  fetcher: Fetcher = fetch,
): Promise<string | null> {
  if (!providerMessageId || providerMessageId.length > 200) return null;
  try {
    const response = await fetcher(
      `${RESEND_ENDPOINT}/${encodeURIComponent(providerMessageId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "User-Agent": "gsyen-mail-worker/0.1",
        },
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      },
    );
    const payload = await readBoundedJson(response);
    const value = payload.message_id;
    if (
      !response.ok
      || typeof value !== "string"
      || value.length > MAX_RFC_MESSAGE_ID_LENGTH
      || /[\r\n]/.test(value)
      || !/^<[^<>\s@]+@[^<>\s@]+>$/.test(value)
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}
