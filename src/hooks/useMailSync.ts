import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import {
  mailApiToEmailItem, mailItemFolder, mailMessageTime,
  mailThreadMessage, type EmailItem, type MailFolder,
} from '../types/mail';
import {
  MailApiError, cancelQueuedMessage, deleteMailMessage, getMailbox,
  listMailMessages, sendMailMessage,
  type ApiMailFolder, type MailApiMessage, type MailSendInput,
} from '../services/mailApi';
import {
  clearMailSyncSnapshot, compactMailSyncEmails, isPermanentMailSyncError,
  readMailSyncSnapshot, writeMailSyncSnapshot,
} from './mailSyncCache';

export { useMailMutations } from './mailMutations';

const MAX_PAGES_PER_FOLDER = 100;

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
    if (!related) return;
    const otherId = byInternetId.get(related);
    if (otherId && find(message.id) !== find(otherId)) parent.set(find(message.id), find(otherId));
  });
  const groups = new Map<string, MailApiMessage[]>();
  unique.forEach(message => {
    const rootId = find(message.id);
    const group = groups.get(rootId);
    if (group) group.push(message);
    else groups.set(rootId, [message]);
  });
  const items = [...groups.entries()].map(([rootId, messages]) => {
    const ordered = messages.sort(
      (a, b) => Date.parse(mailMessageTime(a)) - Date.parse(mailMessageTime(b)));
    const latest = ordered.at(-1)!;
    const item = mailApiToEmailItem(latest, lang);
    const folders = ordered.map(mailItemFolder);
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
      threadMessages: ordered.map(mailThreadMessage),
    };
  });
  return items.sort((a, b) => (
    Date.parse(b.createdAt ?? '') - Date.parse(a.createdAt ?? '')
  ));
}

function cachedMailMessageIds(items: EmailItem[]): Set<string> {
  return new Set(items.flatMap(item => [item.id, ...(item.messageIds ?? [])]));
}

function mergeMailItems(remote: EmailItem[], cached: EmailItem[]): EmailItem[] {
  const byId = new Map<string, EmailItem>();
  cached.forEach(item => byId.set(item.id, item));
  remote.forEach(item => byId.set(item.id, item));
  return compactMailSyncEmails([...byId.values()]);
}

async function loadFolder(
  folder: ApiMailFolder,
  knownIds: Set<string> = new Set(),
): Promise<MailApiMessage[]> {
  const messages: MailApiMessage[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES_PER_FOLDER; page += 1) {
    const result = await listMailMessages(folder, cursor);
    messages.push(...result.messages);
    const pageAlreadyCached = knownIds.size > 0
      && result.messages.length > 0
      && result.messages.every(message => knownIds.has(message.id));
    if (pageAlreadyCached || !result.nextCursor || result.nextCursor === cursor) return messages;
    cursor = result.nextCursor;
  }
  throw new MailApiError(413, 'mail_sync_limit', 'Mailbox is too large to synchronize safely');
}

export function useMailSync(lang: 'zh' | 'en') {
  const { user, loading: authLoading } = useAuth();
  const identityKey = user?.id ?? '';
  const cached = identityKey ? readMailSyncSnapshot(identityKey, lang) : null;
  const [emails, setEmails] = useState<EmailItem[]>(cached?.emails ?? []);
  const [mailboxAddress, setMailboxAddress] = useState(cached?.mailboxAddress ?? '');
  const [dataOwnerId, setDataOwnerId] = useState(cached ? identityKey : '');
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
    const isCurrent = () => version === requestVersion.current && activeIdentity.current === userId;
    try {
      const mailbox = await getMailbox();
      if (!mailbox) throw new MailApiError(404, 'mailbox_not_found', 'Mailbox is not registered');
      if (mailbox.status !== 'active') {
        throw new MailApiError(403, 'mailbox_inactive', 'Mailbox is not active');
      }
      const cached = readMailSyncSnapshot(userId, lang);
      const messages = await loadFolder('all', cachedMailMessageIds(cached?.emails ?? []));
      if (!isCurrent()) return;
      const nextEmails = mergeMailItems(mapMailMessages(messages, lang), cached?.emails ?? []);
      dataOwner.current = userId;
      setDataOwnerId(userId);
      setMailboxAddress(mailbox.address);
      setEmails(nextEmails);
      writeMailSyncSnapshot(userId, lang, { emails: nextEmails, mailboxAddress: mailbox.address });
      lastSuccessfulSync.current = Date.now();
    } catch (error) {
      if (isCurrent()) {
        setSyncError(error instanceof Error ? error.message : 'Mail synchronization failed');
        if (isPermanentMailSyncError(error)) {
          clearMailSyncSnapshot(userId, lang);
          dataOwner.current = '';
          setDataOwnerId('');
          setMailboxAddress('');
          setEmails([]);
        }
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
    if (settleTimer.current) {
      window.clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
    inFlight.current = null;
    lastSuccessfulSync.current = 0;
    dataOwner.current = '';
    const cached = identityKey ? readMailSyncSnapshot(identityKey, lang) : null;
    if (cached) {
      dataOwner.current = identityKey;
      setEmails(cached.emails);
      setMailboxAddress(cached.mailboxAddress);
      setDataOwnerId(identityKey);
    } else {
      setEmails([]);
      setMailboxAddress('');
      setDataOwnerId('');
    }
    setStatusOwnerId('');
    setIsSyncing(false);
    setSyncError(null);
  }, [identityKey, lang]);

  useEffect(() => {
    if (authLoading || !identityKey) return;
    void refreshMessages().catch(() => {});
    return () => {
      requestVersion.current += 1;
      inFlight.current = null;
    };
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

  const saveEmails = useCallback((update: EmailItem[] | ((current: EmailItem[]) => EmailItem[])) => {
    if (!activeIdentity.current || dataOwner.current !== activeIdentity.current) return;
    setEmails(current => {
      const next = typeof update === 'function' ? update(current) : update;
      writeMailSyncSnapshot(activeIdentity.current, lang, { emails: next, mailboxAddress });
      return next;
    });
  }, [lang, mailboxAddress]);

  const ownsData = !authLoading && dataOwnerId === identityKey && Boolean(identityKey);
  const ownsStatus = !authLoading && statusOwnerId === identityKey && Boolean(identityKey);
  return {
    emails: ownsData ? emails : [],
    saveEmails,
    mailboxAddress: ownsData ? mailboxAddress : (!authLoading ? user?.email ?? '' : ''),
    identityKey,
    isSyncing: ownsStatus && isSyncing,
    syncError: ownsStatus ? syncError : null,
    refreshMessages,
    sendMessage,
    cancelMessage,
    deleteMessage,
  };
}
