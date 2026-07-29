import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../types/chat';
import { settleInterruptedAssistant } from './chatStreamingState';

const baseMessages: ChatMessage[] = [
  { id: 'user-1', role: 'user', content: 'hello', timestamp: '10:00' },
];

describe('settleInterruptedAssistant', () => {
  it('removes an empty interrupted assistant placeholder', () => {
    const messages: ChatMessage[] = [
      ...baseMessages,
      { id: 'ai-1', role: 'model', content: '', timestamp: '10:00', streaming: true },
    ];

    expect(settleInterruptedAssistant(messages, 'ai-1')).toEqual(baseMessages);
  });

  it('keeps partial content and clears its streaming flag', () => {
    const messages: ChatMessage[] = [
      ...baseMessages,
      { id: 'ai-1', role: 'model', content: 'partial', timestamp: '10:00', streaming: true },
    ];

    expect(settleInterruptedAssistant(messages, 'ai-1').at(-1)).toEqual({
      id: 'ai-1',
      role: 'model',
      content: 'partial',
      timestamp: '10:00',
      streaming: false,
    });
  });

  it('does not rewrite an already completed response', () => {
    const messages: ChatMessage[] = [
      ...baseMessages,
      { id: 'ai-1', role: 'model', content: 'done', timestamp: '10:00' },
    ];

    expect(settleInterruptedAssistant(messages, 'ai-1')).toBe(messages);
  });
});
