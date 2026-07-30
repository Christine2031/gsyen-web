import { useLayoutEffect, useRef } from 'react';
import { mailMessageIds, type EmailItem } from '../types/mail';
import {
  MailPatchQueue, restoreLocalMailItem, restoreMailPatch,
  type MailMessagePatch,
} from '../services/mailApi';

type SaveEmails = (
  update: EmailItem[] | ((current: EmailItem[]) => EmailItem[]),
) => void;

interface MailMutationOptions {
  emails: EmailItem[];
  identityKey: string;
  saveEmails: SaveEmails;
  onSyncFailure: () => void;
  showToast: (message: string, undo?: () => void | Promise<void>) => void;
}

const mutationGroup = (key: string) => (
  ['archived', 'snoozedUntil', 'spam', 'trashed'].includes(key) ? 'folder' : key
);

const mutationGroups = (patch: MailMessagePatch) => (
  [...new Set(Object.keys(patch).map(mutationGroup))]
);

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
    const activePatch = (id: string) => Object.fromEntries(Object.entries(patch).filter(([key]) => (
      latestMutation.current.get(`${id}:${mutationGroup(key)}`) === sequence
    ))) as MailMessagePatch;
    originals.forEach((_, id) => groups.forEach(group => (
      latestMutation.current.set(`${id}:${group}`, sequence)
    )));
    saveEmails(current => current.map(item => targets.has(item.id) ? update(item) : item));
    const commit = syncPatch(serverIds, patch);
    void commit.catch(() => saveEmails(current => current.map(item => {
      const original = originals.get(item.id);
      return original ? restoreLocalMailItem(item, original, activePatch(item.id)) : item;
    })));
    if (!notice) return;
    showToast(notice, async () => {
      try { await commit; }
      catch { onSyncFailure(); return; }
      const restoreGroups = new Map<string, { ids: string[]; patch: MailMessagePatch }>();
      originals.forEach(item => {
        const restored = restoreMailPatch(item, activePatch(item.id));
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
        return original ? restoreLocalMailItem(item, original, activePatch(item.id)) : item;
      }));
    });
  };
  return { identityGeneration, mutate };
}
