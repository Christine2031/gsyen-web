// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { getMailbox, listMailMessages, authState } = vi.hoisted(() => ({
  getMailbox: vi.fn(),
  listMailMessages: vi.fn(),
  authState: { user: { id: 'mail-cache-user', email: 'ethan7586@gsyen.com' }, loading: false },
}));

vi.mock('../auth/useAuth', () => ({ useAuth: () => authState }));
vi.mock('../services/mailApi', () => ({
  MailApiError: class MailApiError extends Error {
    constructor(readonly status: number, readonly code: string, message: string) { super(message); }
  },
  MailPatchQueue: class MailPatchQueue { clear() {} run() { return Promise.resolve(); } },
  getMailbox,
  listMailMessages,
  cancelQueuedMessage: vi.fn(),
  deleteMailMessage: vi.fn(),
  restoreLocalMailItem: vi.fn(),
  restoreMailPatch: vi.fn(),
  sendMailMessage: vi.fn(),
}));

import { __resetMailSyncCacheForTest, useMailSync } from './useMailSync';

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let snapshots: ReturnType<typeof useMailSync>[] = [];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function message(id: string) {
  return {
    id, direction: 'inbound', folder: 'inbox', fromAddress: 'Sender <sender@example.com>',
    envelopeFrom: null, to: ['ethan7586@gsyen.com'], cc: [], subject: 'Cached hello',
    text: 'The cached message body', internetMessageId: `<${id}@example.com>`,
    providerMessageId: null, inReplyTo: null, references: [], status: 'received',
    errorCode: null, createdAt: '2026-07-30T12:00:00.000Z',
    receivedAt: '2026-07-30T12:00:00.000Z', sentAt: null, isRead: false,
    isStarred: false, isImportant: false, archivedAt: null, snoozedUntil: null,
    spamAt: null, trashedAt: null, attachmentCount: 0, category: 'primary',
  } as const;
}

function Harness() {
  const mail = useMailSync('zh');
  snapshots.push(mail);
  return null;
}

function renderHarness() {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(<Harness />));
}

async function flush() {
  await act(async () => { await Promise.resolve(); });
}

afterEach(() => {
  act(() => root?.unmount());
  root = null; host?.remove(); host = null; snapshots = [];
  __resetMailSyncCacheForTest(); getMailbox.mockReset();
  listMailMessages.mockReset(); document.body.replaceChildren();
});

describe('useMailSync cache hydration', () => {
  it('keeps the previous mailbox visible while a same-user refresh is pending', async () => {
    const first = deferred<{ messages: any[]; nextCursor: null }>();
    getMailbox.mockResolvedValue({ id: 'box', address: 'ethan7586@gsyen.com', status: 'active' });
    listMailMessages.mockReturnValueOnce(first.promise);
    renderHarness();
    await flush();

    await act(async () => first.resolve({ messages: [message('cached-1')], nextCursor: null }));
    expect(snapshots.at(-1)?.emails).toHaveLength(1);
    act(() => root?.unmount());
    root = null; host?.remove(); host = null; snapshots = [];

    const second = deferred<{ messages: any[]; nextCursor: null }>();
    listMailMessages.mockReturnValueOnce(second.promise);
    renderHarness();
    expect(snapshots.at(-1)?.emails).toHaveLength(1);
    expect(snapshots.at(-1)?.mailboxAddress).toBe('ethan7586@gsyen.com');
  });
});
