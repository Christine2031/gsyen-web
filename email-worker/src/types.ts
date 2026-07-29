export type MailEnv = Env & {
  RESEND_API_KEY: string;
  SUPABASE_ANON_KEY: string;
};

export type AuthUser = {
  id: string;
  email: string;
  isAdmin: boolean;
};

export type MailboxStatus = "pending" | "active" | "suspended";
export type MailboxAddressRecord = {
  address: string;
  local_part: string;
  mailbox_id: string;
  kind: "primary" | "alias";
  created_at: string;
};

export type MailFolder =
  | "inbox"
  | "sent"
  | "outbox"
  | "starred"
  | "snoozed"
  | "archive"
  | "drafts"
  | "spam"
  | "trash";

export type MailboxRecord = {
  id: string;
  owner_id: string;
  local_part: string;
  address: string;
  display_name: string;
  status: MailboxStatus;
  created_at: string;
  approved_at: string | null;
};

export type MessageSummary = {
  id: string;
  direction: "inbound" | "outbound";
  folder: "inbox" | "sent" | "outbox";
  from_address: string;
  envelope_from_address: string | null;
  is_read: number;
  is_starred: number;
  is_important: number;
  archived_at: string | null;
  snoozed_until: string | null;
  spam_at: string | null;
  trashed_at: string | null;
  attachment_count: number;
  to_json: string;
  cc_json: string;
  subject: string;
  text_body: string;
  in_reply_to: string | null;
  references_json: string;
  status: "received" | "queued" | "sending" | "sent" | "failed";
  error_code: string | null;
  created_at: string;
  received_at: string | null;
  sent_at: string | null;
};

export type OutboundJob = {
  messageId: string;
};

export type SendRequest = {
  to: string[];
  cc: string[];
  subject: string;
  text: string;
  inReplyTo?: string;
  references?: string[];
};

export type AttachmentInput = {
  filename: string;
  mimeType: string;
  disposition: "attachment" | "inline";
  sizeBytes: number;
  content: ArrayBuffer | Uint8Array | string;
};

