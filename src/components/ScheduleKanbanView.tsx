/**
 * ScheduleKanbanView — 4-lane drag-and-drop Kanban board.
 */
import React from 'react';
import { Clock, MapPin, Move, ArrowLeft, ArrowRight, Trash2 } from 'lucide-react';
import { EventItem, ColumnId } from '../types/schedule';
import { categoryMap, SCHEDULE_COLUMNS } from '../config/scheduleConfig';

interface Props {
  lang: 'zh' | 'en';
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
}

export default function ScheduleKanbanView({
  lang, activeFilteredList, dragOverColumn, draggingId,
  onDragStart, onDragEnd, onDragOverColumn, onDropColumn,
  onOpenEvent, onDeleteEvent, onShiftCard, onDraftHere,
}: Props) {
  const getColumnEvents = (colId: ColumnId) =>
    activeFilteredList.filter(e => (e.status || (e.completed ? 'done' : 'todo')) === colId);

  return (
    <div className="flex flex-row gap-2 overflow-x-auto pb-3" id="kanban-lanes-master">
      {SCHEDULE_COLUMNS.map(col => {
        const columnEvents = getColumnEvents(col.id);
        const isOver = dragOverColumn === col.id;

        return (
          <div
            key={col.id}
            onDragOver={e => onDragOverColumn(e, col.id)}
            onDrop={e => onDropColumn(e, col.id)}
            className={`shrink-0 w-[272px] flex flex-col min-h-[500px] p-2 border transition-all rounded-none ${col.colorClass} ${
              isOver ? col.borderFocus + ' ring-1 ring-[#1A1A1A]/10 bg-[#F9F8F6]' : 'border-[#1A1A1A]/10 bg-white shadow-xs'
            }`}
          >
            {/* Lane header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#1A1A1A]/10 mb-4 select-none">
              <div className="space-y-0.5">
                <h4 className="text-[11px] font-sans font-bold tracking-wider text-[#1A1A1A] uppercase flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${
                    col.id === 'todo' ? 'bg-zinc-500' : col.id === 'progress' ? 'bg-amber-500' :
                    col.id === 'review' ? 'bg-indigo-500' : 'bg-emerald-500'
                  }`} />
                  <span>{lang === 'zh' ? col.zhTitle : col.enTitle}</span>
                </h4>
                <p className="text-[9px] font-mono text-[#1A1A1A]/40 uppercase tracking-widest">{col.id.toUpperCase()} STATUS</p>
              </div>
              <span className="text-[10px] font-mono bg-[#1A1A1A] text-[#F9F8F6] px-2 py-0.5 font-bold">{columnEvents.length}</span>
            </div>

            {/* Cards */}
            <div className="flex-grow space-y-3 overflow-y-auto max-h-[600px] pr-1">
              {columnEvents.length === 0 ? (
                <div className="h-44 border border-dashed border-[#1A1A1A]/10 flex flex-col items-center justify-center p-4 text-center select-none bg-neutral-50/20">
                  <p className="text-[10px] font-serif italic text-neutral-400">
                    {lang === 'zh' ? '暂无处于该阶段安排' : 'No active manuscripts'}
                  </p>
                  <button type="button" onClick={() => onDraftHere(col.id)}
                    className="text-[8.5px] font-mono text-[#1A1A1A]/60 hover:text-[#1A1A1A] mt-1 underline uppercase tracking-widest">
                    + {lang === 'zh' ? '签发于此' : 'Draft Here'}
                  </button>
                </div>
              ) : columnEvents.map(item => {
                const info = categoryMap[item.category] || categoryMap.creative;
                const isDragging = draggingId === item.id;
                return (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={e => onDragStart(e, item.id)}
                    onDragEnd={onDragEnd}
                    onClick={() => onOpenEvent(item)}
                    className={`group relative border bg-white p-4 transition-all cursor-grab active:cursor-grabbing hover:shadow-md ${
                      isDragging ? 'opacity-30 border-dashed border-[#1A1A1A]/20' : 'border-[#1A1A1A]/10 hover:border-[#1A1A1A]/30'
                    }`}
                  >
                    {/* Drag indicator */}
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 select-none text-[#1A1A1A]/40">
                      <span className="text-[8px] font-mono uppercase tracking-widest">DRAG</span>
                      <Move className="w-3 h-3" />
                    </div>

                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`text-[8px] font-mono uppercase tracking-widest px-1.5 py-0.5 border ${info.color}`}>
                        {lang === 'zh' ? info.zhLabel : info.enLabel}
                      </span>
                      <span className="text-[8px] font-mono text-[#1A1A1A]/45 flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />{item.time}
                      </span>
                    </div>

                    <h5 className="text-xs font-bold font-sans text-[#1A1A1A] leading-tight mb-1 truncate">{item.title}</h5>
                    <p className="text-[9.5px] leading-relaxed text-[#1A1A1A]/60 font-serif italic mb-3 line-clamp-2">{item.subtitle}</p>

                    <div className="flex items-center justify-between pt-2 border-t border-[#1A1A1A]/5 text-[8.5px] font-mono uppercase tracking-wider text-[#1A1A1A]/50 select-none">
                      <span className="flex items-center gap-1 max-w-[124px] truncate">
                        <MapPin className="w-2.5 h-2.5 shrink-0" /><span className="truncate">{item.location}</span>
                      </span>
                      <span>{item.date}</span>
                    </div>

                    {/* Shift + Delete controls */}
                    <div className="mt-3.5 pt-2 border-t border-neutral-100 flex items-center justify-between opacity-30 group-hover:opacity-100 transition-opacity">
                      <div className="flex items-center gap-1">
                        <button onClick={e => onShiftCard(item.id, 'back', e)} disabled={col.id === 'todo'}
                          className="p-1 border border-[#1A1A1A]/10 text-neutral-600 hover:bg-neutral-50 disabled:opacity-20 rounded-none">
                          <ArrowLeft className="w-3 h-3" />
                        </button>
                        <span className="text-[8px] font-mono tracking-widest uppercase px-1 text-neutral-400">SHIFT</span>
                        <button onClick={e => onShiftCard(item.id, 'forward', e)} disabled={col.id === 'done'}
                          className="p-1 border border-[#1A1A1A]/10 text-neutral-600 hover:bg-neutral-50 disabled:opacity-20 rounded-none">
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                      <button type="button" onClick={e => onDeleteEvent(item.id, e)}
                        className="p-1 text-red-800 hover:bg-red-50 transition-all rounded-none"
                        title={lang === 'zh' ? '删除卡片' : 'Purge card'}>
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
