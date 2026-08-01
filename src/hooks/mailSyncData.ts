import {
  listMailMessageChanges, listMailMessages,
  type MailApiMessage, type MailApiMessageChange,
} from '../services/mailApi';
import {
  mailApiToEmailItem, mailItemFolder, mailMessageTime,
  mailThreadMessage, type EmailItem, type MailFolder,
} from '../types/mail';
import { MAIL_SYNC_CACHE_LIMIT } from './mailSyncCache';

const PAGE_SIZE = 50;
const MAX_BASELINE_PAGES = Math.ceil(MAIL_SYNC_CACHE_LIMIT / PAGE_SIZE);
const MAX_CHANGE_PAGES = 10;

function parsedTime(value: string | undefined): number {
  return Date.parse(value ?? '') || 0;
}

const messageTime = (message: MailApiMessage) => parsedTime(mailMessageTime(message));


export type MailSyncBaseline = { messages: MailApiMessage[]; syncCursor: number };
export type MailSyncChanges = { changes: MailApiMessageChange[]; syncCursor: number };

export function compactMailSyncMessages(messages: MailApiMessage[]): MailApiMessage[] {
  const unique = new Map<string, MailApiMessage>();
  messages.forEach(message => unique.set(message.id, message));
  return [...unique.values()]
    .sort((a, b) => messageTime(b) - messageTime(a))
    .slice(0, MAIL_SYNC_CACHE_LIMIT);
}

export function mapMailMessages(messages: MailApiMessage[], lang: 'zh' | 'en'): EmailItem[] {
  const unique = [...new Map(messages.map(message => [message.id, message])).values()];
  const byInternetId = new Map(unique.flatMap(message => (message.internetMessageId
    ? [[message.internetMessageId, message.id]] : [])));
  const parent = new Map(unique.map(message => [message.id, message.id]));
  const find = (id: string): string => {
    const ancestor = parent.get(id) ?? id;
    if (ancestor === id) return id;
    const root = find(ancestor);
    parent.set(id, root);
    return root;
  };
  unique.forEach(message => {
    const related = [message.inReplyTo, ...message.references].find(
      reference => reference && byInternetId.has(reference));
    const otherId = related ? byInternetId.get(related) : null;
    if (otherId && find(message.id) !== find(otherId)) parent.set(find(message.id), find(otherId));
  });
  const groups = new Map<string, MailApiMessage[]>();
  unique.forEach(message => {
    const rootId = find(message.id);
    const group = groups.get(rootId);
    if (group) group.push(message); else groups.set(rootId, [message]);
  });
  const items = [...groups.entries()].map(([rootId, thread]) => {
    const ordered = thread.sort((a, b) => messageTime(a) - messageTime(b));
    const latest = ordered.at(-1)!;
    const folders = ordered.map(mailItemFolder);
    const folder: MailFolder = folders.every(value => value === 'trash') ? 'trash'
      : folders.includes('inbox') ? 'inbox'
        : folders.includes('snoozed') ? 'snoozed'
          : folders.includes('spam') ? 'spam'
            : folders.includes('drafts') ? 'drafts' : 'sent';
    return {
      ...mailApiToEmailItem(latest, lang), id: rootId,
      messageIds: ordered.map(message => message.id), folder,
      read: ordered.every(message => message.isRead),
      starred: ordered.some(message => message.isStarred),
      important: ordered.some(message => message.isImportant),
      threadMessages: ordered.map(mailThreadMessage),
    };
  });
  return items.sort((a, b) => parsedTime(b.createdAt) - parsedTime(a.createdAt));
}

export async function loadMailSyncBaseline(): Promise<MailSyncBaseline> {
  const messages: MailApiMessage[] = [];
  let before: string | undefined;
  let syncCursor = 0;
  for (let page = 0; page < MAX_BASELINE_PAGES; page += 1) {
    const result = await listMailMessages('all', before);
    if (page === 0) syncCursor = result.syncCursor ?? 0;
    messages.push(...result.messages);
    if (!result.nextCursor || result.nextCursor === before) break;
    before = result.nextCursor;
  }
  return { messages: compactMailSyncMessages(messages), syncCursor };
}

export async function loadMailSyncChanges(after: number): Promise<MailSyncChanges> {
  const changes: MailApiMessageChange[] = [];
  let cursor = after;
  for (let page = 0; page < MAX_CHANGE_PAGES; page += 1) {
    const result = await listMailMessageChanges(cursor);
    changes.push(...result.changes);
    if (result.nextCursor === null) return { changes, syncCursor: result.changes.at(-1)?.cursor ?? cursor };
    cursor = result.nextCursor;
  }
  return { changes, syncCursor: cursor };
}

export function applyMailSyncChanges(messages: MailApiMessage[], changes: MailApiMessageChange[]): MailApiMessage[] {
  const next = new Map(messages.map(message => [message.id, message]));
  changes.forEach(change => {
    if (change.operation === 'delete' || !change.message) next.delete(change.messageId);
    else next.set(change.message.id, change.message);
  });
  return compactMailSyncMessages([...next.values()]);
}