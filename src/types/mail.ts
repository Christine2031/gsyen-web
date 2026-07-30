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

export function filterMailItems(
  emails: EmailItem[],
  folder: MailFolder,
  category: MailCategory,
  searchText: string,
  filterFrom: string,
  filterTo: string,
  filterSubject: string,
): EmailItem[] {
  return emails.filter(message => {
    if (folder === 'starred' ? (!message.starred || message.folder === 'trash')
      : folder === 'snoozed' ? message.folder !== 'snoozed'
        : message.folder !== folder) return false;
    if (folder === 'inbox' && message.category !== category) return false;
    const term = searchText.toLowerCase().trim();
    if (term) {
      const from = term.match(/from:(\S+)/)?.[1];
      const subject = term.match(/subject:(\S+)/)?.[1];
      const body = term.match(/body:(\S+)/)?.[1];
      const sender = `${message.senderName} ${message.senderAddress}`.toLowerCase();
      if (from && !sender.includes(from)) return false;
      if (subject && !message.subject.toLowerCase().includes(subject)) return false;
      if (body && !message.body.toLowerCase().includes(body)) return false;
      if (!from && !subject && !body && ![
        message.senderName, message.senderAddress, message.subject, message.body,
      ].some(value => value.toLowerCase().includes(term))) return false;
    }
    const sender = `${message.senderName} ${message.senderAddress}`.toLowerCase();
    if (filterFrom.trim() && !sender.includes(filterFrom.toLowerCase())) return false;
    if (filterTo.trim() && !(message.recipients ?? []).some(address => (
      address.toLowerCase().includes(filterTo.toLowerCase())
    ))) return false;
    return !filterSubject.trim()
      || message.subject.toLowerCase().includes(filterSubject.toLowerCase());
  });
}
