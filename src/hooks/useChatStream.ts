import { useState, useCallback } from 'react';
import { ChatMessage } from '../types/chat';
import { ModelId } from '../config/models';
import { sendToGateway, readSSEStream } from '../services/chatService';
import { askPredictionExpert } from '../services/predictService';
import {
  scheduleStore,
  detectScheduleIntent,
  enrichMessageForSchedule,
} from '../stores/scheduleStore';

// Typewriter delays (ms) — gives the "mechanical typewriter" feel
const DELAY = {
  sentenceEnd: () => 300 + Math.random() * 250,
  comma:       () => 120 + Math.random() * 100,
  newline:     () => 200 + Math.random() * 200,
  rare:        () => 100 + Math.random() * 150,  // 5% chance
  normal:      () => 30  + Math.random() * 25,
};

function charDelay(char: string): number {
  if ('。！？…'.includes(char)) return DELAY.sentenceEnd();
  if ('，、；：'.includes(char)) return DELAY.comma();
  if (char === '\n')             return DELAY.newline();
  if (Math.random() < 0.05)     return DELAY.rare();
  return DELAY.normal();
}

interface UseChatStreamReturn {
  isLoading: boolean;
  /** onScheduleAdded fires when the AI response contains a ```schedule``` block */
  send: (opts: {
    text: string;
    model: ModelId;
    history: ChatMessage[];
    lang: 'zh' | 'en';
    onToken:          (fullText: string) => void;
    onDone:           (fullText: string) => void;
    onError:          (errMsg: string)   => void;
    onScheduleAdded?: (title: string)    => void;
  }) => Promise<void>;
}

export function useChatStream(): UseChatStreamReturn {
  const [isLoading, setIsLoading] = useState(false);

  const send = useCallback(async ({
    text, model, history, lang,
    onToken, onDone, onError, onScheduleAdded,
  }: Parameters<UseChatStreamReturn['send']>[0]) => {
    setIsLoading(true);

    try {
      // 1. Try local prediction expert first
      const localAnswer = await askPredictionExpert(text);
      if (localAnswer) {
        setIsLoading(false);
        onDone(localAnswer);
        return;
      }

      // 2. Detect schedule intent and enrich message
      const intent = detectScheduleIntent(text);
      const enrichedText = enrichMessageForSchedule(text, intent, lang);

      // 3. Build message history for API
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: text,          // store original, not enriched
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      const apiMessages = [...history, { ...userMsg, content: enrichedText }];

      // 4. Call gateway
      const response = await sendToGateway(model, apiMessages);
      setIsLoading(false);

      const contentType = response.headers.get('content-type') ?? '';

      if (contentType.includes('text/event-stream')) {
        // ── Streaming path ──────────────────────────────────────
        let fullText = '';
        for await (const delta of readSSEStream(response)) {
          for (const char of delta) {
            fullText += char;
            onToken(fullText + '▍');
            await new Promise(r => setTimeout(r, charDelay(char)));
          }
        }
        // Check for schedule block in final response
        if (intent === 'add') {
          const event = scheduleStore.parseFromAIResponse(fullText);
          if (event) {
            scheduleStore.add(event);
            window.dispatchEvent(new CustomEvent('schedule-updated'));
            onScheduleAdded?.(event.title);
          }
        }
        onDone(fullText || '…');
      } else {
        // ── Non-streaming fallback ───────────────────────────────
        const data = await response.json();
        const reply = data.text ?? (lang === 'zh' ? '抱歉，未返回有效回复。' : 'Empty response.');
        if (intent === 'add') {
          const event = scheduleStore.parseFromAIResponse(reply);
          if (event) {
            scheduleStore.add(event);
            window.dispatchEvent(new CustomEvent('schedule-updated'));
            onScheduleAdded?.(event.title);
          }
        }
        onDone(reply);
      }
    } catch (err) {
      setIsLoading(false);
      onError(
        lang === 'zh'
          ? '⚠️ **通讯失败**：模型响应超时或连接中断，请稍后重试。'
          : '⚠️ **Connection Failed**: Model timed out or was interrupted. Please retry.'
      );
    }
  }, []);

  return { isLoading, send };
}
