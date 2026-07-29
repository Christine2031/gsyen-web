const MAX_MESSAGES = 80;
const MAX_EVENTS = 500;
const MAX_ATTACHMENTS_PER_MESSAGE = 8;
const MAX_TOTAL_ATTACHMENTS = 80;
const MAX_TOTAL_IMAGE_CHARS = 16 * 1024 * 1024;
const MAX_TOTAL_TEXT_CHARS = 500_000;
const MAX_EVENTS_JSON_CHARS = 500_000;
const MAX_ATTACHMENT_ID_CHARS = 128;
const MAX_ATTACHMENT_NAME_CHARS = 512;
const MAX_MIME_TYPE_CHARS = 128;

const MESSAGE_ROLES = new Set(['user', 'model', 'assistant']);
const DOMAINS = new Set(['CHRONOS', 'LEDGER', 'PAYMENT', 'MAIL', 'VAULT', 'CANVAS', 'ORDER']);

export type ChatRequestValidation =
  | { ok: true }
  | {
      ok: false;
      status: 400 | 413;
      code: 'INVALID_CHAT_REQUEST' | 'CHAT_REQUEST_TOO_LARGE';
      message: string;
    };

function invalid(message: string): ChatRequestValidation {
  return { ok: false, status: 400, code: 'INVALID_CHAT_REQUEST', message };
}

function tooLarge(message: string): ChatRequestValidation {
  return { ok: false, status: 413, code: 'CHAT_REQUEST_TOO_LARGE', message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function validateChatRequestBody(body: unknown): ChatRequestValidation {
  if (!isRecord(body)) return invalid('Chat request body must be an object.');

  const { messages } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return invalid('Missing or invalid messages array.');
  }
  if (messages.length > MAX_MESSAGES) {
    return tooLarge(`Chat history exceeds ${MAX_MESSAGES} messages.`);
  }

  let totalTextChars = 0;
  let totalAttachments = 0;
  let totalImageChars = 0;

  for (const message of messages) {
    if (!isRecord(message) || typeof message.role !== 'string' || !MESSAGE_ROLES.has(message.role)) {
      return invalid('Every message must have a supported role.');
    }

    for (const field of ['content', 'documentContext'] as const) {
      const value = message[field];
      if (value !== undefined && typeof value !== 'string') {
        return invalid(`Message ${field} must be a string.`);
      }
      totalTextChars += typeof value === 'string' ? value.length : 0;
      if (totalTextChars > MAX_TOTAL_TEXT_CHARS) {
        return tooLarge('Chat text and document context are too large.');
      }
    }

    const attachments = message.attachments;
    if (attachments === undefined) continue;
    if (!Array.isArray(attachments)) return invalid('Message attachments must be an array.');
    if (attachments.length > MAX_ATTACHMENTS_PER_MESSAGE) {
      return tooLarge(`A message may contain at most ${MAX_ATTACHMENTS_PER_MESSAGE} attachments.`);
    }

    totalAttachments += attachments.length;
    if (totalAttachments > MAX_TOTAL_ATTACHMENTS) {
      return tooLarge('Chat history contains too many attachments.');
    }

    for (const attachment of attachments) {
      if (!isRecord(attachment) || (attachment.type !== 'image' && attachment.type !== 'document')) {
        return invalid('Every attachment must be an image or document.');
      }
      for (const [field, limit] of [
        ['id', MAX_ATTACHMENT_ID_CHARS],
        ['name', MAX_ATTACHMENT_NAME_CHARS],
        ['mimeType', MAX_MIME_TYPE_CHARS],
      ] as const) {
        const value = attachment[field];
        if (value !== undefined && typeof value !== 'string') {
          return invalid(`Attachment ${field} must be a string.`);
        }
        if (typeof value === 'string' && value.length > limit) {
          return tooLarge(`Attachment ${field} exceeds ${limit} characters.`);
        }
        totalTextChars += typeof value === 'string' ? value.length : 0;
        if (totalTextChars > MAX_TOTAL_TEXT_CHARS) {
          return tooLarge('Chat text and attachment metadata are too large.');
        }
      }
      if (attachment.type !== 'image') continue;
      if (
        typeof attachment.dataUrl !== 'string'
        || !/^data:image\/[a-z0-9.+-]+;base64,/i.test(attachment.dataUrl)
      ) {
        return invalid('Image attachments must use a base64 image data URL.');
      }
      totalImageChars += attachment.dataUrl.length;
      if (totalImageChars > MAX_TOTAL_IMAGE_CHARS) {
        return tooLarge('Image attachments are too large.');
      }
    }
  }

  if (body.model !== undefined && (typeof body.model !== 'string' || body.model.length > 64)) {
    return invalid('Model must be a short string.');
  }
  if (body.clientDate !== undefined && (
    typeof body.clientDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.clientDate)
  )) {
    return invalid('Client date must use YYYY-MM-DD.');
  }
  if (body.scheduleIntent !== undefined && body.scheduleIntent !== null && (
    typeof body.scheduleIntent !== 'string' || body.scheduleIntent.length > 128
  )) {
    return invalid('Schedule intent must be a short string.');
  }
  if (body.domain !== undefined && body.domain !== null && (
    typeof body.domain !== 'string' || !DOMAINS.has(body.domain)
  )) {
    return invalid('Unknown chat domain.');
  }
  if (body.chatGptModel !== undefined && body.chatGptModel !== null && (
    typeof body.chatGptModel !== 'string' || body.chatGptModel.length > 64
  )) {
    return invalid('ChatGPT model must be a short string.');
  }

  const events = body.events ?? [];
  if (!Array.isArray(events)) return invalid('Events must be an array.');
  if (events.length > MAX_EVENTS || JSON.stringify(events).length > MAX_EVENTS_JSON_CHARS) {
    return tooLarge('Calendar context is too large.');
  }

  return { ok: true };
}
