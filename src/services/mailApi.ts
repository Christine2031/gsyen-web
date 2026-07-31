import { getChatAccessToken } from '../auth/chatAccessToken';
import type {
  EmailItem, MailCategory, MailDeliveryStatus, MailDirection,
} from '../types/mail';

const DEFAULT_MAIL_API_URL = 'https://mail-api.gsyen.com';
const REQUEST_TIMEOUT_MS = 12_000;

export type ApiMailFolder =
  | 'inbox' | 'sent' | 'outbox' | 'starred' | 'snoozed'
  | 'archive' | 'drafts' | 'spam' | 'trash' | 'all';

export interface MailApiMessage {
  id: string;
  direction: MailDirection;
  folder: 'inbox' | 'sent' | 'outbox';
  fromAddress: string;
  envelopeFrom: string | null;
  to: string[];
  cc: string[];
  subject: string;
  text: string;
  internetMessageId: string | null;
  providerMessageId: string | null;
  inReplyTo: string | null;
  references: string[];
  status: MailDeliveryStatus;
  errorCode: string | null;
  createdAt: string;
  receivedAt: string | null;
  sentAt: string | null;
  isRead: boolean;
  isStarred: boolean;
  isImportant: boolean;
  archivedAt: string | null;
  snoozedUntil: string | null;
  spamAt: string | null;
  trashedAt: string | null;
  attachmentCount: number;
  category: MailCategory;
}

export interface MailMessagePatch {
  isRead?: boolean;
  isStarred?: boolean;
  isImportant?: boolean;
  archived?: boolean;
  snoozedUntil?: string | null;
  spam?: boolean;
  trashed?: boolean;
}

export class MailPatchQueue {
  private readonly queues = new Map<string, Promise<void>>();

  clear() {
    this.queues.clear();
  }

  run(
    ids: string[],
    patch: MailMessagePatch,
    isCurrent: () => boolean = () => true,
  ): Promise<void> {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return Promise.resolve();
    const previous = uniqueIds.map(id => this.queues.get(id)).filter(Boolean);
    const request = Promise.allSettled(previous).then(async () => {
      if (!isCurrent()) return;
      if (uniqueIds.length === 1) await patchMailMessage(uniqueIds[0], patch);
      else await patchMailMessages(uniqueIds, patch);
    });
    uniqueIds.forEach(id => this.queues.set(id, request));
    void request.finally(() => uniqueIds.forEach(id => {
      if (this.queues.get(id) === request) this.queues.delete(id);
    })).catch(() => {});
    return request;
  }
}

export interface MailSendInput {
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  inReplyTo?: string;
  references?: string[];
  category?: MailCategory;
  idempotencyKey?: string;
}

export type MailSendResult = {
  messageId: string;
  status: 'queued' | 'sending' | 'sent' | 'failed';
  duplicate: boolean;
};

const folderPatchKeys: (keyof MailMessagePatch)[] = [
  'archived', 'snoozedUntil', 'spam', 'trashed',
];

export function restoreMailPatch(
  item: EmailItem,
  patch: MailMessagePatch,
): MailMessagePatch {
  const restored: MailMessagePatch = {};
  if ('isRead' in patch) restored.isRead = item.read;
  if ('isStarred' in patch) restored.isStarred = item.starred;
  if ('isImportant' in patch) restored.isImportant = item.important;
  if (folderPatchKeys.some(key => key in patch)) Object.assign(restored, {
    archived: Boolean(item.archivedAt),
    snoozedUntil: item.snoozedAt ?? null,
    spam: Boolean(item.spamAt),
    trashed: Boolean(item.trashedAt),
  });
  return restored;
}

export function restoreLocalMailItem(
  current: EmailItem,
  original: EmailItem,
  patch: MailMessagePatch,
): EmailItem {
  const restored = { ...current };
  if ('isRead' in patch) restored.read = original.read;
  if ('isStarred' in patch) restored.starred = original.starred;
  if ('isImportant' in patch) restored.important = original.important;
  if (folderPatchKeys.some(key => key in patch)) {
    restored.folder = original.folder;
    restored.snoozedUntil = original.snoozedUntil;
    restored.snoozedAt = original.snoozedAt;
    restored.archivedAt = original.archivedAt;
    restored.spamAt = original.spamAt;
    restored.trashedAt = original.trashedAt;
  }
  return restored;
}

