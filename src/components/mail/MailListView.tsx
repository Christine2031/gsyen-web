import React from 'react';
import { motion } from 'motion/react';
import {
  Inbox, Users, Tag, Info, Search, Filter, Plus, RefreshCw,
  Archive, Trash2, Check, Clock, Star, Square, CheckSquare, MailOpen,
} from 'lucide-react';
import { localDateStr } from '../../utils/date';
import { EmailItem, MailCategory, MailFolder } from '../../types/mail';

interface MailListViewProps {
  lang: 'zh' | 'en';
  filteredList: EmailItem[];
  currentFolder: MailFolder;
  currentCategoryTab: MailCategory;
  selectedIds: Record<string, boolean>;
  isSidebarCollapsed: boolean;
  searchText: string;
  onSearchChange: (v: string) => void;
  onToggleFilters: () => void;
  onToggleSidebar: () => void;
  onCategoryTab: (c: MailCategory) => void;
  onRowClick: (m: EmailItem) => void;
  onToggleStar: (id: string, e: React.MouseEvent) => void;
  onToggleImportant: (id: string, e: React.MouseEvent) => void;
  onArchive: (id: string, e?: React.MouseEvent) => void;
  onDelete: (id: string, e?: React.MouseEvent) => void;
  onSnooze: (id: string, e: React.MouseEvent) => void;
  onToggleSelectAll: () => void;
  onSelectAllDropdown: (type: 'all' | 'none' | 'read' | 'unread' | 'starred' | 'unstarred') => void;
  onSelectId: (id: string) => void;
  onBulkArchive: () => void;
  onBulkDelete: () => void;
  onBulkMarkRead: (read: boolean) => void;
  onRefresh: () => void;
  getIsAllSelected: () => boolean;
  onOpenCompose: () => void;
}

