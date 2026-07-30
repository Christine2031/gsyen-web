import type { MailApiMessage } from '../services/mailApi';
import { localDateStr } from '../utils/date';

export type MailFolder   = 'inbox' | 'starred' | 'snoozed' | 'sent' | 'drafts' | 'trash' | 'spam';
export type MailCategory = 'primary' | 'social' | 'promotions' | 'updates';
export type MailDirection = 'inbound' | 'outbound';
export type MailDeliveryStatus = 'received' | 'queued' | 'sending' | 'sent' | 'failed';

export interface ThreadMessage {
  id:            string;
  senderName:    string;
  senderAddress: string;
  body:          string;
  date:          string;
  time:          string;
  isMe:          boolean;
}

export interface EmailItem {
  id:             string;
  senderName:     string;
  senderAddress:  string;
  subject:        string;
  snippet:        string;
  body:           string;
  date:           string;
  time:           string;
  starred:        boolean;
  important:      boolean;
  read:           boolean;
  folder:         MailFolder;
  category:       MailCategory;
  snoozedUntil?:  string;
  snoozedAt?:     string;
  threadMessages: ThreadMessage[];
  messageIds?:         string[];
  direction?:          MailDirection;
  recipients?:         string[];
  cc?:                 string[];
  status?:             MailDeliveryStatus;
  internetMessageId?:  string;
  providerMessageId?:  string;
  inReplyTo?:          string;
  references?:         string[];
  attachmentCount?:    number;
  createdAt?:          string;
  archivedAt?:         string;
  spamAt?:             string;
  trashedAt?:          string;
}

function addressParts(raw: string): { name: string; address: string } {
  const match = raw.trim().match(/^(?:"?([^"]*?)"?\s*)?<([^<>\s]+@[^<>\s]+)>$/);
  const address = (match?.[2] ?? raw).trim().toLowerCase();
  const localPart = address.split('@')[0] || address;
  return {
    name: match?.[1]?.trim() || localPart.replace(/[._-]+/g, ' '),
    address,
  };
}

export function mailItemFolder(message: MailApiMessage): MailFolder {
  if (message.trashedAt) return 'trash';
  if (message.spamAt) return 'spam';
  if (message.snoozedUntil && Date.parse(message.snoozedUntil) > Date.now()) return 'snoozed';
  if (message.folder === 'outbox') return 'drafts';
  if (message.archivedAt || message.folder === 'sent') return 'sent';
  return 'inbox';
}

export const mailMessageTime = (message: MailApiMessage) => (
  message.sentAt ?? message.receivedAt ?? message.createdAt
);

export function mailThreadMessage(message: MailApiMessage): ThreadMessage {
  const sender = addressParts(message.fromAddress);
  const timestamp = new Date(mailMessageTime(message));
  return {
    id: message.id,
    senderName: sender.name,
    senderAddress: sender.address,
    body: message.text,
    date: localDateStr(timestamp),
    time: timestamp.toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit', hour12: false,
    }),
    isMe: message.direction === 'outbound',
  };
}

export function mailApiToEmailItem(
  message: MailApiMessage,
  lang: 'zh' | 'en',
): EmailItem {
  const correspondent = message.direction === 'outbound'
    ? addressParts(message.to[0] ?? message.fromAddress)
    : addressParts(message.fromAddress);
  const timestamp = new Date(mailMessageTime(message));
  const body = message.text ?? '';
  return {
    id: message.id,
    senderName: correspondent.name,
    senderAddress: correspondent.address,
    subject: message.subject || (lang === 'zh' ? '（无主题）' : '(No subject)'),
    snippet: body.replace(/\s+/g, ' ').trim().slice(0, 100),
    body,
    date: localDateStr(timestamp),
    time: timestamp.toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit', hour12: false,
    }),
    starred: message.isStarred,
    important: message.isImportant,
    read: message.isRead,
    folder: mailItemFolder(message),
    category: message.category ?? 'primary',
    snoozedUntil: message.snoozedUntil
      ? new Date(message.snoozedUntil).toLocaleString()
      : undefined,
    snoozedAt: message.snoozedUntil ?? undefined,
    threadMessages: [mailThreadMessage(message)],
    direction: message.direction,
    recipients: message.to,
    cc: message.cc,
    status: message.status,
    internetMessageId: message.internetMessageId ?? undefined,
    providerMessageId: message.providerMessageId ?? undefined,
    inReplyTo: message.inReplyTo ?? undefined,
    references: message.references,
    attachmentCount: message.attachmentCount,
    createdAt: message.createdAt,
    archivedAt: message.archivedAt ?? undefined,
    spamAt: message.spamAt ?? undefined,
    trashedAt: message.trashedAt ?? undefined,
  };
}

export type MailSelection =
  | 'all' | 'none' | 'read' | 'unread' | 'starred' | 'unstarred';
export type SnoozePreset = 'today' | 'tomorrow' | 'nextweek' | 'custom';

export const mailMessageIds = (item: EmailItem) => item.messageIds ?? [item.id];

