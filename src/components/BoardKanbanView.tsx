/**
 * BoardKanbanView — 基于对话的看板视图
 * 每个 session = 一个 board，卡片类型为轻量 KanbanCard（无日历字段）
 */
import React, { useState, useRef, useEffect } from 'react';
import { Plus, X, Check, Move, ArrowLeft, ArrowRight, Trash2 } from 'lucide-react';
import { KanbanColumn } from '../stores/kanbanColumnStore';
import { KanbanCard } from '../stores/kanbanCardStore';

const DOT_COLORS = [
  'bg-zinc-400','bg-amber-500','bg-indigo-500','bg-emerald-500',
  'bg-rose-500', 'bg-sky-500',  'bg-violet-500','bg-orange-400',
];

// ── 列头（可内联改名） ──────────────────────────────────────────────────────────
function ColHeader({ col, dotColor, onRename, onDelete }: {
  col: KanbanColumn; dotColor: string;
  onRename: (t: string) => void; onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(col.title);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) ref.current?.select(); }, [editing]);
  const commit = () => { const t = val.trim(); if (t) onRename(t); else setVal(col.title); setEditing(false); };
  return (
    <div className="flex items-center justify-between pb-2 border-b border-[#1A1A1A]/10 mb-2 group/ch select-none">
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
        {editing
          ? <input ref={ref} value={val} onChange={e => setVal(e.target.value)}
              onBlur={commit} onKeyDown={e => { if (e.key==='Enter') commit(); if (e.key==='Escape') { setVal(col.title); setEditing(false); } }}
              className="flex-1 text-[11px] font-bold tracking-wider uppercase bg-white border border-[#1A1A1A]/30 px-1 outline-none" />
          : <span onClick={() => setEditing(true)}
              className="text-[11px] font-bold tracking-wider uppercase text-[#1A1A1A] truncate cursor-text">{col.title}</span>
        }
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        {editing && <button onClick={commit} className="p-0.5 text-emerald-600"><Check className="w-3 h-3"/></button>}
        <button onClick={onDelete} className="p-0.5 text-[#1A1A1A]/20 hover:text-red-500 opacity-0 group-hover/ch:opacity-100 transition-all">
          <X className="w-3 h-3"/>
        </button>
      </div>
    </div>
  );
}

// ── 新建卡片输入 ────────────────────────────────────────────────────────────────
function AddCardInput({ onAdd }: { onAdd: (title: string, desc: string) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [desc,  setDesc]  = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) ref.current?.focus(); }, [open]);
  const submit = () => { if (title.trim()) { onAdd(title.trim(), desc.trim()); setTitle(''); setDesc(''); setOpen(false); } };
  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="mt-1.5 w-full flex items-center gap-1.5 px-1 py-1 text-[9px] font-mono text-[#1A1A1A]/35 hover:text-[#1A1A1A]/70 hover:bg-[#F9F8F6] transition-colors">
      <Plus className="w-3 h-3"/>添加卡片
    </button>
  );
  return (
    <div className="mt-1.5 space-y-1.5 p-1.5 border border-[#1A1A1A]/10 bg-[#F9F8F6]">
      <input ref={ref} value={title} onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key==='Enter') submit(); if (e.key==='Escape') setOpen(false); }}
        placeholder="卡片标题…"
        className="w-full text-xs border border-[#1A1A1A]/15 px-2 py-1 outline-none focus:border-[#1A1A1A]/40 bg-white" />
      <input value={desc} onChange={e => setDesc(e.target.value)}
        onKeyDown={e => { if (e.key==='Enter') submit(); if (e.key==='Escape') setOpen(false); }}
        placeholder="描述（可选）…"
        className="w-full text-[10px] border border-[#1A1A1A]/10 px-2 py-1 outline-none bg-white text-[#1A1A1A]/70" />
      <div className="flex gap-1.5">
        <button onClick={submit} className="px-2 py-0.5 bg-[#1A1A1A] text-[#F9F8F6] text-[9px] font-bold tracking-widest uppercase">添加</button>
        <button onClick={() => setOpen(false)} className="p-0.5 text-[#1A1A1A]/40 hover:text-[#1A1A1A]"><X className="w-3 h-3"/></button>
      </div>
    </div>
  );
}

