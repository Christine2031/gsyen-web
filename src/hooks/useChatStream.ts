import { useState, useCallback } from 'react';
import { ChatMessage } from '../types/chat';
import { ModelId } from '../config/models';
import { EventItem } from '../types/schedule';
import { sendToGateway, readSSEStream } from '../services/chatService';
import { askPredictionExpert } from '../services/predictService';
import {
  scheduleStore,
  detectScheduleIntent,
  enrichMessageForSchedule,
} from '../stores/scheduleStore';

// Models that return application/json with {text, event} instead of SSE.
// These use native structured output (Gemini responseSchema / Ollama json_object).
const STRUCTURED_MODELS = new Set<ModelId>(['gemini', 'ethan', 'fast'] as ModelId[]);

/** Build a ready-to-save EventItem from raw AI structured data. */
function buildEventItem(data: any): EventItem {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return {
    id: `ai-${Date.now()}`,
    title:    data.title,
    subtitle: data.subtitle  || '',
    time:     data.time      || '09:00',
    date:     data.date      || todayStr,
    endDate:  data.endDate   || data.date || todayStr,
    category: data.category  || 'strategy',
    location: data.location  || '',
    completed: false,
    status:   'todo',
  };
}

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

      // 2. Detect schedule intent and enrich message.
      //    SSE models: full enrichment (schedule block instructions).
      //    Structured models (gemini/ethan/fast): still detect intent; if 'add',
      //    append a short hint so the model reliably sets shouldCreateEvent:true.
      const isStructured = STRUCTURED_MODELS.has(model);
      const intent = detectScheduleIntent(text);
      let enrichedText: string;
      if (isStructured && intent === 'add') {
        enrichedText = text + '\n[系统提示：上面这句话包含日程安排意图，请务必将 shouldCreateEvent 置为 true 并填写 event 字段。]';
      } else if (!isStructured && intent) {
        enrichedText = enrichMessageForSchedule(text, intent, lang);
      } else {
        enrichedText = text;
      }

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
        // ── Non-streaming / structured-output path ───────────────
        const data = await response.json();
        const reply = data.text ?? (lang === 'zh' ? '抱歉，未返回有效回复。' : 'Empty response.');

        // Structured-output models (gemini/ethan/fast): server returns {text, event}
        if (data.event?.title) {
          const eventItem = buildEventItem(data.event);
          scheduleStore.add(eventItem);
          window.dispatchEvent(new CustomEvent('schedule-updated'));
          onScheduleAdded?.(eventItem.title);
        } else if (intent === 'add') {
          // Fallback for SSE models that returned JSON for some reason
          const event = scheduleStore.parseFromAIResponse(reply);
          if (event) {
            scheduleStore.add(event);
            window.dispatchEvent(new CustomEvent('schedule-updated'));
            onScheduleAdded?.(event.title);
          }
        }

        // Simulate typewriter effect on the reply text
        let displayed = '';
        for (const char of reply) {
          displayed += char;
          onToken(displayed + '▍');
          await new Promise(r => setTimeout(r, charDelay(char)));
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
