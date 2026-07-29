import { describe, expect, it } from 'vitest';
import { validateChatRequestBody } from './chatRequest';

const userMessage = {
  role: 'user',
  content: 'hello',
  attachments: [],
};

describe('chat request boundary', () => {
  it('accepts the existing Web and Electron request shape', () => {
    expect(validateChatRequestBody({
      model: 'kimi',
      messages: [userMessage],
      events: [],
      clientDate: '2026-07-29',
      scheduleIntent: null,
      domain: null,
      chatGptModel: null,
    })).toEqual({ ok: true });
  });

  it('rejects oversized history before a model call', () => {
    const result = validateChatRequestBody({
      messages: Array.from({ length: 81 }, () => userMessage),
    });
    expect(result).toMatchObject({
      ok: false,
      status: 413,
      code: 'CHAT_REQUEST_TOO_LARGE',
    });
  });

  it('rejects malformed image payloads and unknown domains', () => {
    expect(validateChatRequestBody({
      messages: [{
        ...userMessage,
        attachments: [{ type: 'image', dataUrl: 'https://example.com/private.png' }],
      }],
    })).toMatchObject({ ok: false, status: 400 });

    expect(validateChatRequestBody({
      messages: [userMessage],
      domain: 'SYSTEM_OVERRIDE',
    })).toMatchObject({ ok: false, status: 400 });
  });

  it('rejects oversized or malformed attachment metadata before serialization', () => {
    expect(validateChatRequestBody({
      messages: [{
        ...userMessage,
        attachments: [{
          type: 'image',
          name: 'n'.repeat(600_001),
          dataUrl: 'data:image/png;base64,',
        }],
      }],
    })).toMatchObject({
      ok: false,
      status: 413,
      code: 'CHAT_REQUEST_TOO_LARGE',
    });

    expect(validateChatRequestBody({
      messages: [{
        ...userMessage,
        attachments: [{
          type: 'image',
          mimeType: { invalid: true },
          dataUrl: 'data:image/png;base64,',
        }],
      }],
    })).toMatchObject({
      ok: false,
      status: 400,
      code: 'INVALID_CHAT_REQUEST',
    });
  });
});
