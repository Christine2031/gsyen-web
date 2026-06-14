import React, { useState, useRef, useEffect } from 'react';
import { AnimatePresence } from 'motion/react';
import { Search, Filter, Plus, PanelLeft } from 'lucide-react';
import { useMailStore } from '../hooks/useMailStore';
import { useMailCompose } from '../hooks/useMailCompose';
import MailSidebar from './mail/MailSidebar';
import MailListView from './mail/MailListView';
import MailDetailView from './mail/MailDetailView';
import MailComposeDialog from './mail/MailComposeDialog';
import MailSnoozePopover from './mail/MailSnoozePopover';
import MailToast from './mail/MailToast';

interface MailModuleProps {
  lang: 'zh' | 'en';
}

export default function MailModule({ lang }: MailModuleProps) {
  const store = useMailStore(lang);
  const compose = useMailCompose({
    lang, emails: store.emails, saveEmails: store.saveEmails, showToast: store.showToast,
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (searchOpen) searchRef.current?.focus(); }, [searchOpen]);

  return (
    <div className="flex flex-col h-full text-[#1A1A1A] font-sans">
      {/* Toolbar strip */}
      <div className="relative shrink-0 h-[52px] flex flex-row items-center justify-between gap-3 flex-nowrap px-8 bg-[#F4F2EE]">
        <div className="flex items-center gap-3 shrink-0">
          <button onClick={() => store.setIsSidebarCollapsed(!store.isSidebarCollapsed)}
            className={`p-1.5 border border-[#1A1A1A]/15 hover:bg-[#1A1A1A]/5 rounded-none transition-all flex items-center justify-center ${!store.isSidebarCollapsed ? 'bg-[#1A1A1A]/10 text-[#1A1A1A]' : 'bg-transparent text-[#1A1A1A]/70'}`}
          >
            <PanelLeft className="w-4 h-4" />
          </button>
          <button onClick={() => compose.setComposeState('window')}
            className="px-4 py-1.5 bg-[#1A1A1A] text-white hover:bg-[#2C2C2C] text-(--fs-sm) font-mono font-bold tracking-widest uppercase transition-all flex items-center gap-2 rounded-none"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{lang === 'zh' ? '亲书信函' : 'Seal New Letter'}</span>
          </button>
        </div>
        <div className="flex items-center gap-2 flex-nowrap min-w-0">
          <div className="hidden sm:flex gap-3 items-center px-3 py-1 border border-[#1A1A1A]/10 text-(--fs-xs) font-mono text-[#1A1A1A]/70 uppercase tracking-widest rounded-none">
            <div>{lang === 'zh' ? '未读:' : 'UNREAD:'} <strong className="text-amber-800 font-bold">{store.unreadInboxCount}</strong></div>
            <div className="w-[1px] h-3 bg-[#1A1A1A]/10" />
            <div>{lang === 'zh' ? '归档/推迟:' : 'ARCH/SNOOZE:'} <strong className="text-[#1A1A1A]">{store.emails.length}/{store.snoozedCount}</strong></div>
          </div>
          {/* Google 式搜索：平时只有放大镜，点击展开 */}
          <div className="flex items-center">
            <button onClick={() => setSearchOpen(o => !o)}
              className="p-1.5 hover:bg-[#1A1A1A]/5 text-[#1A1A1A]/60 hover:text-[#1A1A1A] transition rounded-none"
              title={lang === 'zh' ? '搜索' : 'Search'}>
              <Search className="w-4 h-4" />
            </button>
            <input ref={searchRef} type="text"
              placeholder={lang === 'zh' ? '根据指令搜索信箱...' : 'Filter mailbox...'}
              value={store.searchText}
              onChange={e => store.setSearchText(e.target.value)}
              onBlur={() => { if (!store.searchText) setSearchOpen(false); }}
              className={`transition-all duration-300 ease-out text-xs rounded-none bg-transparent focus:outline-none text-[#1A1A1A] ${
                searchOpen
                  ? 'w-52 opacity-100 px-3 py-1.5 border-b border-[#1A1A1A]/30 focus:border-[#1A1A1A]'
                  : 'w-0 opacity-0 p-0 border-0 pointer-events-none'
              }`} />
          </div>
          <button onClick={() => store.setShowFilters(!store.showFilters)}
            className="p-1.5 hover:bg-[#1A1A1A]/5 text-[#1A1A1A]/60 hover:text-[#1A1A1A] transition rounded-none"
            title={lang === 'zh' ? '高级筛选' : 'Advanced filters'}>
            <Filter className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── DEBUG BASELINE ── */}

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-8 pt-0 pb-10 space-y-4">

      {/* Advanced filters form */}
      <AnimatePresence>
        {store.showFilters && (
          <div className="bg-white border border-[#1A1A1A] p-4 text-xs space-y-3 shadow-sm rounded-none">
            <div className="font-mono text-(--fs-xs) uppercase tracking-widest font-bold text-[#1A1A1A]/50 pb-2 border-b border-dashed border-[#1A1A1A]/10">
              {lang === 'zh' ? 'Hermes 自定义排字筛选器' : 'Hermes Advanced Metadata Filters'}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { label: lang === 'zh' ? '寄件网关' : 'From Sender', value: store.filterFrom, onChange: store.setFilterFrom, placeholder: 'e.g. security' },
                { label: lang === 'zh' ? '收信地址' : 'To Recipient', value: store.filterTo, onChange: store.setFilterTo, placeholder: 'alexander@atelier.internal' },
                { label: lang === 'zh' ? '匹配标题' : 'Subject Matching', value: store.filterSubject, onChange: store.setFilterSubject, placeholder: 'e.g. quarterly report' },
              ].map(({ label, value, onChange, placeholder }) => (
                <div key={label}>
                  <label className="block text-(--fs-xs) font-mono uppercase tracking-wider text-neutral-400 mb-1">{label}</label>
                  <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
                    className="w-full text-xs p-1.5 bg-[#F9F8F6] border border-[#1A1A1A]/10 outline-none focus:border-[#1A1A1A] rounded-none"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={store.handleResetFilters} className="px-3 py-1 bg-transparent hover:bg-[#1A1A1A]/5 text-(--fs-xs) font-mono tracking-wider uppercase border border-[#1A1A1A]/10 text-neutral-600 rounded-none">
                {lang === 'zh' ? '恢复默认' : 'Reset'}
              </button>
              <button onClick={store.handleApplyAdvancedFilters} className="px-4 py-1 bg-[#1A1A1A] text-white hover:bg-[#2C2C2C] text-(--fs-xs) font-mono font-bold tracking-wider uppercase rounded-none">
                {lang === 'zh' ? '套用矩阵筛选' : 'Apply Matrix'}
              </button>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Main layout */}
      <div className="flex flex-col md:flex-row gap-0 items-stretch">
        <MailSidebar
          lang={lang} currentFolder={store.currentFolder}
          isSidebarCollapsed={store.isSidebarCollapsed}
          unreadInboxCount={store.unreadInboxCount} starredCount={store.starredCount}
          snoozedCount={store.snoozedCount} draftsCount={store.draftsCount}
          onSelectFolder={f => { store.setCurrentFolder(f); store.setSelectedEmail(null); }}
        />

        <div className="flex-grow flex-1 min-w-0 space-y-4">
          <AnimatePresence mode="wait">
            {!store.selectedEmail ? (
              <MailListView
                lang={lang} filteredList={store.filteredList}
                currentFolder={store.currentFolder} currentCategoryTab={store.currentCategoryTab}
                selectedIds={store.selectedIds} isSidebarCollapsed={store.isSidebarCollapsed}
                searchText={store.searchText}
                onSearchChange={store.setSearchText} onToggleFilters={() => store.setShowFilters(!store.showFilters)}
                onToggleSidebar={() => store.setIsSidebarCollapsed(!store.isSidebarCollapsed)}
                onCategoryTab={store.setCurrentCategoryTab}
                onRowClick={store.handleEmailRowClick}
                onToggleStar={store.handleToggleStar} onToggleImportant={store.handleToggleImportant}
                onArchive={store.handleArchiveEmail} onDelete={store.handleDeleteEmail}
                onSnooze={store.triggerSnoozePopover}
                onToggleSelectAll={store.handleToggleSelectAll}
                onSelectAllDropdown={store.handleSelectAllDropdown}
                onSelectId={id => store.setSelectedIds(prev => ({ ...prev, [id]: !prev[id] }))}
                onBulkArchive={store.handleBulkArchive} onBulkDelete={store.handleBulkDelete}
                onBulkMarkRead={store.handleBulkMarkRead}
                onRefresh={() => store.showToast(lang === 'zh' ? '刷新系统信道，获取最新同步...' : 'Hermes cache synchronized')}
                getIsAllSelected={store.getIsAllSelected}
                onOpenCompose={() => compose.setComposeState('window')}
              />
            ) : (
              <MailDetailView
                lang={lang} email={store.selectedEmail}
                inlineReplyText={store.inlineReplyText}
                onReplyChange={store.setInlineReplyText}
                onSendReply={store.handleSendInlineReply}
                onBack={() => store.setSelectedEmail(null)}
                onArchive={store.handleArchiveEmail} onDelete={store.handleDeleteEmail}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
      </div>{/* /Body */}

      {/* Floating compose */}
      <AnimatePresence>
        {compose.composeState !== 'closed' && (
          <MailComposeDialog
            lang={lang} composeState={compose.composeState}
            composeTo={compose.composeTo} composeSubject={compose.composeSubject}
            composeBody={compose.composeBody} composeCategory={compose.composeCategory}
            showToSuggestions={compose.showToSuggestions} filteredSuggestions={compose.filteredSuggestions}
            onStateChange={compose.setComposeState}
            onToChange={compose.setComposeTo} onSubjectChange={compose.setComposeSubject}
            onBodyChange={compose.setComposeBody} onCategoryChange={compose.setComposeCategory}
            onToSuggestionsChange={compose.setShowToSuggestions}
            onSend={compose.handleSendComposeEmail} onShred={compose.handleShred}
          />
        )}
      </AnimatePresence>

      {/* Snooze popover */}
      <AnimatePresence>
        {store.showSnoozePopover && store.snoozePositions && (
          <MailSnoozePopover
            lang={lang} position={store.snoozePositions}
            onClose={() => store.setShowSnoozePopover(false)}
            onSnooze={store.executeSnooze}
          />
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {store.toastMessage && (
          <MailToast
            lang={lang} message={store.toastMessage}
            hasUndo={!!store.toastUndoAction}
            onUndo={store.handleUndo}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
