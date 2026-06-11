/**
 * ScheduleKanbanView — 动态多列看板，严格对齐 Trello 272px 列宽
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Clock, MapPin, Move, ArrowLeft, ArrowRight, Trash2, Plus, X, Check } from 'lucide-react';
import { EventItem, ColumnId } from '../types/schedule';
import { KanbanColumn, kanbanColumnStore } from '../stores/kanbanColumnStore';
import { categoryMap } from '../config/scheduleConfig';

// 列头色点，按索引轮换
const DOT_COLORS = [
  'bg-zinc-400', 'bg-amber-500', 'bg-indigo-500', 'bg-emerald-500',
  'bg-rose-500',  'bg-sky-500',   'bg-violet-500', 'bg-orange-400',
];

interface Props {
  lang: 'zh' | 'en';
  columns: KanbanColumn[];
  activeFilteredList: EventItem[];
  dragOverColumn: ColumnId | null;
  draggingId: string | null;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onDragOverColumn: (e: React.DragEvent, col: ColumnId) => void;
  onDropColumn: (e: React.DragEvent, col: ColumnId) => void;
  onOpenEvent: (item: EventItem) => void;
  onDeleteEvent: (id: string, e: React.MouseEvent) => void;
  onShiftCard: (id: string, dir: 'back' | 'forward', e: React.MouseEvent) => void;
  onDraftHere: (colId: ColumnId) => void;
  onAddColumn: (title: string) => void;
  onRenameColumn: (id: string, title: string) => void;
  onDeleteColumn: (id: string) => void;
}

// ── 内联改名输入框 ──────────────────────────────────────────────────────────────
function ColumnTitle({ col, onRename, onDelete, dotColor, lang }: {
  col: KanbanColumn; onRename: (t: string) => void; onDelete: () => void;
  dotColor: string; lang: 'zh' | 'en';
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState(col.title);
  const inputRef              = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const commit = () => {
    const t = val.trim();
    if (t) onRename(t); else setVal(col.title);
    setEditing(false);
  };

  return (
    <div className="flex items-center justify-between pb-2.5 border-b border-[#1A1A1A]/10 mb-3 select-none group/hdr">
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
        {editing ? (
          <input ref={inputRef} value={val}
            onChange={e => setVal(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setVal(col.title); setEditing(false); } }}
            className="flex-1 min-w-0 text-[11px] font-bold tracking-wider uppercase bg-white border border-[#1A1A1A]/30 px-1 py-0 outline-none text-[#1A1A1A]"
          />
        ) : (
          <h4 onClick={() => setEditing(true)}
            className="text-[11px] font-bold tracking-wider uppercase text-[#1A1A1A] truncate cursor-text hover:text-[#1A1A1A]/70 transition-colors"
            title={lang === 'zh' ? '点击改名' : 'Click to rename'}>
            {col.title}
          </h4>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {editing && (
          <button onClick={commit} className="p-0.5 text-emerald-600 hover:bg-emerald-50">
            <Check className="w-3 h-3" />
          </button>
        )}
        <button onClick={onDelete}
          className="p-0.5 text-[#1A1A1A]/20 hover:text-red-600 opacity-0 group-hover/hdr:opacity-100 transition-all rounded-none"
          title={lang === 'zh' ? '删除此列' : 'Delete list'}>
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// ── 新增列输入 ──────────────────────────────────────────────────────────────────
function AddListButton({ lang, onAdd }: { lang: 'zh' | 'en'; onAdd: (t: string) => void }) {
  const [open, setOpen] = useState(false);
  const [val,  setVal]  = useState('');
  const inputRef        = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  const submit = () => {
    const t = val.trim();
    if (t) { onAdd(t); setVal(''); setOpen(false); }
  };

  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="shrink-0 w-[272px] h-12 flex items-center gap-2 px-3 text-[11px] font-bold tracking-widest uppercase text-[#1A1A1A]/50 hover:text-[#1A1A1A] border border-dashed border-[#1A1A1A]/15 hover:border-[#1A1A1A]/35 bg-white/60 hover:bg-white transition-all self-start">
      <Plus className="w-3.5 h-3.5" />
      {lang === 'zh' ? '添加列表' : 'Add a list'}
    </button>
  );

  return (
    <div className="shrink-0 w-[272px] p-2 border border-[#1A1A1A]/20 bg-white self-start space-y-2">
      <input ref={inputRef} value={val} onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setOpen(false); setVal(''); } }}
        placeholder={lang === 'zh' ? '输入列表名称…' : 'Enter list title…'}
        className="w-full text-xs border border-[#1A1A1A]/15 px-2 py-1.5 outline-none focus:border-[#1A1A1A]/50 bg-[#F9F8F6]"
      />
      <div className="flex items-center gap-2">
        <button onClick={submit}
          className="px-3 py-1 bg-[#1A1A1A] text-[#F9F8F6] text-[10px] font-bold tracking-widest uppercase hover:bg-[#1A1A1A]/80 transition-colors">
          {lang === 'zh' ? '添加' : 'Add list'}
        </button>
        <button onClick={() => { setOpen(false); setVal(''); }}
          className="p-1 text-[#1A1A1A]/40 hover:text-[#1A1A1A]"><X className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  );
}

// ── 主组件 ──────────────────────────────────────────────────────────────────────
export default function ScheduleKanbanView({
  lang, columns, activeFilteredList, dragOverColumn, draggingId,
  onDragStart, onDragEnd, onDragOverColumn, onDropColumn,
  onOpenEvent, onDeleteEvent, onShiftCard, onDraftHere,
  onAddColumn, onRenameColumn, onDeleteColumn,
}: Props) {
  const getColEvents = (colId: ColumnId) =>
    activeFilteredList.filter(e => (e.status || (e.completed ? 'done' : 'todo')) === colId);

  const [draggingColId, setDraggingColId] = useState<string | null>(null);
  const [colDragOver,   setColDragOver]   = useState<string | null>(null);

  const boardRef   = useRef<HTMLDivElement>(null);
  const isPanning  = useRef(false);
  const panStartX  = useRef(0);
  const panScrollL = useRef(0);

  const onBoardMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as Element).closest('button,input,textarea,[draggable="true"]')) return;
    isPanning.current  = true;
    panStartX.current  = e.clientX;
    panScrollL.current = boardRef.current?.scrollLeft ?? 0;
    if (boardRef.current) boardRef.current.style.cursor = 'grabbing';
  }, []);

  const onBoardMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning.current || !boardRef.current) return;
    e.preventDefault();
    boardRef.current.scrollLeft = panScrollL.current - (e.clientX - panStartX.current);
  }, []);

  const stopPan = useCallback(() => {
    isPanning.current = false;
    if (boardRef.current) boardRef.current.style.cursor = '';
  }, []);

  return (
    <>
      <style>{`
        #kanban-lanes-master::-webkit-scrollbar { height: 7px; }
        #kanban-lanes-master::-webkit-scrollbar-track { background: rgba(26,26,26,0.05); }
        #kanban-lanes-master::-webkit-scrollbar-thumb { background: rgba(26,26,26,0.22); border-radius: 99px; }
        #kanban-lanes-master::-webkit-scrollbar-thumb:hover { background: rgba(26,26,26,0.38); }
      `}</style>
      <div className="flex flex-row gap-2 h-full overflow-x-auto overflow-y-hidden items-start select-none"
        id="kanban-lanes-master" ref={boardRef}
        onMouseDown={onBoardMouseDown}
        onMouseMove={onBoardMouseMove}
        onMouseUp={stopPan}
        onMouseLeave={stopPan}
      >
      {columns.map((col, idx) => {
        const colEvents  = getColEvents(col.id);
        const isOver     = dragOverColumn === col.id;
        const dotColor   = DOT_COLORS[idx % DOT_COLORS.length];
        const isFirstCol = idx === 0;
        const isLastCol  = idx === columns.length - 1;

        const isColOver = colDragOver === col.id && draggingColId !== col.id;
        return (
          <div key={col.id}
            draggable
            onDragStart={e => { e.dataTransfer.setData('col-id', col.id); e.dataTransfer.effectAllowed = 'move'; setDraggingColId(col.id); }}
            onDragEnd={() => { setDraggingColId(null); setColDragOver(null); onDragEnd(); }}
            onDragOver={e => { e.preventDefault(); setColDragOver(col.id); if (!e.dataTransfer.types.includes('col-id')) onDragOverColumn(e, col.id); }}
            onDrop={e => {
              const cid = e.dataTransfer.getData('col-id');
              if (cid && cid !== col.id) { kanbanColumnStore.reorder(cid, col.id); setDraggingColId(null); setColDragOver(null); }
              else onDropColumn(e, col.id);
            }}
            className={`shrink-0 w-[272px] flex flex-col min-h-[120px] p-2 border transition-all ${
              draggingColId === col.id ? 'opacity-40 border-dashed border-[#1A1A1A]/30 bg-white' :
              isColOver ? 'border-[#1A1A1A]/50 bg-[#F4F2EE]' :
              isOver ? 'border-[#1A1A1A]/40 bg-[#F9F8F6]' : 'border-[#1A1A1A]/10 bg-white'
            }`}
          >
            <ColumnTitle col={col} dotColor={dotColor} lang={lang}
              onRename={t => onRenameColumn(col.id, t)}
              onDelete={() => onDeleteColumn(col.id)}
            />

            <div className="flex-grow space-y-2 overflow-y-auto pr-0.5">
              {colEvents.length === 0 ? (
                <div className="h-16 border border-dashed border-[#1A1A1A]/10 flex flex-col items-center justify-center text-center select-none">
                  <button type="button" onClick={() => onDraftHere(col.id)}
                    className="text-[8.5px] font-mono text-[#1A1A1A]/40 hover:text-[#1A1A1A] underline uppercase tracking-widest">
                    + {lang === 'zh' ? '签发于此' : 'Draft here'}
                  </button>
                </div>
              ) : colEvents.map(item => {
                const info      = categoryMap[item.category] || categoryMap.creative;
                const isDragging = draggingId === item.id;
                return (
                  <div key={item.id} draggable
                    onDragStart={e => { e.stopPropagation(); onDragStart(e, item.id); }} onDragEnd={e => { e.stopPropagation(); onDragEnd(); }}
                    onClick={() => onOpenEvent(item)}
                    className={`group relative border bg-white p-3 transition-all cursor-grab active:cursor-grabbing hover:shadow-sm ${
                      isDragging ? 'opacity-30 border-dashed border-[#1A1A1A]/20' : 'border-[#1A1A1A]/10 hover:border-[#1A1A1A]/25'
                    }`}
                  >
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-60 transition-opacity select-none">
                      <Move className="w-2.5 h-2.5 text-[#1A1A1A]/50" />
                    </div>

                    <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                      <span className={`text-[8px] font-mono uppercase tracking-widest px-1.5 py-0.5 border ${info.color}`}>
                        {lang === 'zh' ? info.zhLabel : info.enLabel}
                      </span>
                      <span className="text-[8px] font-mono text-[#1A1A1A]/40 flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" />{item.time}
                      </span>
                    </div>

                    <h5 className="text-[11px] font-bold text-[#1A1A1A] leading-tight mb-1 truncate">{item.title}</h5>
                    <p className="text-[9px] leading-relaxed text-[#1A1A1A]/55 italic mb-2 line-clamp-2">{item.subtitle}</p>

                    <div className="flex items-center justify-between pt-1.5 border-t border-[#1A1A1A]/5 text-[8px] font-mono text-[#1A1A1A]/40">
                      <span className="flex items-center gap-0.5 max-w-[120px] truncate">
                        <MapPin className="w-2 h-2 shrink-0" /><span className="truncate">{item.location}</span>
                      </span>
                      <span>{item.date}</span>
                    </div>

                    <div className="mt-2 pt-1.5 border-t border-neutral-100 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="flex items-center gap-1">
                        <button onClick={e => onShiftCard(item.id, 'back', e)} disabled={isFirstCol}
                          className="p-0.5 border border-[#1A1A1A]/10 text-neutral-500 hover:bg-neutral-50 disabled:opacity-20">
                          <ArrowLeft className="w-2.5 h-2.5" />
                        </button>
                        <button onClick={e => onShiftCard(item.id, 'forward', e)} disabled={isLastCol}
                          className="p-0.5 border border-[#1A1A1A]/10 text-neutral-500 hover:bg-neutral-50 disabled:opacity-20">
                          <ArrowRight className="w-2.5 h-2.5" />
                        </button>
                      </div>
                      <button type="button" onClick={e => onDeleteEvent(item.id, e)}
                        className="p-0.5 text-red-700 hover:bg-red-50 transition-all">
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 列底部快速新增 */}
            <button onClick={() => onDraftHere(col.id)}
              className="mt-2 w-full flex items-center gap-1.5 px-1 py-1 text-[9px] font-mono text-[#1A1A1A]/35 hover:text-[#1A1A1A]/70 hover:bg-[#F9F8F6] transition-colors">
              <Plus className="w-3 h-3" />{lang === 'zh' ? '添加卡片' : 'Add a card'}
            </button>
          </div>
        );
      })}

      {/* + Add a list */}
      <AddListButton lang={lang} onAdd={onAddColumn} />
      </div>
    </>
  );
}
