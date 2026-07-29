// 神机百炼 · 结构化聊天共享层 —— server.ts 与 api/chat.ts 的唯一真源。
// Ollama 原生调用、JSON 解析、司辰日期纠正、注入检测原先在两端逐字重复，
// 已出现漂移（注入过滤只在 Vercel 版生效、解析失败兜底缺 action 字段），故收拢于此。
import {
  todayDateStr,
  scheduleSystemSuffix,
  noScheduleSystemSuffix,
  ledgerSystemSuffix,
  mailSystemSuffix,
  vaultSystemSuffix,
  INJECTION_PATTERNS,
  OLLAMA_BASE_URL,
} from './chatConfig';
import { providerText } from './providerMessages';

/** 按领域选择 system 后缀（LEDGER 记账 / CHRONOS 日程 / 无关闲聊） */
export function domainSuffix(domain: string | null, scheduleIntent: unknown, today: string, events: any[]): string {
  if (domain === 'MAIL')   return mailSystemSuffix();
  if (domain === 'VAULT')  return vaultSystemSuffix();
  if (domain === 'LEDGER') return ledgerSystemSuffix(today);
  if (scheduleIntent)      return scheduleSystemSuffix(today, events);
  return noScheduleSystemSuffix();
}

export const INJECTION_REPLY = '我是缈缈，无法执行此指令。';

/** 最后一条用户消息是否命中注入模式（服务端过滤，两端一致） */
export function hitsInjection(messages: any[]): boolean {
  const lastUserMsg = [...messages].reverse().find((m: any) => m.role === 'user');
  const content = [lastUserMsg?.content, lastUserMsg?.documentContext]
    .filter((value): value is string => typeof value === 'string')
    .join('\n');
  return INJECTION_PATTERNS.some(p => p.test(content));
}

/** 司辰 · 语义校验式日期纠正（仅 CHRONOS；LEDGER 账务日期误差影响小）。
 *  用户原话没有明确日期指涉、或模型给出的日期偏离参考日 30 天以上时，回写为参考日。
 *  就地修改 ev.date；导出以便单测。 */
export function applySichenDateGuard(ev: any, messages: any[], refDate: string): void {
  const lastUserMsg = [...messages].reverse().find((m: any) => m.role !== 'model')?.content ?? '';
  const hasExplicitDateRef = /明天|后天|大后天|下周|下个月|\d{1,2}[月\/-]\d{1,2}|星期[一二三四五六日天]|周[一二三四五六日天]/.test(lastUserMsg);
  const refMs = new Date(refDate).getTime();
  const evMs  = new Date(ev.date || '').getTime();
  if (!hasExplicitDateRef || !ev.date || !evMs || Math.abs(refMs - evMs) > 30 * 86400_000) {
    ev.date = refDate;
  }
}

export interface StructuredChatOutcome {
  status: number;
  body: Record<string, unknown>;
}

/** Ollama JSON mode（ethan / fast）— 原生 /api/chat 接口。
 *  OpenAI 兼容层不可靠，原生接口的 format:"json" 强制返回合法 JSON。
 *  返回 {status, body}，由调用方按各自运行时（Express / Edge）封装响应。 */
export async function runOllamaStructuredChat(opts: {
  model: string;
  modelId: string;
  systemPrompt: string;
  messages: any[];
  events?: any[];
  clientDate?: string;
  scheduleIntent?: unknown;
  domain?: string | null;
}): Promise<StructuredChatOutcome> {
  const { model, modelId, systemPrompt, messages, events = [], clientDate, scheduleIntent = null, domain = null } = opts;
  const today = clientDate || todayDateStr();

  const ollamaPayload = [
    { role: 'system', content: systemPrompt + domainSuffix(domain, scheduleIntent, today, events) },
    ...messages.map((m: any) => ({ role: m.role === 'model' ? 'assistant' : 'user', content: providerText(m) })),
  ];

  const ollamaRes = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelId,
      messages: ollamaPayload,
      stream: false,
      format: 'json',
      options: { temperature: 0.3 },  // 基座兜底：降温提升字段抽取一致性
    }),
    signal: AbortSignal.timeout(120_000), // 上游挂起时不无限等待
  });

  if (!ollamaRes.ok) {
    const err = await ollamaRes.text().catch(() => ollamaRes.statusText);
    return { status: 502, body: { error: `${model} API error: ${err}` } };
  }

  const ollamaData = await ollamaRes.json();
  const rawContent = ollamaData.message?.content ?? '{}';
  try {
    const parsed = JSON.parse(rawContent);
    // 只信任模型显式给出的 action，不靠 event.title 是否非空推断意图。
    const action = parsed.action ?? (parsed.shouldCreateEvent ? 'create' : 'none');
    const hasPayload = parsed.event?.title || parsed.event?.description || parsed.event?.amount !== undefined;
    const ev = (action !== 'none' && hasPayload) ? parsed.event : null;

    if (ev && domain !== 'LEDGER') applySichenDateGuard(ev, messages, today);

    return { status: 200, body: { text: parsed.reply ?? rawContent, action, event: ev } };
  } catch {
    return { status: 200, body: { text: rawContent, action: 'none', event: null } };
  }
}
