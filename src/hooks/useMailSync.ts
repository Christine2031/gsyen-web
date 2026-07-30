import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'; import { useAuth } from '../auth/useAuth';
import {
  mailApiToEmailItem, mailItemFolder, mailMessageIds, mailMessageTime,
  mailThreadMessage, type EmailItem, type MailFolder,
} from '../types/mail';
import {
  MailApiError, MailPatchQueue, cancelQueuedMessage, deleteMailMessage, getMailbox,
  listMailMessages, restoreLocalMailItem, restoreMailPatch, sendMailMessage,
  type ApiMailFolder, type MailApiMessage, type MailMessagePatch, type MailSendInput,
} from '../services/mailApi';
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
const mutationGroup = (key: string) => ['archived', 'snoozedUntil', 'spam', 'trashed'].includes(key) ? 'folder' : key;
const mutationGroups = (patch: MailMessagePatch) => [...new Set(Object.keys(patch).map(mutationGroup))];
type SaveEmails = (update: EmailItem[] | ((current: EmailItem[]) => EmailItem[])) => void;
interface MailMutationOptions { emails: EmailItem[]; identityKey: string; saveEmails: SaveEmails;
  onSyncFailure: () => void; showToast: (message: string, undo?: () => void | Promise<void>) => void; }
export function useMailMutations({
  emails, identityKey, saveEmails, onSyncFailure, showToast,
}: MailMutationOptions) {
  const patchQueue = useRef(new MailPatchQueue());
  const mutationSequence = useRef(0);
  const latestMutation = useRef(new Map<string, number>());
  const identityGeneration = useRef(0);
  const previousIdentity = useRef(identityKey);
  useLayoutEffect(() => {
    if (previousIdentity.current === identityKey) return;
    previousIdentity.current = identityKey;
    identityGeneration.current += 1;
    patchQueue.current.clear();
    latestMutation.current.clear();
  }, [identityKey]);
  const syncPatch = (ids: string[], patch: MailMessagePatch) => {
    const generation = identityGeneration.current;
    return patchQueue.current.run(ids, patch, () => (
      generation === identityGeneration.current
    )).catch(error => {
      if (generation !== identityGeneration.current) return;
      onSyncFailure();
      throw error;
    });
  };
  const mutate = (
    ids: string[],
    update: (message: EmailItem) => EmailItem,
    patch: MailMessagePatch,
    notice?: string,
  ) => {
    if (ids.length === 0) return;
    const targets = new Set(ids);
    const originals = new Map(emails.filter(item => targets.has(item.id))
      .map(item => [item.id, item]));
    if (originals.size === 0) return;
    const serverIds = [...new Set([...originals.values()].flatMap(mailMessageIds))];
    const sequence = ++mutationSequence.current;
    const groups = mutationGroups(patch);
    originals.forEach((_, id) => groups.forEach(group => (
      latestMutation.current.set(`${id}:${group}`, sequence)
    )));
    saveEmails(current => current.map(item => targets.has(item.id) ? update(item) : item));
    const commit = syncPatch(serverIds, patch);
    void commit.catch(() => saveEmails(current => current.map(item => {
      const original = originals.get(item.id);
      if (!original) return item;
      const active = Object.fromEntries(Object.entries(patch).filter(([key]) => (
        latestMutation.current.get(`${item.id}:${mutationGroup(key)}`) === sequence
      ))) as MailMessagePatch;
      return restoreLocalMailItem(item, original, active);
    })));
    if (!notice) return;
    showToast(notice, async () => {
      await commit;
      const restoreGroups = new Map<string, { ids: string[]; patch: MailMessagePatch }>();
      originals.forEach(item => {
        const restored = restoreMailPatch(item, patch);
        const key = JSON.stringify(restored);
        const group = restoreGroups.get(key) ?? { ids: [], patch: restored };
        group.ids.push(...mailMessageIds(item));
        restoreGroups.set(key, group);
      });
      await Promise.all([...restoreGroups.values()].map(
        group => syncPatch(group.ids, group.patch),
      ));
      saveEmails(current => current.map(item => {
        const original = originals.get(item.id);
        return original ? restoreLocalMailItem(item, original, patch) : item;
      }));
    });
  };
  return { identityGeneration, mutate };
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
const CACHE_TTL_MS = 5 * 60_000; const CACHE_LIMIT = 8;
type MailSyncCacheEntry = { emails: EmailItem[]; mailboxAddress: string; at: number };
const mailSyncCache = new Map<string, MailSyncCacheEntry>();
const permanentMailError = (error: unknown) => error instanceof MailApiError && [401, 403, 404].includes(error.status);
function readMailSyncCache(key: string) { const hit = key ? mailSyncCache.get(key) : undefined;
  if (!hit) return undefined; if (Date.now() - hit.at <= CACHE_TTL_MS) return hit; mailSyncCache.delete(key); return undefined; }
function writeMailSyncCache(key: string, emails: EmailItem[], mailboxAddress: string) { if (!key) return;
  mailSyncCache.set(key, { emails, mailboxAddress, at: Date.now() }); while (mailSyncCache.size > CACHE_LIMIT) mailSyncCache.delete(mailSyncCache.keys().next().value); }
export function __resetMailSyncCacheForTest() { mailSyncCache.clear(); }
export function useMailSync(lang: 'zh' | 'en') {
  const { user, loading: authLoading } = useAuth();
  const identityKey = user?.id ?? '';
  const syncCacheKey = identityKey ? `${identityKey}\u0000${lang}` : '';
  const cached = readMailSyncCache(syncCacheKey);
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
  activeIdentity.current = identityKey; dataOwner.current = dataOwnerId;
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
      const messages = await loadFolder('all');
      if (!isCurrent()) return;
      const nextEmails = mapMailMessages(messages, lang);
      dataOwner.current = userId;
      setDataOwnerId(userId);
      setMailboxAddress(mailbox.address);
      setEmails(nextEmails);
      writeMailSyncCache(syncCacheKey, nextEmails, mailbox.address);
      lastSuccessfulSync.current = Date.now();
    } catch (error) {
      if (isCurrent()) {
        setSyncError(error instanceof Error ? error.message : 'Mail synchronization failed');
        if (permanentMailError(error)) { mailSyncCache.delete(syncCacheKey); dataOwner.current = '';
          setDataOwnerId(''); setMailboxAddress(''); setEmails([]); setStatusOwnerId(''); }
      }
      throw error;
    } finally {
      if (isCurrent()) setIsSyncing(false);
    }
  }, [lang, syncCacheKey, user?.id]);
  const refreshMessages = useCallback((): Promise<void> => {
    if (!user?.id) return Promise.reject(
      new MailApiError(401, 'auth_required', 'Login is required'),
    );
    if (inFlight.current?.userId === user.id) return inFlight.current.request;
    const request = runRefresh().finally(() => { if (inFlight.current?.request === request) inFlight.current = null; });
    inFlight.current = { userId: user.id, request };
    return request;
  }, [runRefresh, user?.id]);
  useEffect(() => {
    requestVersion.current += 1;
    if (settleTimer.current) { window.clearTimeout(settleTimer.current); settleTimer.current = null; }
    inFlight.current = null; lastSuccessfulSync.current = 0; dataOwner.current = '';
    if (!identityKey) mailSyncCache.clear();
    const snapshot = readMailSyncCache(syncCacheKey);
    if (identityKey && snapshot) { dataOwner.current = identityKey; setEmails(snapshot.emails);
      setMailboxAddress(snapshot.mailboxAddress); setDataOwnerId(identityKey); setStatusOwnerId(''); }
    else { setEmails([]); setMailboxAddress(''); setDataOwnerId(''); setStatusOwnerId(''); }
    setIsSyncing(false); setSyncError(null);
  }, [identityKey, syncCacheKey]);
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
    return () => { window.removeEventListener('focus', refreshIfStale);
      document.removeEventListener('visibilitychange', refreshIfStale); };
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
    setEmails(current => { const next = typeof update === 'function' ? update(current) : update;
      if (syncCacheKey && mailboxAddress) writeMailSyncCache(syncCacheKey, next, mailboxAddress);
      return next; });
  }, [mailboxAddress, syncCacheKey]);
  const ownsData = !authLoading && dataOwnerId === identityKey && Boolean(identityKey);
  const ownsStatus = !authLoading && statusOwnerId === identityKey && Boolean(identityKey);
  return { emails: ownsData ? emails : [], saveEmails,
    mailboxAddress: ownsData ? mailboxAddress : (!authLoading ? user?.email ?? '' : ''),
    identityKey, isSyncing: ownsStatus && isSyncing, syncError: ownsStatus ? syncError : null,
    refreshMessages, sendMessage, cancelMessage, deleteMessage };
}