export default function MailListView({
  lang, filteredList, currentFolder, currentCategoryTab, selectedIds,
  isSidebarCollapsed, searchText,
  onSearchChange, onToggleFilters, onToggleSidebar, onCategoryTab,
  onRowClick, onToggleStar, onToggleImportant, onArchive, onDelete, onSnooze,
  onToggleSelectAll, onSelectAllDropdown, onSelectId,
  onBulkArchive, onBulkDelete, onBulkMarkRead, onRefresh,
  getIsAllSelected, onOpenCompose,
}: MailListViewProps) {
  const selectedCount = Object.values(selectedIds).filter(Boolean).length;
  const TABS: { key: MailCategory; icon: React.ReactNode; label: string; sub: string }[] = [
    { key: 'primary',    icon: <Inbox className="w-3.5 h-3.5" />,  label: lang === 'zh' ? '主要研商' : 'PRIMARY',     sub: 'Atelier Core Intel' },
    { key: 'social',     icon: <Users className="w-3.5 h-3.5" />,  label: lang === 'zh' ? '网络协同' : 'SOCIAL',      sub: 'Collaborative Guilds' },
    { key: 'promotions', icon: <Tag className="w-3.5 h-3.5" />,    label: lang === 'zh' ? '核销资产' : 'FISCAL PROMO', sub: 'Licensing Stream Ledger' },
    { key: 'updates',    icon: <Info className="w-3.5 h-3.5" />,   label: lang === 'zh' ? '系统网关' : 'UPDATES',     sub: 'Subsystem Handshakes' },
  ];

  return (
    <motion.div
      key="list-panel"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="bg-white rounded-none overflow-hidden"
    >
      {/* Toolbar */}
      <div className="p-3 bg-neutral-50/50 border-b border-[#1A1A1A]/10 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          {/* Select all */}
          <div className="flex items-center gap-1 bg-white border border-[#1A1A1A]/15 px-2 py-1">
            <button onClick={onToggleSelectAll} className="text-neutral-600 hover:text-[#1A1A1A] outline-none">
              {getIsAllSelected() ? <CheckSquare className="w-3.5 h-3.5 text-[#1A1A1A]" /> : <Square className="w-3.5 h-3.5" />}
            </button>
            <select onChange={(e) => onSelectAllDropdown(e.target.value as any)} defaultValue="none"
              className="bg-transparent text-(--fs-sm) font-mono uppercase focus:outline-none cursor-pointer border-none text-[#1A1A1A] pr-1 py-0.5"
            >
              <option value="none">■</option>
              <option value="all">{lang === 'zh' ? '全选' : 'ALL'}</option>
              <option value="read">{lang === 'zh' ? '已读' : 'READ'}</option>
              <option value="unread">{lang === 'zh' ? '未读' : 'UNREAD'}</option>
              <option value="starred">{lang === 'zh' ? '星标' : 'STARRED'}</option>
            </select>
          </div>

          {/* Bulk actions */}
          {selectedCount > 0 && (
            <div className="flex items-center gap-1 border-l border-[#1A1A1A]/10 pl-3">
              <button onClick={onBulkArchive} className="p-1 px-2 border border-[#1A1A1A]/10 hover:bg-[#1A1A1A]/5 text-(--fs-xs) font-mono tracking-widest uppercase flex items-center gap-1">
                <Archive className="w-3 h-3" /><span>{lang === 'zh' ? '归档' : 'ARCHIVE'}</span>
              </button>
              <button onClick={onBulkDelete} className="p-1 px-2 border border-red-200 hover:bg-red-50 text-red-800 text-(--fs-xs) font-mono tracking-widest uppercase flex items-center gap-1">
                <Trash2 className="w-3 h-3" /><span>{lang === 'zh' ? '丢弃' : 'DELETE'}</span>
              </button>
              <button onClick={() => onBulkMarkRead(true)} className="p-1 px-2 border border-[#1A1A1A]/10 hover:bg-[#1A1A1A]/5 text-(--fs-xs) font-mono tracking-widest uppercase">
                <span>{lang === 'zh' ? '标已读' : 'READ'}</span>
              </button>
              <button onClick={() => onBulkMarkRead(false)} className="p-1 px-2 border border-[#1A1A1A]/10 hover:bg-[#1A1A1A]/5 text-(--fs-xs) font-mono tracking-widest uppercase">
                <span>{lang === 'zh' ? '标未读' : 'UNREAD'}</span>
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button onClick={onRefresh} className="p-1 border border-[#1A1A1A]/10 hover:bg-[#1A1A1A]/5 transition text-neutral-600 rounded-none">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono text-(--fs-xs) text-[#1A1A1A]/40 uppercase tracking-wider">
            {lang === 'zh' ? `列示信函数 ${filteredList.length}` : `Displaying ${filteredList.length} items`}
          </span>
        </div>
      </div>

      {/* Category tabs (inbox only) */}
      {currentFolder === 'inbox' && (
        <div className="grid grid-cols-4 border-b border-[#1A1A1A]/10 text-xs text-center font-mono uppercase bg-neutral-50/50">
          {TABS.map(({ key, icon, label, sub }) => (
            <button key={key} onClick={() => onCategoryTab(key)}
              className={`py-3 flex flex-col items-center justify-center gap-1 transition-all rounded-none ${
                currentCategoryTab === key
                  ? 'bg-white border-b-2 border-[#1A1A1A] font-extrabold text-[#1A1A1A]'
                  : 'text-[#1A1A1A]/55 hover:bg-[#1A1A1A]/5'
              }`}
            >
              <div className="flex items-center gap-1.5">{icon}<span className="tracking-widest">{label}</span></div>
              <span className="text-(--fs-2xs) opacity-40">{sub}</span>
            </button>
          ))}
        </div>
      )}

      {/* Email rows */}
      <div className="divide-y divide-neutral-200/60">
        {filteredList.length === 0 ? (
          <div className="py-20 text-center space-y-2">
            <MailOpen className="w-8 h-8 text-[#1A1A1A]/20 mx-auto" />
            <p className="font-serif italic text-sm text-[#1A1A1A]/40">{lang === 'zh' ? '本收信箱目前清亮如洗，无任何积存。' : 'No written correspondence matches current folder query.'}</p>
            <p className="font-mono text-(--fs-xs) text-[#1A1A1A]/25 uppercase tracking-widest">{lang === 'zh' ? '信道状态: 精准保密在线' : 'Hermes Sandbox Status: Online'}</p>
          </div>
        ) : (
          filteredList.map(m => {
            const isSel = !!selectedIds[m.id];
            return (
              <div
                key={m.id}
                className={`group transition-all flex items-center px-4 py-3 cursor-pointer text-xs justify-between gap-3 hover:shadow-sm ${!m.read ? 'bg-[#F4F2EE]/50 font-bold border-l-2 border-[#1A1A1A]' : 'bg-white font-normal'} ${isSel ? 'bg-amber-50/25' : ''}`}
                onClick={() => onRowClick(m)}
              >
                <div className="flex items-center gap-3 shrink-0" onClick={e => e.stopPropagation()}>
                  <button onClick={() => onSelectId(m.id)} className="text-neutral-300 hover:text-stone-800 transition">
                    {isSel ? <CheckSquare className="w-3.5 h-3.5 text-[#1A1A1A]" /> : <Square className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={e => onToggleStar(m.id, e)} title={lang === 'zh' ? '关注标记' : 'Focus Flag'}>
                    <Star className={`w-3.5 h-3.5 ${m.starred ? 'fill-amber-400 text-amber-500' : 'text-neutral-300 group-hover:text-amber-300'}`} />
                  </button>
                  <button onClick={e => onToggleImportant(m.id, e)} title={lang === 'zh' ? '标识等级' : 'Audit Tier Indicator'}>
                    <span className={`text-(--fs-2xs) font-mono uppercase tracking-tight px-1 font-bold ${m.important ? 'bg-[#1A1A1A] text-white border border-[#1A1A1A]' : 'border border-[#1A1A1A]/10 text-[#1A1A1A]/30'}`}>
                      {m.important ? '★ IMP' : 'std'}
                    </span>
                  </button>
                </div>

                <div className="w-36 md:w-44 shrink-0 font-medium truncate block text-stone-800">
                  {m.senderName}
                  <span className="block font-mono text-(--fs-xs) font-light text-neutral-400 truncate">{m.senderAddress}</span>
                </div>

                <div className="flex-1 min-w-0 pr-4">
                  <div className="flex items-center gap-2">
                    {currentFolder === 'snoozed' && m.snoozedUntil && (
                      <span className="bg-amber-100 text-amber-900 border border-amber-200 text-(--fs-2xs) font-mono px-1 font-bold lowercase">⌚ {m.snoozedUntil}</span>
                    )}
                    <span className="truncate text-stone-900 font-medium block">{m.subject}</span>
                  </div>
                  <span className="font-sans text-(--fs-md) text-neutral-400 truncate group-hover:text-stone-500 block">{m.snippet}</span>
                </div>

                <div className="w-20 shrink-0 text-right relative min-h-[32px] flex items-center justify-end" onClick={e => e.stopPropagation()}>
                  <div className="group-hover:opacity-0 transition-opacity font-mono text-(--fs-xs) uppercase tracking-wider text-neutral-400">
                    {m.date === localDateStr(new Date()) ? m.time : m.date.slice(5)}
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 absolute inset-y-0 right-0 flex items-center gap-1 bg-white pl-2 transition-all">
                    <button onClick={e => onArchive(m.id, e)} className="p-1 border border-[#1A1A1A]/10 hover:bg-[#1A1A1A] hover:text-white transition" title={lang === 'zh' ? '留档归档' : 'Archive'}>
                      <Archive className="w-3 h-3" />
                    </button>
                    <button onClick={e => onDelete(m.id, e)} className="p-1 border border-red-100 hover:bg-red-600 hover:text-white hover:border-red-600 transition" title={lang === 'zh' ? '丢入废纸篓' : 'Discard'}>
                      <Trash2 className="w-3 h-3" />
                    </button>
                    <button onClick={e => onSnooze(m.id, e)} className="p-1 border border-[#1A1A1A]/10 hover:bg-[#1A1A1A] hover:text-white transition" title={lang === 'zh' ? '延期挂起' : 'Snooze'}>
                      <Clock className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="p-3 bg-neutral-50/50 border-t border-[#1A1A1A]/10 font-mono text-(--fs-xs) uppercase tracking-widest text-[#1A1A1A]/40 flex flex-col sm:flex-row justify-between items-center gap-2">
        <span>ATELIER SYSTEM ENCRYPTION DIRECTORY: YES</span>
        <span>PGP KEY STRENGTH: Citadel 4096-ECC OK</span>
      </div>
    </motion.div>
  );
}
