// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearMailSyncSnapshot, compactMailSyncEmails, isPermanentMailSyncError,
  MAIL_SYNC_CACHE_LIMIT, readMailSyncSnapshot, writeMailSyncSnapshot,
} from './mailSyncCache';
import type { MailApiMessage } from '../services/mailApi';
import type { EmailItem } from '../types/mail';

const message: EmailItem = {
  id: 'm1',
  senderName: 'Ethan',
  senderAddress: 'ethan@gsyen.com',
  subject: 'hello',
  snippet: 'hello',
  body: 'hello',
  date: '07-31',
  time: '03:47',
  starred: false,
  important: false,
  read: false,
  folder: 'inbox',
  category: 'primary',
  threadMessages: [],
};

function apiMessage(id: string, createdAt: string): MailApiMessage {
  return {
    id, direction: 'inbound', folder: 'inbox', fromAddress: 'sender@example.com',
    envelopeFrom: null, to: ['ethan7586@gsyen.com'], cc: [], subject: id,
    text: id, internetMessageId: `<${id}@example.com>`, providerMessageId: null,
    inReplyTo: null, references: [], status: 'received', errorCode: null,
    createdAt, receivedAt: null, sentAt: null, isRead: false, isStarred: false,
    isImportant: false, archivedAt: null, snoozedUntil: null, spamAt: null,
    trashedAt: null, attachmentCount: 0, category: 'primary',
  };
}

describe('mail sync cache', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => { store.clear(); },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('stores a user-scoped mailbox snapshot for instant hydration', () => {
    writeMailSyncSnapshot('u1', 'zh', {
      emails: [message],
      mailboxAddress: 'ethan7586@gsyen.com',
    });

    expect(readMailSyncSnapshot('u1', 'zh')?.emails).toHaveLength(1);
    expect(readMailSyncSnapshot('u2', 'zh')).toBeNull();
    expect([...store.keys()]).toContain('gsyen_mail_snapshot_v3_u1_zh');
    expect(JSON.parse(store.get('gsyen_mail_snapshot_v3_u1_zh') ?? '{}').schemaVersion).toBe(3);
  });

  it.each([undefined, 2, '3'])('rejects an invalid cache schema: %s', schemaVersion => {
    const snapshot: Record<string, unknown> = {
      emails: [message],
      mailboxAddress: 'ethan7586@gsyen.com',
      savedAt: '2026-08-02T00:00:00.000Z',
    };
    if (schemaVersion !== undefined) snapshot.schemaVersion = schemaVersion;
    store.set('gsyen_mail_snapshot_v3_u1_zh', JSON.stringify(snapshot));

    expect(readMailSyncSnapshot('u1', 'zh')).toBeNull();
  });

  it('ignores and removes the legacy v2 cache key', () => {
    store.set('gsyen_mail_snapshot_v2_u1_zh', JSON.stringify({
      schemaVersion: 3,
      emails: [message],
      mailboxAddress: 'ethan7586@gsyen.com',
      savedAt: '2026-08-02T00:00:00.000Z',
    }));

    expect(readMailSyncSnapshot('u1', 'zh')).toBeNull();
    expect(store.has('gsyen_mail_snapshot_v2_u1_zh')).toBe(false);
  });

  it('orders raw cached messages after valid timestamps', () => {
    store.set('gsyen_mail_snapshot_v3_u1_zh', JSON.stringify({
      schemaVersion: 3,
      messages: [
        apiMessage('malformed', 'not-a-date'),
        apiMessage('valid', '2026-08-02T10:00:00.000Z'),
      ],
      mailboxAddress: 'ethan7586@gsyen.com',
      savedAt: '2026-08-02T10:01:00.000Z',
    }));

    expect(readMailSyncSnapshot('u1', 'zh')?.messages?.map(item => item.id))
      .toEqual(['valid', 'malformed']);
  });

  it('clears only the selected user and language snapshot', () => {
    writeMailSyncSnapshot('u1', 'zh', { emails: [message], mailboxAddress: 'a@gsyen.com' });
    writeMailSyncSnapshot('u1', 'en', { emails: [message], mailboxAddress: 'a@gsyen.com' });

    clearMailSyncSnapshot('u1', 'zh');

    expect(readMailSyncSnapshot('u1', 'zh')).toBeNull();
    expect(readMailSyncSnapshot('u1', 'en')?.emails).toHaveLength(1);
  });


  it('keeps cached mail bounded and newest-first', () => {
    const oversized = Array.from({ length: MAIL_SYNC_CACHE_LIMIT + 20 }, (_, index) => ({
      ...message,
      id: `m${index}`,
      createdAt: new Date(2026, 0, index + 1).toISOString(),
    }));

    const compacted = compactMailSyncEmails(oversized);

    expect(compacted).toHaveLength(MAIL_SYNC_CACHE_LIMIT);
    expect(compacted[0].id).toBe(`m${MAIL_SYNC_CACHE_LIMIT + 19}`);
  });
  it('distinguishes permanent identity errors from temporary sync failures', () => {
    expect(isPermanentMailSyncError({ status: 404, code: 'mailbox_not_found' })).toBe(false);
    expect(isPermanentMailSyncError({ status: 401, code: 'auth_required' })).toBe(false);
    expect(isPermanentMailSyncError({ status: 0, code: 'mail_api_unavailable' })).toBe(false);
    expect(isPermanentMailSyncError(new Error('network'))).toBe(false);
  });
});
