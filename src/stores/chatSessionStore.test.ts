// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../types/chat';

vi.hoisted(() => {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => { store.clear(); },
    },
  });
});

vi.mock('../lib/supabase', () => ({ supabase: null }));
vi.mock('../services/localVaultService', () => ({
  localVaultService: { saveSession: vi.fn() },
}));

import { shouldKeepLocalChatOnEmptyPull } from './chatSessionStore';

describe('chat session sync guards', () => {
  it('keeps local chat when an empty remote pull would wipe active history', () => {
    expect(shouldKeepLocalChatOnEmptyPull([], '[{"role":"user","content":"hi"}]'))
      .toBe(true);
    expect(shouldKeepLocalChatOnEmptyPull([
      { messages: [{ id: 'm1', role: 'user', content: 'hi', timestamp: 'now' } satisfies ChatMessage] },
    ], null)).toBe(true);
  });

  it('allows empty remote state when there is no recoverable local chat', () => {
    expect(shouldKeepLocalChatOnEmptyPull([], null)).toBe(false);
    expect(shouldKeepLocalChatOnEmptyPull([{ messages: [] }], '[]')).toBe(false);
  });

  it('ignores malformed or non-array current chat snapshots', () => {
    expect(shouldKeepLocalChatOnEmptyPull([], '{}')).toBe(false);
    expect(shouldKeepLocalChatOnEmptyPull([], '   ')).toBe(false);
    expect(shouldKeepLocalChatOnEmptyPull([], '{')).toBe(false);
  });
});