export function resolveSnooze(preset: SnoozePreset, lang: 'zh' | 'en') {
  const now = new Date();
  const until = new Date(now);
  if (preset === 'today') {
    until.setHours(18, 0, 0, 0);
    if (until <= now) until.setTime(now.getTime() + 60 * 60_000);
  } else {
    if (preset === 'tomorrow' || preset === 'custom') until.setDate(until.getDate() + 1);
    if (preset === 'nextweek') {
      until.setDate(until.getDate() + (((8 - until.getDay()) % 7) || 7));
    }
    until.setHours(preset === 'custom' ? 9 : 8, 0, 0, 0);
  }
  const labels: Record<SnoozePreset, string> = {
    today: lang === 'zh' ? '今日稍后，18:00' : 'Later today, 18:00',
    tomorrow: lang === 'zh' ? '次日 08:00' : 'Tomorrow, 08:00',
    nextweek: lang === 'zh' ? '下周初开端 08:00' : 'Next week Monday, 08:00',
    custom: lang === 'zh' ? '自定义周期' : 'Custom time',
  };
  return { until, label: labels[preset] };
}

export function moveMailItem(
  item: EmailItem,
  folder: 'sent' | 'trash' | 'snoozed',
  snooze?: { at: string; label: string },
): EmailItem {
  const next = {
    ...item, folder, archivedAt: undefined, trashedAt: undefined,
    spamAt: undefined, snoozedAt: undefined, snoozedUntil: undefined,
  };
  if (folder === 'sent') next.archivedAt = new Date().toISOString();
  if (folder === 'trash') next.trashedAt = new Date().toISOString();
  if (folder === 'snoozed' && snooze) {
    next.snoozedAt = snooze.at;
    next.snoozedUntil = snooze.label;
  }
  return next;
}

export function selectedMailIds(
  emails: EmailItem[],
  type: MailSelection,
): Record<string, boolean> {
  if (type === 'none') return {};
  const selected = emails.filter(item => (
    type === 'all' || (type === 'read' && item.read) || (type === 'unread' && !item.read)
    || (type === 'starred' && item.starred) || (type === 'unstarred' && !item.starred)
  ));
  return Object.fromEntries(selected.map(item => [item.id, true]));
}

export const mailSearchToken = (key: 'from' | 'subject', value: string) => {
  const normalized = value.trim();
  return normalized ? `${key}:${JSON.stringify(normalized)}` : '';
};

function advancedSearchValue(
  doubleQuoted: string | undefined,
  singleQuoted: string | undefined,
  bare: string | undefined,
): string {
  if (doubleQuoted !== undefined) {
    try { return String(JSON.parse(`"${doubleQuoted}"`)).trim().toLowerCase(); } catch {
      return doubleQuoted.trim().toLowerCase();
    }
  }
  return (singleQuoted ?? bare ?? '').replace(/\\(['\\])/g, '$1').trim().toLowerCase();
}

export function filterMailItems(
  emails: EmailItem[],
  folder: MailFolder,
  category: MailCategory,
  searchText: string,
  filterFrom: string,
  filterTo: string,
  filterSubject: string,
): EmailItem[] {
  const term = searchText.trim().toLowerCase();
  const advanced = new Map<string, string>();
  for (const match of term.matchAll(
    /\b(from|subject|body):\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|(\S+))/g,
  )) {
    const value = advancedSearchValue(match[2], match[3], match[4]);
    if (value) advanced.set(match[1], value);
  }
  const freeText = term.replace(
    /\b(from|subject|body):\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\S+)/g,
    ' ',
  ).replace(/\s+/g, ' ').trim();
  const filterValues = {
    from: filterFrom.trim().toLowerCase(),
    to: filterTo.trim().toLowerCase(),
    subject: filterSubject.trim().toLowerCase(),
  };
  return emails.filter(message => {
    if (folder === 'starred' ? (!message.starred || message.folder === 'trash')
      : folder === 'snoozed' ? message.folder !== 'snoozed'
        : message.folder !== folder) return false;
    if (folder === 'inbox' && message.category !== category) return false;
    if (term) {
      const from = advanced.get('from');
      const subject = advanced.get('subject');
      const body = advanced.get('body');
      const sender = `${message.senderName} ${message.senderAddress}`.toLowerCase();
      if (from && !sender.includes(from)) return false;
      if (subject && !message.subject.toLowerCase().includes(subject)) return false;
      if (body && !message.body.toLowerCase().includes(body)) return false;
      if (freeText && ![
        message.senderName, message.senderAddress, message.subject, message.body,
      ].some(value => value.toLowerCase().includes(freeText))) return false;
    }
    const sender = `${message.senderName} ${message.senderAddress}`.toLowerCase();
    if (filterValues.from && !sender.includes(filterValues.from)) return false;
    if (filterValues.to && !(message.recipients ?? []).some(address => (
      address.toLowerCase().includes(filterValues.to)
    ))) return false;
    return !filterValues.subject
      || message.subject.toLowerCase().includes(filterValues.subject);
  });
}
