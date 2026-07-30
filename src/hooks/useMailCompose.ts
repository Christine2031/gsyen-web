import React, {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import type { EmailItem, MailCategory, ThreadMessage } from '../types/mail';
import type { MailSendInput, MailSendResult } from '../services/mailApi';
import { localDateStr } from '../utils/date';

type UndoAction = () => void | Promise<void>;

export function useMailToast(lang: 'zh' | 'en') {
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastUndoAction, setToastUndoAction] = useState<UndoAction | null>(null);
  const timer = useRef<number | null>(null);
  const clearToast = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setToastMessage(null);
    setToastUndoAction(null);
  }, []);
  const showToast = useCallback((message: string, undoAction?: UndoAction) => {
    clearToast();
    setToastMessage(message);
    setToastUndoAction(() => undoAction ?? null);
    timer.current = window.setTimeout(clearToast, 6500);
  }, [clearToast]);
  useEffect(() => clearToast, [clearToast]);
  const runUndo = async () => {
    if (!toastUndoAction) return;
    const undo = toastUndoAction;
    setToastUndoAction(null);
    await undo();
    showToast(lang === 'zh' ? '操作已回滚撤销' : 'Operation rolled back and restored');
  };
  return { toastMessage, toastUndoAction, showToast, clearToast, runUndo };
}

interface UseMailComposeOptions {
  lang: 'zh' | 'en';
  identityKey: string;
  sendMessage: (input: MailSendInput) => Promise<MailSendResult>;
  cancelMessage: (messageId: string) => Promise<{ cancelled: true }>;
  contacts: EmailItem[];
  showToast: (msg: string, undo?: UndoAction) => void;
}

type ComposeDraft = {
  to: string;
  subject: string;
  body: string;
  category: MailCategory;
};
const emptyDraft = (): ComposeDraft => ({
  to: '', subject: '', body: '', category: 'primary',
});
const draftFingerprint = (identity: string, draft: ComposeDraft) => (
  JSON.stringify([identity, draft.to, draft.subject, draft.body, draft.category])
);

function parseRecipients(value: string): string[] {
  return [...new Set(value.split(/[;,]/).map(part => {
    const trimmed = part.trim();
    return trimmed.match(/<([^<>\s]+@[^<>\s]+)>$/)?.[1] ?? trimmed;
  }).filter(Boolean))];
}

interface SendReplyOptions {
  original: EmailItem;
  body: string;
  mailboxAddress: string;
  idempotencyKey: string;
  sendMessage: (input: MailSendInput) => Promise<MailSendResult>;
}

export async function sendMailReply({
  original, body, mailboxAddress, idempotencyKey, sendMessage,
}: SendReplyOptions): Promise<{ queued: MailSendResult; reply: ThreadMessage | null }> {
  const references = [...new Set([
    ...(original.references ?? []),
    ...(original.internetMessageId ? [original.internetMessageId] : []),
  ])];
  const queued = await sendMessage({
    to: [original.senderAddress],
    subject: /^re:/i.test(original.subject) ? original.subject : `Re: ${original.subject}`,
    text: body,
    inReplyTo: original.internetMessageId,
    references,
    category: original.category,
    idempotencyKey,
  });
  if (queued.status === 'failed') return { queued, reply: null };
  const now = new Date();
  const reply: ThreadMessage = {
    id: queued.messageId,
    senderName: mailboxAddress.split('@')[0],
    senderAddress: mailboxAddress,
    body,
    date: localDateStr(now),
    time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
    isMe: true,
  };
  return { queued, reply };
}

export function appendMailReply(
  item: EmailItem,
  reply: ThreadMessage,
  messageId: string,
  body: string,
  lang: 'zh' | 'en',
): EmailItem {
  if ((item.messageIds ?? [item.id]).includes(messageId)) return item;
  return {
    ...item,
    read: true,
    snippet: `${lang === 'zh' ? '我: ' : 'Me: '}${body.substring(0, 60)}...`,
    threadMessages: [...item.threadMessages, reply],
    messageIds: [...new Set([...(item.messageIds ?? [item.id]), messageId])],
  };
}

export function removeMailReply(
  item: EmailItem,
  messageId: string,
  lang: 'zh' | 'en',
): EmailItem {
  const wasLatest = item.threadMessages.at(-1)?.id === messageId;
  const threadMessages = item.threadMessages.filter(message => message.id !== messageId);
  if (threadMessages.length === item.threadMessages.length) return item;
  const latest = threadMessages.at(-1);
  const snippet = wasLatest && latest
    ? `${latest.isMe ? (lang === 'zh' ? '我: ' : 'Me: ') : ''}${latest.body.slice(0, 60)}`
    : item.snippet;
  return {
    ...item,
    snippet,
    threadMessages,
    messageIds: (item.messageIds ?? [item.id]).filter(id => id !== messageId),
  };
}

