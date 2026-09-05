import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import {
  MailApiError, cancelQueuedMessage, deleteMailMessage, getMailbox, sendMailMessage,
  type MailApiMessage, type MailSendInput,
} from '../services/mailApi';
import type { EmailItem } from '../types/mail';
import { readMailSyncSnapshot, scheduleMailSyncSnapshot } from './mailSyncCache';
import {
  applyMailSyncChanges, loadMailSyncBaseline, loadMailSyncChanges, mapMailMessages,
} from './mailSyncData';
import { isRetryableMailSyncError, MAIL_SYNC_RETRY_DELAYS_MS, waitForMailSyncRetry } from './mailSyncRecovery';

export { useMailMutations } from './mailMutations';
export { mapMailMessages } from './mailSyncData';

const BACKGROUND_SYNC_MS = 30_000;
const FOCUS_SYNC_GUARD_MS = 5_000;
type SyncMode = 'baseline' | 'delta';

function syncErrorCode(error: unknown): string {
  return error instanceof MailApiError ? error.code : 'mail_sync_unexpected';
}
function reportSync(event: Record<string, string | number>) { console.info('[mail-sync]', event); }

export function useMailSync(lang: 'zh' | 'en') {
  const { user, session, loading: authLoading } = useAuth();
  // A display snapshot is not authentication. Mail data must never be loaded
  // or displayed until the authenticated Supabase session is present.
  const identityKey = session?.access_token && session.user.id === user?.id ? user.id : '';
  const cached = useMemo(() => (
    identityKey ? readMailSyncSnapshot(identityKey, lang) : null
  ), [identityKey, lang]);
  const cachedEmails = useMemo(() => (
    cached?.emails ?? (cached?.messages ? mapMailMessages(cached.messages, lang) : [])
  ), [cached, lang]);
  const [emails, setEmails] = useState<EmailItem[]>(cachedEmails);
  const [mailboxAddress, setMailboxAddress] = useState(cached?.mailboxAddress ?? '');
  const [dataOwnerId, setDataOwnerId] = useState(cached ? identityKey : '');
  const [statusOwnerId, setStatusOwnerId] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const activeIdentity = useRef(identityKey);
  const dataOwner = useRef(dataOwnerId);
  const rawMessages = useRef<MailApiMessage[]>(cached?.messages ?? []);
  const syncCursor = useRef<number | null>(cached?.syncCursor ?? null);
  const mailboxAddressRef = useRef(cached?.mailboxAddress ?? '');
  const inFlight = useRef<{ userId: string; request: Promise<void> } | null>(null);
  const lastSuccessfulSync = useRef(0);
  const settleTimer = useRef<number | null>(null);

  useLayoutEffect(() => {
    activeIdentity.current = identityKey;
    dataOwner.current = dataOwnerId;
  }, [identityKey, dataOwnerId]);

  const refreshMessages = useCallback((): Promise<void> => {
    const userId = identityKey;
    if (!userId) return Promise.reject(new MailApiError(401, 'auth_required', 'Login is required'));
    if (inFlight.current?.userId === userId) return inFlight.current.request;
    const version = ++requestVersion.current;
    const isCurrent = () => version === requestVersion.current && activeIdentity.current === userId;
    const request = (async () => {
      setStatusOwnerId(userId); setIsSyncing(true); setSyncError(null);
      const startedAt = performance.now();
      let attempts = 0;
      let mode: SyncMode = syncCursor.current === null ? 'baseline' : 'delta';
      try {
        while (true) {
          try {
            let changeCount = 0;
            if (mode === 'baseline') {
              const mailbox = await getMailbox();
              if (!mailbox) throw new MailApiError(404, 'mailbox_not_found', 'Mailbox is not registered');
              if (mailbox.status !== 'active') {
                throw new MailApiError(403, 'mailbox_inactive', 'Mailbox is not active');
              }
              const baseline = await loadMailSyncBaseline();
              if (!isCurrent()) return;
              rawMessages.current = baseline.messages;
              syncCursor.current = baseline.syncCursor;
              mailboxAddressRef.current = mailbox.address;
              setMailboxAddress(mailbox.address);
              changeCount = baseline.messages.length;
            } else {
              const changes = await loadMailSyncChanges(syncCursor.current ?? 0);
              if (!isCurrent()) return;
              rawMessages.current = applyMailSyncChanges(rawMessages.current, changes.changes);
              syncCursor.current = changes.syncCursor;
              changeCount = changes.changes.length;
            }
            const nextEmails = mapMailMessages(rawMessages.current, lang);
            dataOwner.current = userId;
            setDataOwnerId(userId);
            setEmails(nextEmails);
            scheduleMailSyncSnapshot(userId, lang, {
              messages: rawMessages.current,
              mailboxAddress: mailboxAddressRef.current,
              syncCursor: syncCursor.current,
            });
            lastSuccessfulSync.current = Date.now();
            reportSync({ mode, outcome: 'success', attempts, changes: changeCount,
              durationMs: Math.round(performance.now() - startedAt) });
            return;
          } catch (error) {
            if (!isRetryableMailSyncError(error) || attempts >= MAIL_SYNC_RETRY_DELAYS_MS.length) {
              if (isCurrent()) setSyncError(error instanceof Error ? error.message : 'Mail synchronization failed');
              reportSync({ mode, outcome: 'failure', attempts, code: syncErrorCode(error),
                durationMs: Math.round(performance.now() - startedAt) });
              throw error;
            }
            await waitForMailSyncRetry(attempts);
            attempts += 1;
            if (!isCurrent()) return;
            mode = syncCursor.current === null ? 'baseline' : 'delta';
          }
        }
      } finally {
        if (isCurrent()) setIsSyncing(false);
      }
    })().finally(() => {
      if (inFlight.current?.request === request) inFlight.current = null;
    });
    inFlight.current = { userId, request };
    return request;
  }, [identityKey, lang]);

  useEffect(() => {
    requestVersion.current += 1;
    if (settleTimer.current) window.clearTimeout(settleTimer.current);
    settleTimer.current = null; inFlight.current = null; lastSuccessfulSync.current = 0;
    rawMessages.current = cached?.messages ?? [];
    syncCursor.current = cached?.syncCursor ?? null;
    mailboxAddressRef.current = cached?.mailboxAddress ?? '';
    dataOwner.current = cached ? identityKey : '';
    setEmails(cachedEmails); setMailboxAddress(mailboxAddressRef.current);
    setDataOwnerId(dataOwner.current); setStatusOwnerId(''); setIsSyncing(false); setSyncError(null);
  }, [cached, cachedEmails, identityKey]);

  useEffect(() => {
    if (authLoading || !identityKey) return;
    void refreshMessages().catch(() => {});
    return () => { requestVersion.current += 1; inFlight.current = null; };
  }, [authLoading, identityKey, refreshMessages]);

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') void refreshMessages().catch(() => {});
    };
    const refreshOnFocus = () => {
      if (Date.now() - lastSuccessfulSync.current >= FOCUS_SYNC_GUARD_MS) refreshIfVisible();
    };
    const timer = window.setInterval(refreshIfVisible, BACKGROUND_SYNC_MS);
    window.addEventListener('focus', refreshOnFocus);
    window.addEventListener('online', refreshIfVisible);
    window.addEventListener('gsyen:mail-state-committed', refreshIfVisible);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      window.clearInterval(timer); window.removeEventListener('focus', refreshOnFocus);
      window.removeEventListener('online', refreshIfVisible);
      window.removeEventListener('gsyen:mail-state-committed', refreshIfVisible);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [refreshMessages]);

  useEffect(() => () => { if (settleTimer.current) window.clearTimeout(settleTimer.current); }, []);

  const scheduleSettlementRefresh = useCallback(() => {
    if (settleTimer.current) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      settleTimer.current = null; void refreshMessages().catch(() => {});
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
      scheduleMailSyncSnapshot(activeIdentity.current, lang, {
        messages: rawMessages.current, emails: next, mailboxAddress: mailboxAddressRef.current,
        syncCursor: syncCursor.current,
      });
      return next;
    });
  }, [lang]);

  const ownsData = !authLoading && dataOwnerId === identityKey && Boolean(identityKey);
  const ownsStatus = !authLoading && statusOwnerId === identityKey && Boolean(identityKey);
  return {
    emails: ownsData ? emails : [], saveEmails,
    mailboxAddress: ownsData ? mailboxAddress : (!authLoading ? user?.email ?? '' : ''),
    identityKey, isSyncing: ownsStatus && isSyncing, syncError: ownsStatus ? syncError : null,
    refreshMessages, sendMessage, cancelMessage, deleteMessage,
  };
}

export function __resetMailSyncCacheForTest() {
  try { localStorage.clear(); } catch {}
}
