/** ScheduleKanbanView — 动态多列看板，严格对齐 Trello 272px 列宽 */
import React, { useState, useRef, useCallback } from 'react';
import { Clock, MapPin, Move, ArrowLeft, ArrowRight, Trash2, Plus } from 'lucide-react';
import { ColumnId } from '../types/schedule';
import { categoryMap } from '../config/scheduleConfig';
import { DOT_COLORS, KanbanViewProps, ColumnTitle, AddListButton } from './KanbanColumnParts';

export default function ScheduleKanbanView({
  lang, columns, activeFilteredList, dragOverColumn, draggingId,
  onDragStart, onDragEnd, onDragOverColumn, onDropColumn,
  onOpenEvent, onDeleteEvent, onShiftCard, onDraftHere,
  onAddColumn, onRenameColumn, onDeleteColumn, onReorderColumn,
}: KanbanViewProps) {
  const getColEvents = (colId: ColumnId) =>
    activeFilteredList.filter(e => (e.status || (e.completed ? 'done' : 'todo')) === colId);

  const [draggingColId, setDraggingColId] = useState<string | null>(null);
  const [colDragOver,   setColDragOver]   = useState<string | null>(null);
  const [squishColId,   setSquishColId]   = useState<string | null>(null);
  const lastReorderPair  = useRef('');
  const reorderTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draggingColRef   = useRef<string | null>(null);

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
        onMouseDown={onBoardMouseDown} onMouseMove={onBoardMouseMove}
        onMouseUp={stopPan} onMouseLeave={stopPan}
      >
      {columns.map((col, idx) => {
        const colEvents  = getColEvents(col.id);
        const isOver     = dragOverColumn === col.id;
        const dotColor   = DOT_COLORS[idx % DOT_COLORS.length];
        const isFirstCol = idx === 0;
        const isLastCol  = idx === columns.length - 1;
        const isColOver  = colDragOver === col.id && draggingColId !== null && draggingColId !== col.id;

        return (
          <div key={col.id} draggable
            onDragStart={e => { e.dataTransfer.setData('col-id', col.id); e.dataTransfer.effectAllowed = 'move'; setDraggingColId(col.id); draggingColRef.current = col.id; lastReorderPair.current = ''; if (reorderTimer.current) clearTimeout(reorderTimer.current); }}
            onDragEnd={() => { if (reorderTimer.current) clearTimeout(reorderTimer.current); setDraggingColId(null); draggingColRef.current = null; setColDragOver(null); setSquishColId(null); lastReorderPair.current = ''; onDragEnd(); }}
            onDragOver={e => {
              e.preventDefault(); setColDragOver(col.id);
              if (e.dataTransfer.types.includes('col-id') && draggingColId && draggingColId !== col.id) {
                const pair = `${draggingColId}→${col.id}`;
                if (lastReorderPair.current !== pair) {
                  lastReorderPair.current = pair;
                  if (reorderTimer.current) clearTimeout(reorderTimer.current);
                  const fromId = draggingColRef.current!;
                  reorderTimer.current = setTimeout(() => {
                    onReorderColumn(fromId, col.id);
                    setColDragOver(null);
                    setSquishColId(fromId);
                    setTimeout(() => setSquishColId(null), 400);
                  }, 50);
                }
              } else if (!e.dataTransfer.types.includes('col-id')) { onDragOverColumn(e, col.id); }
            }}
            onDrop={e => { const cid = e.dataTransfer.getData('col-id'); if (!cid) onDropColumn(e, col.id); }}
            style={{
              transform: squishColId === col.id
                ? 'scaleX(0.965) scaleY(1.012)'
                : draggingColId === col.id ? 'scaleX(0.97)' : 'scale(1)',
              transition: squishColId === col.id
                ? 'transform 90ms cubic-bezier(0.34,36,0.64,1), opacity 150ms, border-color 150ms, background 150ms'
                : 'transform 100ms ease-out, opacity 150ms, border-color 150ms, background 150ms',
              transformOrigin: 'center top',
            }}
            className={`shrink-0 w-[272px] flex flex-col min-h-[120px] p-2 border ${
              draggingColId === col.id ? 'opacity-40 border-dashed border-[#1A1A1A]/30 bg-white' :
              isColOver ? 'border-[#1A1A1A]/50 bg-[#F4F2EE]' :
              isOver ? 'border-[#1A1A1A]/40 bg-[#F9F8F6]' : 'border-[#1A1A1A]/10 bg-white'
            }`}
          >
            <ColumnTitle col={col} dotColor={dotColor} lang={lang}
              onRename={t => onRenameColumn(col.id, t)} onDelete={() => onDeleteColumn(col.id)} />

            <div className="flex-grow space-y-2 overflow-y-auto pr-0.5">
              {colEvents.length === 0 ? (
                <div className="h-16 border border-dashed border-[#1A1A1A]/10 flex items-center justify-center">
                  <button type="button" onClick={() => onDraftHere(col.id)}
                    className="text-[8.5px] font-mono text-[#1A1A1A]/40 hover:text-[#1A1A1A] underline uppercase tracking-widest">
                    + {lang === 'zh' ? '签发于此' : 'Draft here'}
                  </button>
                </div>
              ) : colEvents.map(item => {
                const info = categoryMap[item.category] || categoryMap.creative;
                return (
                  <div key={item.id} draggable
                    onDragStart={e => { e.stopPropagation(); onDragStart(e, item.id); }}
                    onDragEnd={e => { e.stopPropagation(); onDragEnd(); }}
                    onClick={() => onOpenEvent(item)}
                    className={`group relative border bg-white p-3 transition-all cursor-grab active:cursor-grabbing hover:shadow-sm ${
                      draggingId === item.id ? 'opacity-30 border-dashed border-[#1A1A1A]/20' : 'border-[#1A1A1A]/10 hover:border-[#1A1A1A]/25'
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

            <button onClick={() => onDraftHere(col.id)}
              className="mt-2 w-full flex items-center gap-1.5 px-1 py-1 text-[9px] font-mono text-[#1A1A1A]/35 hover:text-[#1A1A1A]/70 hover:bg-[#F9F8F6] transition-colors">
              <Plus className="w-3 h-3" />{lang === 'zh' ? '添加卡片' : 'Add a card'}
            </button>
          </div>
        );
      })}
      <AddListButton lang={lang} onAdd={onAddColumn} />
      </div>
    </>
  );
}
