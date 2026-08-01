// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { MailApiMessage } from '../services/mailApi';
import { compactMailSyncMessages, mapMailMessages } from './mailSyncData';

function message(id: string, createdAt: string, inReplyTo: string | null = null): MailApiMessage {
  return {
    id, direction: 'inbound', folder: 'inbox', fromAddress: 'sender@example.com',
    envelopeFrom: null, to: ['ethan7586@gsyen.com'], cc: [], subject: id,
    text: id, internetMessageId: `<${id}@example.com>`, providerMessageId: null,
    inReplyTo, references: [], status: 'received', errorCode: null,
    createdAt, receivedAt: null, sentAt: null, isRead: false, isStarred: false,
    isImportant: false, archivedAt: null, snoozedUntil: null, spamAt: null,
    trashedAt: null, attachmentCount: 0, category: 'primary',
  };
}

describe('mail sync data ordering', () => {
  it('places malformed timestamps after valid messages', () => {
    const messages = [
      message('malformed', 'not-a-date'),
      message('valid', '2026-08-02T10:00:00.000Z'),
    ];

    expect(compactMailSyncMessages(messages).map(item => item.id)).toEqual(['valid', 'malformed']);
    expect(mapMailMessages(messages, 'zh').map(item => item.id)).toEqual(['valid', 'malformed']);
  });

  it('does not select a malformed reply as the latest thread message', () => {
    const root = message('root', '2026-08-02T10:00:00.000Z');
    const reply = message('reply', 'not-a-date', root.internetMessageId);

    const [thread] = mapMailMessages([root, reply], 'zh');

    expect(thread.subject).toBe('root');
    expect(thread.messageIds).toEqual(['reply', 'root']);
  });
});
