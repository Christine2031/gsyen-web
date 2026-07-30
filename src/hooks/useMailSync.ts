import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { localDateStr } from '../utils/date';
import type { EmailItem, MailFolder, ThreadMessage } from '../types/mail';
import {
  MailApiError, cancelQueuedMessage, deleteMailMessage, getMailbox,
  listMailMessages, sendMailMessage, type ApiMailFolder, type MailApiMessage,
  type MailSendInput,
} from '../services/mailApi';
const MAX_PAGES_PER_FOLDER = 100;
function addressParts(raw: string): { name: string; address: string } {
  const match = raw.trim().match(/^(?:"?([^"]*?)"?\s*)?<([^<>\s]+@[^<>\s]+)>$/);
  const address = (match?.[2] ?? raw).trim().toLowerCase();
  const localPart = address.split('@')[0] || address;
  return {
    name: match?.[1]?.trim() || localPart.replace(/[._-]+/g, ' '),
    address,
  };
}
function itemFolder(message: MailApiMessage): MailFolder {
  if (message.trashedAt) return 'trash';
  if (message.spamAt) return 'spam';
  if (message.snoozedUntil && Date.parse(message.snoozedUntil) > Date.now()) return 'snoozed';
  if (message.folder === 'outbox') return 'drafts';
  if (message.archivedAt || message.folder === 'sent') return 'sent';
  return 'inbox';
}
function messageTime(message: MailApiMessage): string {
  return message.sentAt ?? message.receivedAt ?? message.createdAt;
}
function threadMessage(message: MailApiMessage): ThreadMessage {
  const sender = addressParts(message.fromAddress);
  const timestamp = new Date(messageTime(message));
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
function toEmailItem(message: MailApiMessage, lang: 'zh' | 'en'): EmailItem {
  const correspondent = message.direction === 'outbound'
    ? addressParts(message.to[0] ?? message.fromAddress)
    : addressParts(message.fromAddress);
  const timestamp = new Date(messageTime(message));
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
    folder: itemFolder(message),
    category: message.category ?? 'primary',
    snoozedUntil: message.snoozedUntil
      ? new Date(message.snoozedUntil).toLocaleString()
      : undefined,
    snoozedAt: message.snoozedUntil ?? undefined,
    threadMessages: [threadMessage(message)],
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
export function mapMailMessages(
  messages: MailApiMessage[],
  lang: 'zh' | 'en',
): EmailItem[] {
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
    if (!related) return;
    const otherId = byInternetId.get(related);
    if (otherId && find(message.id) !== find(otherId)) parent.set(find(message.id), find(otherId));
  });
  const groups = new Map<string, MailApiMessage[]>();
  unique.forEach(message => groups.set(find(message.id), [
    ...(groups.get(find(message.id)) ?? []), message]));
  const items = [...groups.entries()].map(([rootId, messages]) => {
    const ordered = messages.sort(
      (a, b) => Date.parse(messageTime(a)) - Date.parse(messageTime(b)));
    const latest = ordered.at(-1)!;
    const item = toEmailItem(latest, lang);
    const folders = ordered.map(itemFolder);
    const folder: MailFolder = folders.every(value => value === 'trash') ? 'trash'
      : folders.includes('inbox') ? 'inbox'
        : folders.includes('snoozed') ? 'snoozed'
          : folders.includes('spam') ? 'spam'
            : folders.includes('drafts') ? 'drafts' : 'sent';
    return {
      ...item,
      id: rootId,
      messageIds: ordered.map(message => message.id),
      folder,
      read: ordered.every(message => message.isRead),
      starred: ordered.some(message => message.isStarred),
      important: ordered.some(message => message.isImportant),
      threadMessages: ordered.map(threadMessage),
    };
  });
  return items.sort((a, b) => (
    Date.parse(b.createdAt ?? '') - Date.parse(a.createdAt ?? '')
  ));
}
async function loadFolder(folder: ApiMailFolder): Promise<MailApiMessage[]> {
  const messages: MailApiMessage[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES_PER_FOLDER; page += 1) {
    const result = await listMailMessages(folder, cursor);
    messages.push(...result.messages);
    if (!result.nextCursor || result.nextCursor === cursor) return messages;
    cursor = result.nextCursor;
  }
  throw new MailApiError(413, 'mail_sync_limit', 'Mailbox is too large to synchronize safely');
}
export function useMailSync(lang: 'zh' | 'en') {
  const { user, loading: authLoading } = useAuth();
  const identityKey = user?.id ?? '';
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [mailboxAddress, setMailboxAddress] = useState('');
  const [dataOwnerId, setDataOwnerId] = useState('');
  const [statusOwnerId, setStatusOwnerId] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const activeIdentity = useRef(identityKey);
  const dataOwner = useRef(dataOwnerId);
  const inFlight = useRef<{ userId: string; request: Promise<void> } | null>(null);
  const lastSuccessfulSync = useRef(0);
  const settleTimer = useRef<number | null>(null);
  activeIdentity.current = identityKey;
  dataOwner.current = dataOwnerId;
  const runRefresh = useCallback(async () => {
    const userId = user?.id;
    if (!userId) throw new MailApiError(401, 'auth_required', 'Login is required');
    const version = ++requestVersion.current;
    setStatusOwnerId(userId);
    setIsSyncing(true);
    setSyncError(null);
    const isCurrent = () => (
      version === requestVersion.current && activeIdentity.current === userId
    );
    try {
      const mailbox = await getMailbox();
      if (!mailbox) throw new MailApiError(404, 'mailbox_not_found', 'Mailbox is not registered');
      if (mailbox.status !== 'active') {
        throw new MailApiError(403, 'mailbox_inactive', 'Mailbox is not active');
      }
      const messages = await loadFolder('all');
      if (!isCurrent()) return;
      dataOwner.current = userId;
      setDataOwnerId(userId);
      setMailboxAddress(mailbox.address);
      setEmails(mapMailMessages(messages, lang));
      lastSuccessfulSync.current = Date.now();
    } catch (error) {
      if (isCurrent()) {
        setSyncError(error instanceof Error ? error.message : 'Mail synchronization failed');
      }
      throw error;
    } finally {
      if (isCurrent()) setIsSyncing(false);
    }
  }, [lang, user?.id]);
  const refreshMessages = useCallback((): Promise<void> => {
    if (!user?.id) return Promise.reject(
      new MailApiError(401, 'auth_required', 'Login is required'),
    );
    if (inFlight.current?.userId === user.id) return inFlight.current.request;
    const request = runRefresh().finally(() => {
      if (inFlight.current?.request === request) inFlight.current = null;
    });
    inFlight.current = { userId: user.id, request };
    return request;
  }, [runRefresh, user?.id]);
  useEffect(() => {
    requestVersion.current += 1;
    if (settleTimer.current) { window.clearTimeout(settleTimer.current); settleTimer.current = null; }
    inFlight.current = null; lastSuccessfulSync.current = 0; dataOwner.current = '';
    setEmails([]); setMailboxAddress(''); setDataOwnerId(''); setStatusOwnerId('');
    setIsSyncing(false); setSyncError(null);
  }, [identityKey]);
  useEffect(() => {
    if (authLoading || !identityKey) return;
    void refreshMessages().catch(() => {});
    return () => { requestVersion.current += 1; inFlight.current = null; };
  }, [authLoading, identityKey, refreshMessages]);
  useEffect(() => {
    const refreshIfStale = () => {
      if (
        document.visibilityState === 'visible'
        && Date.now() - lastSuccessfulSync.current >= 60_000
      ) {
        void refreshMessages().catch(() => {});
      }
    };
    window.addEventListener('focus', refreshIfStale);
    document.addEventListener('visibilitychange', refreshIfStale);
    return () => {
      window.removeEventListener('focus', refreshIfStale);
      document.removeEventListener('visibilitychange', refreshIfStale);
    };
  }, [refreshMessages]);
  useEffect(() => () => {
    if (settleTimer.current) window.clearTimeout(settleTimer.current);
  }, []);
  const scheduleSettlementRefresh = useCallback(() => {
    if (settleTimer.current) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      settleTimer.current = null;
      void refreshMessages().catch(() => {});
    }, 10_000);
  }, [refreshMessages]);
  const sendMessage = useCallback(async (input: MailSendInput) => {
    const result = await sendMailMessage(input);
    void refreshMessages().catch(() => {});
    scheduleSettlementRefresh();
    return result;
  }, [refreshMessages, scheduleSettlementRefresh]);
  const cancelMessage = useCallback(async (messageId: string) => {
    const result = await cancelQueuedMessage(messageId);
    await refreshMessages().catch(() => {});
    return result;
  }, [refreshMessages]);
  const deleteMessage = useCallback(async (messageId: string) => {
    const result = await deleteMailMessage(messageId);
    await refreshMessages().catch(() => {});
    return result;
  }, [refreshMessages]);
  const saveEmails = useCallback((
    update: EmailItem[] | ((current: EmailItem[]) => EmailItem[]),
  ) => {
    if (!activeIdentity.current || dataOwner.current !== activeIdentity.current) return;
    setEmails(current => typeof update === 'function' ? update(current) : update);
  }, []);
  const ownsData = !authLoading && dataOwnerId === identityKey && Boolean(identityKey);
  const ownsStatus = !authLoading && statusOwnerId === identityKey && Boolean(identityKey);
  return {
    emails: ownsData ? emails : [], saveEmails,
    mailboxAddress: ownsData ? mailboxAddress : (!authLoading ? user?.email ?? '' : ''),
    identityKey, isSyncing: ownsStatus && isSyncing,
    syncError: ownsStatus ? syncError : null, refreshMessages,
    sendMessage,
    cancelMessage,
    deleteMessage,
  };
}
