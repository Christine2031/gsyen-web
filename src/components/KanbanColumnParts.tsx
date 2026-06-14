/** KanbanColumnParts — ColumnTitle + AddListButton + shared types */
import React, { useState, useRef, useEffect } from 'react';
import { Plus, X, Check } from 'lucide-react';
import { EventItem, ColumnId } from '../types/schedule';
import { KanbanColumn } from '../stores/kanbanColumnStore';

export const DOT_COLORS = [
  'bg-zinc-400', 'bg-amber-500', 'bg-indigo-500', 'bg-emerald-500',
  'bg-rose-500',  'bg-sky-500',   'bg-violet-500', 'bg-orange-400',
];

export interface KanbanViewProps {
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
  onReorderColumn: (fromId: string, toId: string) => void;
}

export function ColumnTitle({ col, onRename, onDelete, dotColor, lang }: {
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
            className="flex-1 min-w-0 text-(--fs-md) font-bold tracking-wider uppercase bg-white border border-[#1A1A1A]/30 px-1 py-0 outline-none text-[#1A1A1A]"
          />
        ) : (
          <h4 onClick={() => setEditing(true)}
            className="text-(--fs-md) font-bold tracking-wider uppercase text-[#1A1A1A] truncate cursor-text hover:text-[#1A1A1A]/70 transition-colors"
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

export function AddListButton({ lang, onAdd }: { lang: 'zh' | 'en'; onAdd: (t: string) => void }) {
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
      className="shrink-0 w-[272px] h-12 flex items-center gap-2 px-3 text-(--fs-md) font-bold tracking-widest uppercase text-[#1A1A1A]/50 hover:text-[#1A1A1A] border border-dashed border-[#1A1A1A]/15 hover:border-[#1A1A1A]/35 bg-white/60 hover:bg-white transition-all self-start">
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
          className="px-3 py-1 bg-[#1A1A1A] text-[#F9F8F6] text-(--fs-sm) font-bold tracking-widest uppercase hover:bg-[#1A1A1A]/80 transition-colors">
          {lang === 'zh' ? '添加' : 'Add list'}
        </button>
        <button onClick={() => { setOpen(false); setVal(''); }}
          className="p-1 text-[#1A1A1A]/40 hover:text-[#1A1A1A]"><X className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  );
}
