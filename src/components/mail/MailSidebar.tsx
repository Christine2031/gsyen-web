import React from 'react';
import { Inbox, Star, Clock, Send, File, AlertOctagon, Trash2 } from 'lucide-react';
import { MailFolder } from '../../types/mail';

interface MailSidebarProps {
  lang: 'zh' | 'en';
  currentFolder: MailFolder;
  isSidebarCollapsed: boolean;
  unreadInboxCount: number;
  starredCount: number;
  snoozedCount: number;
  draftsCount: number;
  onSelectFolder: (folder: MailFolder) => void;
}

interface FolderItem {
  key: MailFolder;
  icon: React.ReactNode;
  label: string;
  count?: number;
  countStyle?: string;
}

export default function MailSidebar({
  lang, currentFolder, isSidebarCollapsed,
  unreadInboxCount, starredCount, snoozedCount, draftsCount,
  onSelectFolder,
}: MailSidebarProps) {
  const folders: FolderItem[] = [
    { key: 'inbox',   icon: <Inbox className="w-3.5 h-3.5 shrink-0" />,         label: lang === 'zh' ? '收件阁' : 'Inbox',   count: unreadInboxCount, countStyle: currentFolder === 'inbox' ? 'bg-white text-black' : 'bg-[#1A1A1A] text-white' },
    { key: 'starred', icon: <Star className={`w-3.5 h-3.5 shrink-0 ${currentFolder === 'starred' ? 'fill-white' : ''}`} />, label: lang === 'zh' ? '星标函' : 'Starred', count: starredCount, countStyle: currentFolder === 'starred' ? 'text-[#E5C158]' : 'text-neutral-500' },
    { key: 'snoozed', icon: <Clock className="w-3.5 h-3.5 shrink-0" />,         label: lang === 'zh' ? '暂挂区' : 'Snoozed', count: snoozedCount, countStyle: 'text-neutral-400' },
    { key: 'sent',    icon: <Send className="w-3.5 h-3.5 shrink-0" />,           label: lang === 'zh' ? '已密封' : 'Sent' },
    { key: 'drafts',  icon: <File className="w-3.5 h-3.5 shrink-0" />,           label: lang === 'zh' ? '草存本' : 'Drafts',  count: draftsCount, countStyle: 'bg-amber-200 text-amber-800 px-1' },
    { key: 'spam',    icon: <AlertOctagon className="w-3.5 h-3.5 shrink-0" />,   label: lang === 'zh' ? '污损堆' : 'Spam' },
    { key: 'trash',   icon: <Trash2 className="w-3.5 h-3.5 shrink-0" />,         label: lang === 'zh' ? '回收站' : 'Trash' },
  ];

  return (
    <div
      className={`bg-[#F9F8F6] p-2 space-y-1 rounded-none transition-all duration-300 ease-in-out overflow-hidden shrink-0 flex flex-col ${
        isSidebarCollapsed ? 'w-full md:w-[64px]' : 'w-full md:w-[200px]'
      }`}
    >
      <div className="font-mono text-(--fs-2xs) uppercase tracking-widest text-[#1A1A1A]/30 p-2 select-none whitespace-nowrap overflow-hidden">
        {isSidebarCollapsed ? '.' : (lang === 'zh' ? '封档目录' : 'DEPOT DIRECTORIES')}
      </div>

      {folders.map(({ key, icon, label, count, countStyle }) => (
        <button
          key={key}
          onClick={() => onSelectFolder(key)}
          className={`w-full py-2 px-3 text-left flex items-center justify-between text-xs transition-colors rounded-none whitespace-nowrap overflow-hidden ${
            currentFolder === key
              ? 'bg-[#1A1A1A] text-white font-bold'
              : 'text-neutral-700 hover:bg-[#1A1A1A]/5'
          }`}
        >
          <div className="flex items-center gap-2">
            {icon}
            {!isSidebarCollapsed && (
              <span className="font-mono uppercase tracking-wider">{label}</span>
            )}
          </div>
          {!isSidebarCollapsed && !!count && count > 0 && (
            <span className={`text-(--fs-xs) font-mono ${countStyle}`}>{count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
