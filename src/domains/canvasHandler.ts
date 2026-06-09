/**
 * canvasHandler — CANVAS 文档/画板 domain handler
 *
 * 触发语："写/新建/记 + 文档/笔记/草稿/报告" 或 "画板/canvas"
 * eagerCard 模式：立即建文档，L3 编辑器自动打开。
 */
import { ActionCard } from '../types/chat';
import { canvasStore, CanvasDoc, CanvasType } from '../stores/canvasStore';
import { DomainHandler, DomainActionResult } from './types';
import { localDateStr } from '../utils/date';

// ─── Intent ───────────────────────────────────────────────────────────────────

const DOC_VERBS  = ['写', '新建', '创建', '记', '起草', '整理', '写个', '写一篇', '写一个'];
const DOC_NOUNS  = ['文档', '笔记', '草稿', '报告', 'markdown', '.md'];
const CANVAS_KW  = ['画板', '白板', '流程图', '思维导图', '脑图', 'canvas', 'excalidraw'];

function detectCanvasIntent(text: string): string | null {
  const t = text.toLowerCase();
  const hasCanvasKw = CANVAS_KW.some(k => t.includes(k));
  if (hasCanvasKw) return 'canvas';
  const hasVerb = DOC_VERBS.some(k => text.includes(k));
  const hasNoun = DOC_NOUNS.some(k => t.includes(k));
  if (hasVerb && hasNoun) return 'doc';
  return null;
}

// ─── Extraction helpers ───────────────────────────────────────────────────────

function extractTitle(text: string): string {
  // "写一篇关于花胶鸡的报告" → "花胶鸡"
  const m = text.match(/(?:写|新建|创建|记|起草)(?:一篇|一个|个)?\s*(?:关于|关于内容|有关)?\s*(.{2,20}?)(?:的|文档|笔记|草稿|报告|$)/);
  if (m?.[1]) return m[1].trim();
  // 兜底：取去掉触发词后的前 10 字
  return text.replace(/写|新建|创建|记|起草|文档|笔记|草稿|报告|画板|白板|canvas/gi, '').trim().slice(0, 16) || '无标题';
}

function makeDoc(text: string, type: CanvasType): CanvasDoc {
  const now = new Date().toISOString();
  return {
    id:        `canvas-${Date.now()}`,
    title:     extractTitle(text),
    content:   '',
    type,
    scope:     'self',
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Card builder ─────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<CanvasType, string> = { doc: '文档', canvas: '画板' };

function buildCard(action: ActionCard['action'], doc: CanvasDoc): ActionCard {
  const wordCount = doc.content.trim().split(/\s+/).filter(Boolean).length;
  return {
    module: 'CANVAS',
    action,
    title:  doc.title,
    meta:   [
      doc.type,                                        // focusText（左大字：文档/画板）
      TYPE_LABEL[doc.type],                            // focusSub（左小字）
      ...(wordCount > 0 ? [`${wordCount}字`] : []),   // tag：字数
      localDateStr(new Date(doc.updatedAt)),           // tag：日期
    ],
    id: doc.id,
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export const canvasHandler: DomainHandler = {
  module:    'CANVAS',
  dominates: [],

  detectIntent: detectCanvasIntent,

  enrichMessage(text, intent, lang) {
    const today = localDateStr(new Date());
    const suffix = lang === 'zh'
      ? `\n\n[系统] 今天是 ${today}。用户要新建一个${intent === 'canvas' ? '画板' : 'Markdown 文档'}，请简短确认并告知已建立，无需生成 JSON。`
      : `\n\n[System] Today is ${today}. User wants a new ${intent === 'canvas' ? 'canvas' : 'Markdown document'}. Confirm briefly, no JSON.`;
    return text + suffix;
  },

  buildContext() {
    const recent = canvasStore.getRecent(3);
    if (!recent.length) return undefined;
    return recent.map(d => ({
      id:    d.id,
      title: `[${TYPE_LABEL[d.type]}] ${d.title}`,
      date:  localDateStr(new Date(d.updatedAt)),
      time:  '',
    }));
  },

  eagerCard(text, _lang): ActionCard | null {
    const intent = detectCanvasIntent(text);
    if (!intent) return null;
    const type: CanvasType = intent === 'canvas' ? 'canvas' : 'doc';
    const doc = makeDoc(text, type);
    canvasStore.add(doc);
    return buildCard('create', doc);
  },

  handleAction(action, ev, _lang): DomainActionResult | null {
    if (action !== 'create') return null;
    const doc = makeDoc(ev?.title ?? '', ev?.type === 'canvas' ? 'canvas' : 'doc');
    if (ev?.title) doc.title = ev.title;
    canvasStore.add(doc);
    return { card: buildCard('create', doc) };
  },

  resolveConfirmation: () => null,
  handleStreamResult:  () => null,
};