// ── 新增列按钮 ──────────────────────────────────────────────────────────────────
function AddListBtn({ onAdd }: { onAdd: (t: string) => void }) {
  const [open, setOpen] = useState(false);
  const [val, setVal]   = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) ref.current?.focus(); }, [open]);
  const submit = () => { if (val.trim()) { onAdd(val.trim()); setVal(''); setOpen(false); } };
  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="shrink-0 w-[272px] h-10 flex items-center gap-2 px-3 text-[10px] font-bold tracking-widest uppercase text-[#1A1A1A]/40 hover:text-[#1A1A1A] border border-dashed border-[#1A1A1A]/12 hover:border-[#1A1A1A]/30 bg-white/50 hover:bg-white transition-all self-start">
      <Plus className="w-3.5 h-3.5"/>添加列表
    </button>
  );
  return (
    <div className="shrink-0 w-[272px] p-2 border border-[#1A1A1A]/20 bg-white self-start space-y-1.5">
      <input ref={ref} value={val} onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key==='Enter') submit(); if (e.key==='Escape') { setOpen(false); setVal(''); } }}
        placeholder="列表名称…"
        className="w-full text-xs border border-[#1A1A1A]/15 px-2 py-1.5 outline-none focus:border-[#1A1A1A]/50 bg-[#F9F8F6]" />
      <div className="flex gap-1.5">
        <button onClick={submit} className="px-3 py-1 bg-[#1A1A1A] text-[#F9F8F6] text-[9px] font-bold tracking-widest uppercase">添加</button>
        <button onClick={() => { setOpen(false); setVal(''); }} className="p-1 text-[#1A1A1A]/40 hover:text-[#1A1A1A]"><X className="w-3.5 h-3.5"/></button>
      </div>
    </div>
  );
}

// ── 主组件 ──────────────────────────────────────────────────────────────────────
interface Props {
  columns: KanbanColumn[];
  cards: KanbanCard[];
  onAddColumn:    (title: string) => void;
  onRenameColumn: (id: string, title: string) => void;
  onDeleteColumn: (id: string) => void;
  onAddCard:      (columnId: string, title: string, desc: string) => void;
  onDeleteCard:   (id: string) => void;
  onMoveCard:     (id: string, columnId: string) => void;
  onShiftCard:    (id: string, dir: 'back' | 'forward') => void;
}

export default function BoardKanbanView({
  columns, cards, onAddColumn, onRenameColumn, onDeleteColumn,
  onAddCard, onDeleteCard, onMoveCard, onShiftCard,
}: Props) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  return (
    <div className="flex flex-row gap-2 overflow-x-auto pb-3 items-start h-full">
      {columns.map((col, idx) => {
        const colCards = cards.filter(c => c.columnId === col.id);
        const isFirst  = idx === 0;
        const isLast   = idx === columns.length - 1;
        return (
          <div key={col.id}
            onDragOver={e => { e.preventDefault(); setDragOverCol(col.id); }}
            onDragLeave={() => setDragOverCol(null)}
            onDrop={e => { e.preventDefault(); if (draggingId) onMoveCard(draggingId, col.id); setDraggingId(null); setDragOverCol(null); }}
            className={`shrink-0 w-[272px] flex flex-col p-2 border transition-all ${
              dragOverCol===col.id ? 'border-[#1A1A1A]/40 bg-[#F9F8F6]' : 'border-[#1A1A1A]/10 bg-white'
            }`}
          >
            <ColHeader col={col} dotColor={DOT_COLORS[idx % DOT_COLORS.length]}
              onRename={t => onRenameColumn(col.id, t)}
              onDelete={() => onDeleteColumn(col.id)} />

            <div className="flex-grow space-y-2 overflow-y-auto">
              {colCards.map(card => (
                <div key={card.id} draggable
                  onDragStart={() => setDraggingId(card.id)}
                  onDragEnd={() => { setDraggingId(null); setDragOverCol(null); }}
                  className={`group border bg-white p-3 cursor-grab active:cursor-grabbing transition-all hover:shadow-sm ${
                    draggingId===card.id ? 'opacity-30 border-dashed' : 'border-[#1A1A1A]/10 hover:border-[#1A1A1A]/25'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <p className="text-[11px] font-semibold text-[#1A1A1A] leading-snug flex-1">{card.title}</p>
                    <Move className="w-2.5 h-2.5 text-[#1A1A1A]/25 opacity-0 group-hover:opacity-100 shrink-0 mt-0.5" />
                  </div>
                  {card.description && <p className="text-[9.5px] text-[#1A1A1A]/50 leading-relaxed line-clamp-2">{card.description}</p>}
                  <div className="mt-2 pt-1.5 border-t border-neutral-100 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="flex gap-0.5">
                      <button onClick={() => onShiftCard(card.id, 'back')} disabled={isFirst}
                        className="p-0.5 border border-[#1A1A1A]/10 text-neutral-500 hover:bg-neutral-50 disabled:opacity-20">
                        <ArrowLeft className="w-2.5 h-2.5"/>
                      </button>
                      <button onClick={() => onShiftCard(card.id, 'forward')} disabled={isLast}
                        className="p-0.5 border border-[#1A1A1A]/10 text-neutral-500 hover:bg-neutral-50 disabled:opacity-20">
                        <ArrowRight className="w-2.5 h-2.5"/>
                      </button>
                    </div>
                    <button onClick={() => onDeleteCard(card.id)} className="p-0.5 text-red-700 hover:bg-red-50">
                      <Trash2 className="w-2.5 h-2.5"/>
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <AddCardInput onAdd={(t, d) => onAddCard(col.id, t, d)} />
          </div>
        );
      })}
      <AddListBtn onAdd={onAddColumn} />
    </div>
  );
}
