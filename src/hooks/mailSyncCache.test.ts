// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearMailSyncSnapshot, compactMailSyncEmails, isPermanentMailSyncError,
  MAIL_SYNC_CACHE_LIMIT, readMailSyncSnapshot, writeMailSyncSnapshot,
} from './mailSyncCache';
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
    expect(isPermanentMailSyncError({ status: 404, code: 'mailbox_not_found' })).toBe(true);
    expect(isPermanentMailSyncError({ status: 0, code: 'mail_api_unavailable' })).toBe(false);
    expect(isPermanentMailSyncError(new Error('network'))).toBe(false);
  });
});
