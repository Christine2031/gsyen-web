/**
 * CanvasExpandContent — CANVAS 卡片 L2 展开面板
 * 显示文档预览 + 进入 L3 编辑器的入口。
 */
import { useState, useEffect } from 'react';
import { FileText, LayoutDashboard, ExternalLink, Trash2 } from 'lucide-react';
import { CardColor } from './cardConstants';
import { canvasStore, CanvasDoc } from '../stores/canvasStore';
import ReactMarkdown from 'react-markdown';

interface Props {
  lang:          'zh' | 'en';
  color:         CardColor;
  docId:         string | undefined;
  expanded:      boolean;
  scope:         'self' | 'shared';
  onScopeChange: (s: 'self' | 'shared') => void;
  onCollapse:    () => void;
  onOpenEditor:  () => void;   // 触发 L3
}

export function CanvasExpandContent({
  lang, color: C, docId, expanded, scope, onScopeChange, onCollapse, onOpenEditor,
}: Props) {
  const zh = lang === 'zh';
  const [doc, setDoc] = useState<CanvasDoc | null>(() =>
    docId ? (canvasStore.getById(docId) ?? null) : null
  );

  useEffect(() => {
    const sync = () => { if (docId) setDoc(canvasStore.getById(docId) ?? null); };
    window.addEventListener('canvas-updated', sync);
    return () => window.removeEventListener('canvas-updated', sync);
  }, [docId]);

  useEffect(() => { if (!expanded) {} }, [expanded]);

  const preview = doc?.content?.trim().slice(0, 300) || '';
  const TypeIcon = doc?.type === 'canvas' ? LayoutDashboard : FileText;

  return (
    <div className={`grid transition-[grid-template-rows] duration-[360ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${expanded && doc ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
      <div className="overflow-hidden">
        <div className={`border-t ${C.panelBorder} px-4 pt-3 pb-4 space-y-3`} onClick={e => e.stopPropagation()}>

          {/* 文档信息行 */}
          <div className="flex items-center gap-2">
            <TypeIcon className={`w-3 h-3 shrink-0 ${C.panelLabel}`} />
            <span className={`font-mono text-[9px] tracking-widest uppercase ${C.panelLabel}`}>
              {doc?.type === 'canvas' ? (zh ? '画板' : 'Canvas') : (zh ? '文档' : 'Document')}
            </span>
            <span className={`ml-auto font-mono text-[9px] ${C.panelLabel}`}>
              {doc ? new Date(doc.updatedAt).toLocaleDateString('zh-CN') : '—'}
            </span>
          </div>

          {/* 内容预览 */}
          <div className={`rounded-[3px] border ${C.panelBorder} px-3 py-2.5 min-h-[60px] max-h-[120px] overflow-hidden`}>
            {preview ? (
              <div className={`prose prose-xs max-w-none text-[11px] leading-relaxed ${C.panelText} line-clamp-5`}>
                <ReactMarkdown>{preview}</ReactMarkdown>
              </div>
            ) : (
              <span className={`font-mono text-[10px] italic ${C.panelLabel}`}>
                {zh ? '空文档，点击编辑开始创作…' : 'Empty document, click to start writing…'}
              </span>
            )}
          </div>

          {/* 字数统计 */}
          {doc?.content && (
            <div className={`font-mono text-[9px] ${C.panelLabel}`}>
              {doc.content.trim().split(/\s+/).filter(Boolean).length} {zh ? '词' : 'words'}
              &nbsp;·&nbsp;
              {doc.content.length} {zh ? '字符' : 'chars'}
            </div>
          )}

          {/* 底部操作 */}
          <div className="flex items-center justify-between pt-0.5">
            {/* 个人/团队 */}
            <div className="flex gap-1.5">
              {(['self', 'shared'] as const).map(s => (
                <button key={s} onClick={() => onScopeChange(s)}
                  className={`px-3 py-1.5 rounded-md font-mono text-[9px] uppercase tracking-widest transition-all ${
                    scope === s ? C.btnPrimary : C.btnGhost
                  }`}>
                  {s === 'self' ? (zh ? '个人' : 'Personal') : (zh ? '团队' : 'Team')}
                </button>
              ))}
            </div>
            {/* 编辑 / 删除 */}
            <div className="flex gap-1.5">
              <button onClick={onOpenEditor}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-[2px] text-[9px] font-mono ${C.btnPrimary}`}>
                <ExternalLink className="w-2.5 h-2.5" />{zh ? '打开编辑' : 'Edit'}
              </button>
              <button onClick={() => { canvasStore.remove(doc!.id); onCollapse(); }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[2px] text-[9px] font-mono ${C.btnDanger}`}>
                <Trash2 className="w-2.5 h-2.5" />{zh ? '删除' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
