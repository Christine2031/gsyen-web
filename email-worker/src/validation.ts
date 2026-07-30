import { ApiError } from "./http";
import type { SendRequest } from "./types";

const RESERVED_LOCAL_PARTS = new Set([
  "abuse",
  "admin",
  "administrator",
  "billing",
  "contact",
  "help",
  "hostmaster",
  "mailer-daemon",
  "noreply",
  "postmaster",
  "privacy",
  "root",
  "security",
  "support",
  "webmaster",
]);

const RESERVED_CANONICAL_LOCAL_PARTS = new Set(
  Array.from(RESERVED_LOCAL_PARTS).map((value) => value.replace(/\./g, "")),
);

const ADDRESS_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const MESSAGE_ID_PATTERN = /^<[^<>\s@]+@[^<>\s@]+>$/;
export const MAX_RFC_MESSAGE_ID_LENGTH = 998;
const MAILBOX_LOCAL_PART_MIN_LENGTH = 3;
const MAILBOX_LOCAL_PART_MAX_LENGTH = 30;

export function normalizeLocalPart(value: unknown): string {
  if (typeof value !== "string") {
    throw new ApiError(400, "invalid_local_part", "Mailbox name is required");
  }
  const localPart = value.trim().toLowerCase();
  const canonicalLocalPart = localPart.replace(/\./g, "");
  if (
    localPart.length < MAILBOX_LOCAL_PART_MIN_LENGTH ||
    localPart.length > MAILBOX_LOCAL_PART_MAX_LENGTH ||
    !/^[a-z0-9](?:[a-z0-9.]*[a-z0-9])$/.test(localPart) ||
    localPart.includes("..") ||
    RESERVED_LOCAL_PARTS.has(localPart) ||
    RESERVED_CANONICAL_LOCAL_PARTS.has(canonicalLocalPart)
  ) {
    throw new ApiError(400, "invalid_local_part", "Mailbox name is unavailable");
  }
  return localPart;
}

export function canonicalizeLocalPart(value: unknown): string {
  const normalized = normalizeLocalPart(value);
  return normalized.replace(/\./g, "");
}

export function normalizeDisplayName(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new ApiError(400, "invalid_display_name", "Display name must be text");
  }
  const name = value.trim();
  if (name.length > 80 || /[\r\n\0]/.test(name)) {
    throw new ApiError(400, "invalid_display_name", "Display name is invalid");
  }
  return name;
}

export function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") {
    throw new ApiError(400, "invalid_recipient", "Recipient must be an email address");
  }
  const address = value.trim().toLowerCase();
  if (address.length > 254 || !ADDRESS_PATTERN.test(address) || /[\r\n\0]/.test(address)) {
    throw new ApiError(400, "invalid_recipient", "Recipient address is invalid");
  }
  return address;
}

function normalizeString(value: unknown, name: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new ApiError(400, `invalid_${name}`, `${name} must be text`);
  }
  const output = value.trim();
  if (!output || output.length > maxLength || /[\0]/.test(output)) {
    throw new ApiError(400, `invalid_${name}`, `${name} is invalid`);
  }
  return output;
}

function normalizeMessageId(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const output = normalizeString(value, name, MAX_RFC_MESSAGE_ID_LENGTH);
  if (/[\r\n]/.test(output) || !MESSAGE_ID_PATTERN.test(output)) {
    throw new ApiError(400, `invalid_${name}`, `${name} must be an RFC Message-ID`);
  }
  return output;
}

export function parseSendRequest(value: unknown): SendRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "invalid_message", "Message body is invalid");
  }
  const input = value as Record<string, unknown>;
  const to = Array.isArray(input.to) ? input.to.map(normalizeEmail) : [];
  const rawCc = Array.isArray(input.cc) ? input.cc.map(normalizeEmail) : [];
  const uniqueTo = [...new Set(to)];
  const cc = [...new Set(rawCc)].filter((address) => !uniqueTo.includes(address));
  const recipients = [...uniqueTo, ...cc];
  if (to.length === 0 || recipients.length > 10) {
    throw new ApiError(400, "invalid_recipients", "Use 1 to 10 unique recipients");
  }
  const references = Array.isArray(input.references)
    ? input.references.map((item) => normalizeMessageId(item, "references")).filter(Boolean)
    : [];
  if (references.length > 100) {
    throw new ApiError(400, "invalid_references", "Use at most 100 References entries");
  }
  const category = input.category === undefined ? "primary" : input.category;
  if (
    typeof category !== "string"
    || (
      category !== "primary"
      && category !== "social"
      && category !== "promotions"
      && category !== "updates"
    )
  ) {
    throw new ApiError(400, "invalid_category", "Message category is invalid");
  }
  return {
    to: uniqueTo,
    cc,
    subject: normalizeString(input.subject, "subject", 200),
    text: normalizeString(input.text, "text", 100_000),
    inReplyTo: normalizeMessageId(input.inReplyTo, "in_reply_to"),
    references: [...new Set(references)] as string[],
    category,
  };
}

export function parseIdempotencyKey(value: string | null): string {
  const key = value?.trim() ?? "";
  if (key.length < 16 || key.length > 80 || !/^[A-Za-z0-9:_-]+$/.test(key)) {
    throw new ApiError(
      400,
      "invalid_idempotency_key",
      "Idempotency-Key must contain 16 to 80 safe characters",
    );
  }
  return key;
}

export function canonicalInboundAddress(
  address: string,
  primaryDomain: string,
  acceptedDomains = primaryDomain,
): string | null {
  const normalized = address.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at < 1) return null;
  const recipientDomain = normalized.slice(at + 1);
  const allowed = new Set(
    `${primaryDomain},${acceptedDomains}`
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  if (!allowed.has(recipientDomain)) return null;

  const rawLocalPart = normalized.slice(0, at).split("+", 1)[0];
  try {
    return `${canonicalizeLocalPart(rawLocalPart)}@${primaryDomain.trim().toLowerCase()}`;
  } catch {
    return null;
  }
}
