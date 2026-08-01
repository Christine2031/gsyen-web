import type { MailApiMessage } from '../services/mailApi';
import type { EmailItem } from '../types/mail';

interface MailSyncSnapshot {
  schemaVersion?: number;
  emails?: EmailItem[];
  messages?: MailApiMessage[];
  mailboxAddress: string;
  savedAt: string;
  lastSyncedAt?: string;
  syncCursor?: number | null;
}

export const MAIL_SYNC_CACHE_LIMIT = 500;
const SCHEMA_VERSION = 3;
const KEY = (uid: string, lang: 'zh' | 'en') => `gsyen_mail_snapshot_v2_${uid}_${lang}`;
const PERMANENT_CODES = new Set<string>();
const pendingWrites = new Map<string, number>();

function isSnapshot(value: unknown): value is MailSyncSnapshot {
  const item = value as Partial<MailSyncSnapshot> | null;
  return (Array.isArray(item?.emails) || Array.isArray(item?.messages))
    && typeof item.mailboxAddress === 'string' && typeof item.savedAt === 'string';
}

function mailTime(item: EmailItem): number { return Date.parse(item.createdAt ?? item.date ?? '') || 0; }

export function compactMailSyncEmails(emails: EmailItem[]): EmailItem[] {
  const unique = new Map<string, EmailItem>();
  emails.forEach(item => unique.set(item.id, item));
  return [...unique.values()].sort((a, b) => mailTime(b) - mailTime(a)).slice(0, MAIL_SYNC_CACHE_LIMIT);
}

function compactMessages(messages: MailApiMessage[]): MailApiMessage[] {
  const unique = new Map<string, MailApiMessage>();
  messages.forEach(message => unique.set(message.id, message));
  return [...unique.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, MAIL_SYNC_CACHE_LIMIT);
}

export function readMailSyncSnapshot(uid: string, lang: 'zh' | 'en'): MailSyncSnapshot | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY(uid, lang)) ?? 'null');
    if (!isSnapshot(parsed)) return null;
    return {
      schemaVersion: SCHEMA_VERSION,
      emails: parsed.emails ? compactMailSyncEmails(parsed.emails) : undefined,
      messages: parsed.messages ? compactMessages(parsed.messages) : undefined,
      mailboxAddress: parsed.mailboxAddress, savedAt: parsed.savedAt,
      lastSyncedAt: parsed.lastSyncedAt ?? parsed.savedAt,
      syncCursor: typeof parsed.syncCursor === 'number' ? parsed.syncCursor : null,
    };
  } catch { return null; }
}

export function writeMailSyncSnapshot(uid: string, lang: 'zh' | 'en', snapshot: Omit<MailSyncSnapshot, 'savedAt' | 'schemaVersion'>) {
  try {
    const now = new Date().toISOString();
    localStorage.setItem(KEY(uid, lang), JSON.stringify({
      ...snapshot, schemaVersion: SCHEMA_VERSION,
      emails: snapshot.emails ? compactMailSyncEmails(snapshot.emails) : undefined,
      messages: snapshot.messages ? compactMessages(snapshot.messages) : undefined,
      savedAt: now, lastSyncedAt: now,
    }));
  } catch {}
}

export function scheduleMailSyncSnapshot(uid: string, lang: 'zh' | 'en', snapshot: Omit<MailSyncSnapshot, 'savedAt' | 'schemaVersion'>) {
  const key = KEY(uid, lang);
  const pending = pendingWrites.get(key);
  if (pending !== undefined) window.clearTimeout(pending);
  pendingWrites.set(key, window.setTimeout(() => {
    pendingWrites.delete(key); writeMailSyncSnapshot(uid, lang, snapshot);
  }, 250));
}

export function clearMailSyncSnapshot(uid: string, lang: 'zh' | 'en') {
  const key = KEY(uid, lang); const pending = pendingWrites.get(key);
  if (pending !== undefined) window.clearTimeout(pending);
  pendingWrites.delete(key); try { localStorage.removeItem(key); } catch {}
}

export function isPermanentMailSyncError(error: unknown): boolean {
  const item = error as { status?: unknown; code?: unknown } | null;
  return PERMANENT_CODES.has(typeof item?.code === 'string' ? item.code : '');
}