export function useMailCompose({
  lang, identityKey, sendMessage, cancelMessage, contacts, showToast,
}: UseMailComposeOptions) {
  const [composeState, setComposeState] = useState<
    'closed' | 'window' | 'minimized' | 'maximized'
  >('closed');
  const [composeTo, setComposeToState] = useState('');
  const [composeSubject, setComposeSubjectState] = useState('');
  const [composeBody, setComposeBodyState] = useState('');
  const [composeCategory, setComposeCategoryState] = useState<MailCategory>('primary');
  const [showToSuggestions, setShowToSuggestions] = useState(false);
  const draftRef = useRef<ComposeDraft>(emptyDraft());
  const submission = useRef<{ fingerprint: string; key: string } | null>(null);
  const isSubmitting = useRef(false);
  const identityGeneration = useRef(0);
  const previousIdentity = useRef(identityKey);
  const replaceDraft = (draft: ComposeDraft) => {
    draftRef.current = draft;
    setComposeToState(draft.to); setComposeSubjectState(draft.subject);
    setComposeBodyState(draft.body); setComposeCategoryState(draft.category);
  };
  const setComposeTo = (to: string) => {
    draftRef.current = { ...draftRef.current, to }; setComposeToState(to);
  };
  const setComposeSubject = (subject: string) => {
    draftRef.current = { ...draftRef.current, subject }; setComposeSubjectState(subject);
  };
  const setComposeBody = (body: string) => {
    draftRef.current = { ...draftRef.current, body }; setComposeBodyState(body);
  };
  const setComposeCategory = (category: MailCategory) => {
    draftRef.current = { ...draftRef.current, category }; setComposeCategoryState(category);
  };
  useLayoutEffect(() => {
    if (previousIdentity.current === identityKey) return;
    previousIdentity.current = identityKey;
    identityGeneration.current += 1;
    isSubmitting.current = false; submission.current = null;
    replaceDraft(emptyDraft()); setComposeState('closed'); setShowToSuggestions(false);
  }, [identityKey]);

  const filteredSuggestions = useMemo(() => {
    if (!composeTo.trim()) return [];
    const term = composeTo.toLowerCase();
    const unique = new Map(contacts.map(item => [
      item.senderAddress.toLowerCase(),
      { name: item.senderName, email: item.senderAddress.toLowerCase() },
    ]));
    return [...unique.values()].filter(contact => (
      /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.email)
      && !/\.(?:internal|atelier)$/i.test(contact.email)
      && (
      contact.name.toLowerCase().includes(term)
      || contact.email.toLowerCase().includes(term)
      )
    ));
  }, [composeTo, contacts]);

  const handleSendComposeEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!composeTo.trim() || !composeSubject.trim() || isSubmitting.current) return;
    const recipients = parseRecipients(composeTo);
    if (recipients.length === 0) return;
    const draft: ComposeDraft = {
      to: composeTo,
      subject: composeSubject,
      body: composeBody,
      category: composeCategory,
    };
    const fingerprint = draftFingerprint(identityKey, draft);
    if (submission.current?.fingerprint !== fingerprint) {
      submission.current = { fingerprint, key: `gsyen:${crypto.randomUUID()}` };
    }
    const generation = identityGeneration.current;
    isSubmitting.current = true;
    try {
      const queued = await sendMessage({
        to: recipients,
        subject: composeSubject,
        text: composeBody || (lang === 'zh' ? '未标注附带文本主体。' : 'Empty transcript body.'),
        category: composeCategory,
        idempotencyKey: submission.current.key,
      });
      if (generation !== identityGeneration.current) return;
      if (queued.status === 'failed') {
        submission.current = null;
        throw new Error('Mail delivery failed');
      }
      const unchanged = draftFingerprint(identityKey, draftRef.current) === fingerprint;
      if (unchanged) { replaceDraft(emptyDraft()); setComposeState('closed'); }
      if (submission.current?.fingerprint === fingerprint) submission.current = null;
      const undo = queued.status === 'queued' ? async () => {
        await cancelMessage(queued.messageId);
        if (
          generation === identityGeneration.current && unchanged
          && draftFingerprint(identityKey, draftRef.current)
            === draftFingerprint(identityKey, emptyDraft())
        ) replaceDraft(draft);
        if (generation === identityGeneration.current && unchanged) setComposeState('window');
      } : undefined;
      showToast(
        lang === 'zh' ? '信件配方已加密发送' : 'Draft successfully sealed & dispatched',
        undo,
      );
    } catch {
      if (generation === identityGeneration.current) {
        showToast(lang === 'zh' ? '信件发送失败，请稍后重试' : 'Delivery failed. Please retry.');
      }
    } finally {
      if (generation === identityGeneration.current) isSubmitting.current = false;
    }
  };

  const handleShred = () => {
    replaceDraft(emptyDraft());
    setComposeState('closed');
    submission.current = null;
    showToast(lang === 'zh' ? '草存蓝图已销毁' : 'Draft blueprint shredded successfully');
  };

  return {
    composeState, setComposeState,
    composeTo, setComposeTo,
    composeSubject, setComposeSubject,
    composeBody, setComposeBody,
    composeCategory, setComposeCategory,
    showToSuggestions, setShowToSuggestions,
    filteredSuggestions,
    handleSendComposeEmail, handleShred,
  };
}
