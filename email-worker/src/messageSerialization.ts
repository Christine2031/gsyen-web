import type { MessageSummary } from "./types";

function publicInternetMessageId(value: string | null): string | null {
  if (!value || value.length > 998 || /[\r\n]/.test(value)) return null;
  return /^<[^<>\s@]+@[^<>\s@]+>$/.test(value) ? value : null;
}

export function serializeMessage(message: MessageSummary) {
  return {
    id: message.id,
    direction: message.direction,
    folder: message.folder,
    providerMessageId: message.provider_message_id,
    internetMessageId: publicInternetMessageId(message.internet_message_id),
    fromAddress: message.from_address,
    envelopeFrom: message.envelope_from_address,
    to: JSON.parse(message.to_json) as string[],
    cc: JSON.parse(message.cc_json) as string[],
    subject: message.subject,
    text: message.text_body,
    inReplyTo: publicInternetMessageId(message.in_reply_to),
    references: (JSON.parse(message.references_json) as string[])
      .map(publicInternetMessageId)
      .filter((value): value is string => Boolean(value)),
    status: message.status,
    errorCode: message.error_code,
    createdAt: message.created_at,
    receivedAt: message.received_at,
    sentAt: message.sent_at,
    isRead: message.is_read === 1,
    isStarred: message.is_starred === 1,
    isImportant: message.is_important === 1,
    archivedAt: message.archived_at,
    snoozedUntil: message.snoozed_until,
    spamAt: message.spam_at,
    trashedAt: message.trashed_at,
    attachmentCount: message.attachment_count,
    attachmentTotalCount: message.attachment_total_count,
    attachmentExtractionStatus: message.extraction_status,
    attachmentsComplete: message.extraction_status === "complete",
    category: message.category,
  };
}
