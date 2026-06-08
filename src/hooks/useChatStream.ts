import { useState, useCallback, useRef } from 'react';
import { ChatMessage, ActionCard } from '../types/chat';
import { ModelId } from '../config/models';
import { sendToGateway, readSSEStream } from '../services/chatService';
import { askPredictionExpert } from '../services/predictService';
import { domainHandlers } from '../domains/registry';
import { DomainHandler, DomainActionResult } from '../domains/types';

// Models that return application/json with {text, action, event} instead of SSE.
const STRUCTURED_MODELS = new Set<ModelId>(['gemini', 'ethan', 'fast'] as ModelId[]);

export type ScheduleActionType = 'create' | 'update' | 'delete' | 'query';

// 用户确认/否认短语
const CONFIRM_WORDS = ['是', '好', '建', '确认', '对', '要', '行', '加', 'yes', 'ok', 'sure', 'yeah', 'yep'];
const DENY_WORDS    = ['不', '算', '取消', '否', '不要', '不用', 'no', 'nope', 'cancel'];

function isConfirmation(text: string): boolean {
  const t = text.trim().toLowerCase();
  return CONFIRM_WORDS.some(w => t === w || (t.startsWith(w) && t.length <= 5));
}
function isDenial(text: string): boolean {
  const t = text.trim().toLowerCase();
  return DENY_WORDS.some(w => t.startsWith(w));
}

// Typewriter delays (ms)
const DELAY = {
  sentenceEnd: () => 300 + Math.random() * 250,
  comma:       () => 120 + Math.random() * 100,
  newline:     () => 200 + Math.random() * 200,
  rare:        () => 100 + Math.random() * 150,
  normal:      () => 30  + Math.random() * 25,
};

function charDelay(char: string): number {
  if ('。！？…'.includes(char)) return DELAY.sentenceEnd();
  if ('，、；：'.includes(char)) return DELAY.comma();
  if (char === '\n')             return DELAY.newline();
  if (Math.random() < 0.05)     return DELAY.rare();
  return DELAY.normal();
}

async function typewrite(text: string, onToken: (t: string) => void): Promise<void> {
  let displayed = '';
  for (const char of text) {
    displayed += char;
    onToken(displayed + '▍');
    await new Promise(r => setTimeout(r, charDelay(char)));
  }
}

interface UseChatStreamReturn {
  isLoading: boolean;
  send: (opts: {
    text: string;
    model: ModelId;
    history: ChatMessage[];
    lang: 'zh' | 'en';
    onToken:           (fullText: string) => void;
    onDone:            (fullText: string) => void;
    onError:           (errMsg: string)   => void;
    onScheduleAction?: (action: ScheduleActionType, title: string) => void;
    onActionCard?:     (card: ActionCard) => void;
  }) => Promise<void>;
}

/** Stashed cross-turn confirmation: which handler raised it + its payload. */
interface PendingConfirmation {
  handler: DomainHandler;
  pending: unknown;
}

export function useChatStream(): UseChatStreamReturn {
  const [isLoading, setIsLoading] = useState(false);
  const pendingConfirmation = useRef<PendingConfirmation | null>(null);

  const send = useCallback(async ({
    text, model, history, lang,
    onToken, onDone, onError, onScheduleAction, onActionCard,
  }: Parameters<UseChatStreamReturn['send']>[0]) => {
    setIsLoading(true);

    /** Apply a domain handler's result: render card, notify, optionally typewrite a reply. */
    const applyResult = async (result: DomainActionResult | null): Promise<boolean> => {
      if (!result) return false;
      if (result.card) onActionCard?.(result.card);
      if (result.notify) onScheduleAction?.(result.notify.action, result.notify.title);
      if (result.reply) {
        await typewrite(result.reply, onToken);
        setIsLoading(false);
        onDone(result.reply);
        return true;
      }
      return false;
    };

    try {
      // 1. Local prediction expert
      const localAnswer = await askPredictionExpert(text);
      if (localAnswer) {
        setIsLoading(false);
        onDone(localAnswer);
        return;
      }

      // 2. 待确认行程处理
      if (pendingConfirmation.current) {
        const { handler, pending } = pendingConfirmation.current;
        pendingConfirmation.current = null;
        if (isConfirmation(text)) {
          const result = handler.resolveConfirmation(pending, lang);
          if (await applyResult(result)) return;
        } else if (isDenial(text)) {
          // dropped — fall through to normal handling
        }
      }

      const isStructured = STRUCTURED_MODELS.has(model);

      // 3. 意图探测（所有模型都做：结构化模型用它决定是否注入域 system 后缀，
      //    SSE 模型额外用它来增强消息文本）
      let enrichedText = text;
      let streamHandler: DomainHandler | null = null;
      let streamIntent: string | null = null;
      for (const handler of domainHandlers) {
        const intent = handler.detectIntent(text);
        if (intent) {
          streamHandler = handler;
          streamIntent = intent;
          if (!isStructured) enrichedText = handler.enrichMessage(text, intent, lang);
          break;
        }
      }

      // 4. Build history
      const userMsg: ChatMessage = {
        id:        `user-${Date.now()}`,
        role:      'user',
        content:   text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      const apiMessages = [...history, { ...userMsg, content: enrichedText }];

      // 5. 结构化模型带域上下文（首个提供上下文的 handler 生效）
      const eventsCtx = isStructured
        ? domainHandlers.map(h => h.buildContext()).find((ctx): ctx is NonNullable<typeof ctx> => ctx != null)
        : undefined;

      const response = await sendToGateway(model, apiMessages, eventsCtx, streamIntent);
      setIsLoading(false);

      const contentType = response.headers.get('content-type') ?? '';

      if (contentType.includes('text/event-stream')) {
        // ── SSE 流式路径 ─────────────────────────────────────────
        let fullText = '';
        for await (const delta of readSSEStream(response)) {
          for (const char of delta) {
            fullText += char;
            onToken(fullText + '▍');
            await new Promise(r => setTimeout(r, charDelay(char)));
          }
        }
        if (streamHandler && streamIntent) {
          await applyResult(streamHandler.handleStreamResult(streamIntent, fullText));
        }
        onDone(fullText || '…');

      } else {
        // ── 神机百炼结构化路径 ───────────────────────────────────
        const data   = await response.json();
        const reply  = data.text   ?? (lang === 'zh' ? '抱歉，未返回有效回复。' : 'Empty response.');
        const action = data.action ?? 'none';
        const ev     = data.event;

        // 司辰 · 防幻觉守卫：结构化模型(尤其本地小模型)即便判定 action!=='none'，
        // 也可能对寒暄等无关消息幻觉出 event。只有用户原话本身命中某个领域的
        // 意图关键词时，才信任模型给出的 action，否则一律按 'none' 处理。
        if (action !== 'none' && streamIntent) {
          for (const handler of domainHandlers) {
            const result = handler.handleAction(action, ev, lang);
            if (result) {
              if (result.pending) {
                pendingConfirmation.current = { handler, pending: result.pending };
              } else {
                if (result.card) onActionCard?.(result.card);
                if (result.notify) onScheduleAction?.(result.notify.action, result.notify.title);
              }
              break;
            }
          }
        }

        await typewrite(reply, onToken);
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
