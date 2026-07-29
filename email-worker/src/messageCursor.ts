import { ApiError } from "./http";

export type MessageCursor = {
  createdAt: string;
  id: string;
};

const MESSAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseMessageCursor(value: string | null): MessageCursor | undefined {
  if (!value) return undefined;
  if (value.length > 100) {
    throw new ApiError(400, "invalid_cursor", "Message cursor is invalid");
  }
  const separator = value.lastIndexOf("|");
  const createdAt = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if (separator < 1 || Number.isNaN(Date.parse(createdAt)) || !MESSAGE_ID.test(id)) {
    throw new ApiError(400, "invalid_cursor", "Message cursor is invalid");
  }
  return { createdAt: new Date(createdAt).toISOString(), id };
}

export function serializeMessageCursor(
  message: { created_at: string; id: string } | undefined,
): string | null {
  return message ? `${message.created_at}|${message.id}` : null;
}