export interface MailboxSummary {
  id: string;
  owner_id: string;
  address: string;
  display_name: string;
  status: 'pending' | 'active' | 'suspended';
}

export class MailApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'MailApiError';
  }
}

function apiBase(): string {
  const configured = import.meta.env.VITE_MAIL_API_URL as string | undefined;
  const raw = (configured?.trim() || DEFAULT_MAIL_API_URL).replace(/\/+$/, '');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new MailApiError(0, 'mail_api_config_invalid', 'Mail API URL is invalid');
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(import.meta.env.DEV && url.protocol === 'http:' && loopback)) {
    throw new MailApiError(0, 'mail_api_config_unsafe', 'Mail API URL must use HTTPS');
  }
  url.hash = '';
  url.search = '';
  return url.toString().replace(/\/+$/, '');
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getChatAccessToken();
  if (!token) throw new MailApiError(401, 'auth_required', 'Login is required');

  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${apiBase()}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });
    const payload = response.status === 204
      ? null
      : await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) {
      throw new MailApiError(
        response.status,
        typeof payload?.error === 'string' ? payload.error : 'mail_api_error',
        typeof payload?.message === 'string' ? payload.message : `Mail API error: ${response.status}`,
      );
    }
    return payload as T;
  } catch (error) {
    if (error instanceof MailApiError) throw error;
    if (controller.signal.aborted) {
      throw new MailApiError(408, 'mail_api_timeout', 'Mail service timed out');
    }
    throw new MailApiError(0, 'mail_api_unavailable', 'Mail service is unavailable');
  } finally {
    window.clearTimeout(timer);
  }
}

export async function getMailbox(): Promise<MailboxSummary | null> {
  try {
    const result = await request<{ mailbox: MailboxSummary | null }>('/v1/mailboxes/me');
    return result.mailbox;
  } catch (error) {
    if (!(error instanceof MailApiError) || error.status !== 401) throw error;
    if (!await getChatAccessToken(true)) throw error;
    const result = await request<{ mailbox: MailboxSummary | null }>('/v1/mailboxes/me');
    return result.mailbox;
  }
}

export async function listMailMessages(
  folder: ApiMailFolder,
  before?: string,
): Promise<{ messages: MailApiMessage[]; nextCursor: string | null }> {
  const params = new URLSearchParams({ folder });
  if (before) params.set('before', before);
  return request(`/v1/messages?${params.toString()}`);
}

export async function getMailMessage(id: string): Promise<MailApiMessage> {
  const result = await request<{ message: MailApiMessage }>(`/v1/messages/${encodeURIComponent(id)}`);
  return result.message;
}

export async function getMailMessageHtml(id: string): Promise<string> {
  const result = await request<{ html: string }>(`/v1/messages/${encodeURIComponent(id)}/html`);
  return result.html;
}
export async function patchMailMessage(
  id: string,
  patch: MailMessagePatch,
): Promise<MailApiMessage> {
  const result = await request<{ message: MailApiMessage }>(
    `/v1/messages/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
  );
  return result.message;
}

export async function patchMailMessages(
  ids: string[],
  patch: MailMessagePatch,
): Promise<{ updated: number }> {
  return request('/v1/messages/batch', {
    method: 'PATCH',
    body: JSON.stringify({ ids, patch }),
  });
}

export async function sendMailMessage(
  input: MailSendInput,
): Promise<MailSendResult> {
  const key = input.idempotencyKey ?? `gsyen:${crypto.randomUUID()}`;
  return request('/v1/messages/send', {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: JSON.stringify({
      to: input.to,
      cc: input.cc ?? [],
      subject: input.subject,
      text: input.text,
      inReplyTo: input.inReplyTo,
      references: input.references,
      category: input.category ?? 'primary',
    }),
  });
}

export function cancelQueuedMessage(messageId: string): Promise<{ cancelled: true }> {
  return request(`/v1/messages/${encodeURIComponent(messageId)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function deleteMailMessage(messageId: string): Promise<{ deleted: true }> {
  return request(`/v1/messages/${encodeURIComponent(messageId)}`, {
    method: 'DELETE',
  });
}
