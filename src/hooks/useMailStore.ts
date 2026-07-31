import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { filterMailItems, mailMessageIds, mailSearchToken, moveMailItem,
  selectedMailIds, resolveSnooze,
  type EmailItem, type MailCategory, type MailFolder, type MailSelection, type SnoozePreset } from '../types/mail';
import { mailApiToEmailItem } from '../types/mail';
import { getMailMessage, type MailMessagePatch } from '../services/mailApi';
import { appendMailReply, removeMailReply, sendMailReply, useMailToast } from './useMailCompose';
import { useMailMutations, useMailSync } from './useMailSync';
export function useMailStore(lang: 'zh' | 'en') {
  const mail = useMailSync(lang);
  const { emails, saveEmails } = mail;
  const [currentFolder, setCurrentFolder] = useState<MailFolder>('inbox');
  const [currentCategoryTab, setCurrentCategoryTab] = useState<MailCategory>('primary');
  const [selectedEmail, setSelectedEmail] = useState<EmailItem | null>(null);
  const [inlineReplyText, setInlineReplyTextState] = useState('');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [showFilters, setShowFilters] = useState(false); const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState(''); const [filterSubject, setFilterSubject] = useState('');
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [snoozeTargetId, setSnoozeTargetId] = useState<string | null>(null);
  const [showSnoozePopover, setShowSnoozePopover] = useState(false);
  const [snoozePositions, setSnoozePositions] = useState<{ x: number; y: number } | null>(null);
  const replyInFlight = useRef(false);
  const inlineReplyTextRef = useRef('');
  const selectedIdRef = useRef<string | null>(null);
  const replySubmission = useRef<{ fingerprint: string; key: string } | null>(null);
  const previousIdentity = useRef(mail.identityKey);
  const shownSyncError = useRef<string | null>(null);
  selectedIdRef.current = selectedEmail?.id ?? null;
  const setInlineReplyText = (value: string) => {
    inlineReplyTextRef.current = value; setInlineReplyTextState(value);
  };
  const { toastMessage, toastUndoAction, showToast, clearToast, runUndo } = useMailToast(lang);
  const reportSyncFailure = useCallback(() => showToast(lang === 'zh'
    ? '邮件同步失败，请稍后重试' : 'Mail sync failed. Please retry.'), [lang, showToast]);
  const syncFailure = useCallback(() => {
    reportSyncFailure(); void mail.refreshMessages().catch(() => {});
  }, [mail, reportSyncFailure]);
  const { identityGeneration, mutate } = useMailMutations({
    emails, identityKey: mail.identityKey, saveEmails,
    onSyncFailure: syncFailure, showToast,
  });
  useLayoutEffect(() => {
    if (previousIdentity.current === mail.identityKey) return;
    previousIdentity.current = mail.identityKey;
    replyInFlight.current = false; replySubmission.current = null;
    setSelectedEmail(null); setInlineReplyText(''); setSelectedIds({});
    setSearchText(''); setFilterFrom(''); setFilterTo(''); setFilterSubject('');
    setSnoozeTargetId(null); setShowSnoozePopover(false); setSnoozePositions(null);
    clearToast(); shownSyncError.current = null;
  }, [clearToast, mail.identityKey]);
  useEffect(() => {
    setInlineReplyText(''); replySubmission.current = null;
  }, [selectedEmail?.id]);
  useEffect(() => {
    if (!mail.syncError) { shownSyncError.current = null; return; }
    if (shownSyncError.current === mail.syncError) return;
    shownSyncError.current = mail.syncError;
    reportSyncFailure();
  }, [mail.syncError, reportSyncFailure]);
  useEffect(() => {
    setSelectedEmail(current => current
      ? emails.find(item => item.id === current.id) ?? null : null);
    setSelectedIds(current => Object.fromEntries(Object.entries(current)
      .filter(([id, selected]) => selected && emails.some(item => item.id === id))));
  }, [emails]);
  const handleUndo = async () => { try { await runUndo(); } catch { syncFailure(); } };
  const unreadInboxCount = emails.filter(m => m.folder === 'inbox' && !m.read).length; const starredCount = emails.filter(m => m.starred).length;
  const snoozedCount = emails.filter(m => m.folder === 'snoozed').length; const draftsCount = emails.filter(m => m.folder === 'drafts').length;
  const filteredList = useMemo(() => filterMailItems(emails, currentFolder,
    currentCategoryTab, searchText, filterFrom, filterTo, filterSubject), [emails,
    currentFolder, currentCategoryTab, searchText, filterFrom, filterTo, filterSubject]);
  const handleToggleStar = (id: string, event: MouseEvent) => {
    event.stopPropagation();
    const item = emails.find(message => message.id === id);
    if (!item) return;
    const next = !item.starred;
    mutate([id], m => ({ ...m, starred: next }), { isStarred: next },
      next ? (lang === 'zh' ? '已标记星标' : 'Letter starred')
        : (lang === 'zh' ? '移除了星标' : 'Removed star from letter'));
    if (selectedEmail?.id === id) setSelectedEmail({ ...selectedEmail, starred: next });
  };
  const handleToggleImportant = (id: string, event: MouseEvent) => {
    event.stopPropagation();
    const item = emails.find(message => message.id === id);
    if (!item) return;
    const next = !item.important;
    mutate([id], m => ({ ...m, important: next }), { isImportant: next },
      next ? (lang === 'zh' ? '标记为高瞩目重点' : 'Marked as high importance')
        : (lang === 'zh' ? '撤销重点标记' : 'Removed high priority tag'));
    if (selectedEmail?.id === id) setSelectedEmail({ ...selectedEmail, important: next });
  };
  const handleEmailRowClick = (item: EmailItem) => {
    const opened = item.read ? item : { ...item, read: true };
    setSelectedEmail(opened);
    if (!item.read) mutate([item.id], message => ({ ...message, read: true }), { isRead: true });
    if (opened.body.trim()) return;
    const generation = identityGeneration.current;
    void getMailMessage(item.id).then(message => {
      if (generation !== identityGeneration.current) return;
      const hydrated = { ...opened, ...mailApiToEmailItem(message, lang), read: true };
      saveEmails(current => current.map(email => email.id === item.id ? hydrated : email));
      setSelectedEmail(current => current?.id === item.id ? hydrated : current);
    }).catch(() => {});
  };
  const handleDeleteEmail = (id: string, event?: MouseEvent) => {
    event?.stopPropagation();
    const itemIndex = emails.findIndex(message => message.id === id); const item = emails[itemIndex];
    if (!item) return;
    if (item.folder === 'trash') {
      saveEmails(current => current.filter(message => message.id !== id));
      setSelectedEmail(null);
      const generation = identityGeneration.current;
      void Promise.all(mailMessageIds(item).map(mail.deleteMessage)).then(() => {
        if (generation !== identityGeneration.current) return;
        showToast(lang === 'zh' ? '永久摧毁清除信件' : 'Letter burned permanently');
      }).catch(() => {
        if (generation !== identityGeneration.current) return;
        saveEmails(current => current.some(message => message.id === id) ? current : [
          ...current.slice(0, itemIndex), item, ...current.slice(itemIndex)]);
        syncFailure();
      });
      return;
    }
    mutate([id], m => moveMailItem(m, 'trash'),
      { trashed: true, spam: false, archived: false, snoozedUntil: null },
      lang === 'zh' ? '账目信件已移至废弃篓' : 'Letter moved to Atelier Trash bin');
    if (selectedEmail?.id === id) setSelectedEmail(null);
  };
  const handleArchiveEmail = (id: string, event?: MouseEvent) => {
    event?.stopPropagation();
    if (!emails.some(message => message.id === id)) return;
    mutate([id], m => moveMailItem(m, 'sent'),
      { archived: true, trashed: false, spam: false, snoozedUntil: null },
      lang === 'zh' ? '信件已封档留底' : 'Letter archived successfully');
    if (selectedEmail?.id === id) setSelectedEmail(null);
  };
  const triggerSnoozePopover = (id: string, event: MouseEvent) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setSnoozeTargetId(id); setShowSnoozePopover(true);
    setSnoozePositions({ x: rect.left - 180, y: rect.bottom + window.scrollY });
  };
  const executeSnooze = (preset: SnoozePreset) => {
    if (!snoozeTargetId) return;
    const { until, label } = resolveSnooze(preset, lang);
    mutate([snoozeTargetId], m => moveMailItem(
      m, 'snoozed', { at: until.toISOString(), label },
    ),
      { snoozedUntil: until.toISOString(), archived: false, trashed: false, spam: false },
      lang === 'zh' ? `信件已挂起推迟至: ${label}` : `Letter postponed until: ${label}`);
    if (selectedEmail?.id === snoozeTargetId) setSelectedEmail(null);
    setShowSnoozePopover(false);
    setSnoozeTargetId(null);
  };
  const getIsAllSelected = () => filteredList.length > 0
    && filteredList.every(item => !!selectedIds[item.id]);
  const handleToggleSelectAll = () => setSelectedIds(getIsAllSelected()
    ? {} : Object.fromEntries(filteredList.map(item => [item.id, true])));
  const handleSelectAllDropdown = (type: MailSelection) => setSelectedIds(
    selectedMailIds(filteredList, type));
  const selectedKeys = () => Object.keys(selectedIds).filter(id => selectedIds[id]);
  const bulkMutate = (
    update: (message: EmailItem) => EmailItem,
    patch: MailMessagePatch,
    notice: string,
  ) => {
    mutate(selectedKeys(), update, patch, notice);
    setSelectedIds({});
  };
  const handleBulkArchive = () => bulkMutate(
    m => moveMailItem(m, 'sent'),
    { archived: true, trashed: false, spam: false, snoozedUntil: null },
    lang === 'zh' ? '选中的批量信件已归集归档' : 'Batch letters archived',
  );
  const handleBulkDelete = () => bulkMutate(
    m => moveMailItem(m, 'trash'),
    { trashed: true, spam: false, archived: false, snoozedUntil: null },
    lang === 'zh' ? '选中的批量信件已全部移入垃圾篓' : 'Batch letters sent to trash',
  );
  const handleBulkMarkRead = (read: boolean) => bulkMutate(
    m => ({ ...m, read }), { isRead: read },
    read ? (lang === 'zh' ? '选中的信件已更新为已读' : 'Batch letters marked as read')
      : (lang === 'zh' ? '选中的信件已更新为未读' : 'Batch letters marked as unread'),
  );
  const handleApplyAdvancedFilters = () => {
    setSearchText([
      mailSearchToken('from', filterFrom),
      mailSearchToken('subject', filterSubject),
    ].filter(Boolean).join(' '));
    setShowFilters(false);
  };
  const handleResetFilters = () => {
    setFilterFrom(''); setFilterTo(''); setFilterSubject(''); setSearchText('');
  };
  const handleSendInlineReply = async () => {
    if (!inlineReplyText.trim() || !selectedEmail || replyInFlight.current) return;
    replyInFlight.current = true;
    const generation = identityGeneration.current;
    try {
      const original = selectedEmail;
      const body = inlineReplyText;
      const fingerprint = `${mail.identityKey}\u0000${original.id}\u0000${body}`;
      if (replySubmission.current?.fingerprint !== fingerprint) {
        replySubmission.current = { fingerprint, key: `gsyen:${crypto.randomUUID()}` };
      }
      const { queued, reply } = await sendMailReply({
        original, body, mailboxAddress: mail.mailboxAddress,
        idempotencyKey: replySubmission.current.key, sendMessage: mail.sendMessage,
      });
      if (generation !== identityGeneration.current) return;
      if (queued.status === 'failed' || !reply) {
        replySubmission.current = null;
        throw new Error('Mail delivery failed');
      }
      const mergeReply = (item: EmailItem) => (
        appendMailReply(item, reply, queued.messageId, body, lang)
      );
      saveEmails(current => current.map(item => item.id === original.id ? mergeReply(item) : item));
      setSelectedEmail(current => current?.id === original.id ? mergeReply(current) : current);
      const cleared = selectedIdRef.current === original.id && inlineReplyTextRef.current === body;
      if (cleared) setInlineReplyText('');
      replySubmission.current = null;
      const undo = queued.status === 'queued' ? async () => {
        await mail.cancelMessage(queued.messageId);
        if (generation !== identityGeneration.current) return;
        const removeReply = (item: EmailItem) => (
          removeMailReply(item, queued.messageId, lang));
        saveEmails(current => current.map(item => (
          item.id === original.id ? removeReply(item) : item
        )));
        setSelectedEmail(current => current?.id === original.id
          ? removeReply(current) : current);
        if (cleared && !inlineReplyTextRef.current) setInlineReplyText(body);
      } : undefined;
      showToast(lang === 'zh' ? '已追加封寄回复' : 'Sealed thread reply dispatched', undo);
    } catch {
      reportSyncFailure();
    } finally {
      if (generation === identityGeneration.current) replyInFlight.current = false;
    }
  };
  const handleRefresh = async () => { try { await mail.refreshMessages();
    showToast(lang === 'zh' ? '刷新系统信道，获取最新同步...' : 'Hermes cache synchronized');
  } catch { reportSyncFailure(); } };
  return {
    emails, saveEmails, identityKey: mail.identityKey, selectedEmail, setSelectedEmail, currentFolder, setCurrentFolder, currentCategoryTab, setCurrentCategoryTab, isSidebarCollapsed, setIsSidebarCollapsed,
    searchText, setSearchText, showFilters, setShowFilters, filterFrom, setFilterFrom,
    filterTo, setFilterTo, filterSubject, setFilterSubject, selectedIds, setSelectedIds,
    snoozeTargetId, showSnoozePopover, setShowSnoozePopover, snoozePositions, inlineReplyText, setInlineReplyText, toastMessage, toastUndoAction, filteredList, unreadInboxCount,
    starredCount, snoozedCount, draftsCount, showToast, handleUndo, handleToggleStar,
    handleToggleImportant, handleEmailRowClick, handleDeleteEmail, handleArchiveEmail,
    triggerSnoozePopover, executeSnooze, getIsAllSelected, handleToggleSelectAll,
    handleSelectAllDropdown, handleBulkArchive, handleBulkDelete, handleBulkMarkRead,
    handleApplyAdvancedFilters, handleResetFilters, handleSendInlineReply, handleRefresh, sendMessage: mail.sendMessage, cancelMessage: mail.cancelMessage,
  };
}
