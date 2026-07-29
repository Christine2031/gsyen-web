import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { bindClientDisconnect, unsentCompletionText } from './codexChatStream';

describe('unsentCompletionText', () => {
  it('forwards a completion that produced no streaming delta', () => {
    expect(unsentCompletionText('本次桥接已完成', false)).toBe('本次桥接已完成');
  });

  it('does not duplicate text that was already streamed', () => {
    expect(unsentCompletionText('已经发送', true)).toBeNull();
  });

  it('provides a deterministic response for an empty completion', () => {
    expect(unsentCompletionText('  ', false)).toBe('我在，但这次没有生成有效回复。');
  });
});

describe('bindClientDisconnect', () => {
  function requestResponsePair() {
    const req = Object.assign(new EventEmitter(), { aborted: false });
    const res = Object.assign(new EventEmitter(), { destroyed: false, writableEnded: false });
    return { req, res };
  }

  it('does not treat normal request completion as a client disconnect', () => {
    const { req, res } = requestResponsePair();
    const onDisconnect = vi.fn();
    const cleanup = bindClientDisconnect(req as any, res as any, onDisconnect);

    req.emit('close');

    expect(onDisconnect).not.toHaveBeenCalled();
    cleanup();
  });

  it('aborts on a request abort or premature response close', () => {
    const first = requestResponsePair();
    const firstDisconnect = vi.fn();
    bindClientDisconnect(first.req as any, first.res as any, firstDisconnect);
    first.req.emit('aborted');
    expect(firstDisconnect).toHaveBeenCalledTimes(1);

    const second = requestResponsePair();
    const secondDisconnect = vi.fn();
    bindClientDisconnect(second.req as any, second.res as any, secondDisconnect);
    second.res.emit('close');
    expect(secondDisconnect).toHaveBeenCalledTimes(1);
  });

  it('ignores the response close after a completed response', () => {
    const { req, res } = requestResponsePair();
    const onDisconnect = vi.fn();
    bindClientDisconnect(req as any, res as any, onDisconnect);
    res.writableEnded = true;
    res.emit('close');
    expect(onDisconnect).not.toHaveBeenCalled();
  });
});
