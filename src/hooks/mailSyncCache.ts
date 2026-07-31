import type { EmailItem } from '../types/mail';

interface MailSyncSnapshot {
  schemaVersion?: number;
  emails: EmailItem[];
  mailboxAddress: string;
  savedAt: string;
  lastSyncedAt?: string;
}

export const MAIL_SYNC_CACHE_LIMIT = 500;
const SCHEMA_VERSION = 2;
const KEY = (uid: string, lang: 'zh' | 'en') => `gsyen_mail_snapshot_v1_${uid}_${lang}`;
const PERMANENT_CODES = new Set<string>();

function isSnapshot(value: unknown): value is MailSyncSnapshot {
  const item = value as Partial<MailSyncSnapshot> | null;
  return Array.isArray(item?.emails)
    && typeof item.mailboxAddress === 'string'
    && typeof item.savedAt === 'string';
}

function mailTime(item: EmailItem): number {
  return Date.parse(item.createdAt ?? item.date ?? '') || 0;
}

export function compactMailSyncEmails(emails: EmailItem[]): EmailItem[] {
  const unique = new Map<string, EmailItem>();
  emails.forEach(item => unique.set(item.id, item));
  return [...unique.values()]
    .sort((a, b) => mailTime(b) - mailTime(a))
    .slice(0, MAIL_SYNC_CACHE_LIMIT);
}

export function readMailSyncSnapshot(uid: string, lang: 'zh' | 'en'): MailSyncSnapshot | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY(uid, lang)) ?? 'null');
    if (!isSnapshot(parsed)) return null;
    return {
      schemaVersion: SCHEMA_VERSION,
      emails: compactMailSyncEmails(parsed.emails),
      mailboxAddress: parsed.mailboxAddress,
      savedAt: parsed.savedAt,
      lastSyncedAt: parsed.lastSyncedAt ?? parsed.savedAt,
    };
  } catch { return null; }
}

export function writeMailSyncSnapshot(
  uid: string,
  lang: 'zh' | 'en',
  snapshot: Omit<MailSyncSnapshot, 'savedAt'>,
) {
  try {
    const now = new Date().toISOString();
    localStorage.setItem(KEY(uid, lang), JSON.stringify({
      ...snapshot,
      schemaVersion: SCHEMA_VERSION,
      emails: compactMailSyncEmails(snapshot.emails),
      savedAt: now,
      lastSyncedAt: now,
    }));
  } catch {}
}

export function clearMailSyncSnapshot(uid: string, lang: 'zh' | 'en') {
  try { localStorage.removeItem(KEY(uid, lang)); } catch {}
}

export function isPermanentMailSyncError(error: unknown): boolean {
  const item = error as { status?: unknown; code?: unknown } | null;
  const code = typeof item?.code === 'string' ? item.code : '';
  return PERMANENT_CODES.has(code);
}

