import React from 'react';
import { motion } from 'motion/react';
import { Plus, Minimize2, Maximize2, X, SendHorizontal } from 'lucide-react';
import { MailCategory } from '../../types/mail';

interface Contact { name: string; email: string; }

interface MailComposeDialogProps {
  lang: 'zh' | 'en';
  composeState: 'window' | 'minimized' | 'maximized';
  composeTo: string;
  composeSubject: string;
  composeBody: string;
  composeCategory: MailCategory;
  showToSuggestions: boolean;
  filteredSuggestions: Contact[];
  onStateChange: (s: 'closed' | 'window' | 'minimized' | 'maximized') => void;
  onToChange: (v: string) => void;
  onSubjectChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onCategoryChange: (c: MailCategory) => void;
  onToSuggestionsChange: (v: boolean) => void;
  onSend: (e: React.FormEvent) => void;
  onShred: () => void;
}

const CATEGORIES: MailCategory[] = ['primary', 'social', 'promotions', 'updates'];

export default function MailComposeDialog({
  lang, composeState, composeTo, composeSubject, composeBody, composeCategory,
  showToSuggestions, filteredSuggestions,
  onStateChange, onToChange, onSubjectChange, onBodyChange, onCategoryChange,
  onToSuggestionsChange, onSend, onShred,
}: MailComposeDialogProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 100 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 100 }}
      className={`fixed right-6 bottom-6 bg-white border border-neutral-200 shadow-2xl z-50 flex flex-col justify-between rounded-none transition-all duration-300 ${
        composeState === 'maximized' ? 'w-[860px] h-[720px]'
        : composeState === 'minimized' ? 'w-72 h-10'
        : 'w-[560px] h-[620px]'
      }`}
    >
      {/* Header */}
      <div className="bg-neutral-900 text-white p-2.5 px-4 flex items-center justify-between text-xs select-none">
        <span className="font-mono text-(--fs-xs) uppercase tracking-widest font-bold flex items-center gap-2">
          <Plus className="w-3.5 h-3.5 text-white" />
          {lang === 'zh' ? '起草加密新信函' : 'SEALING NEW CORRESPONDENCE BLUEPRINT'}
        </span>
        <div className="flex items-center gap-2">
          <button onClick={() => onStateChange(composeState === 'minimized' ? 'window' : 'minimized')} className="hover:text-amber-400" title={lang === 'zh' ? '最小化' : 'Shrink'}>
            <Minimize2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onStateChange(composeState === 'maximized' ? 'window' : 'maximized')} className="hover:text-amber-400" title={lang === 'zh' ? '最大化' : 'Expand'}>
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onStateChange('closed')} className="hover:text-red-400" title={lang === 'zh' ? '弃草稿' : 'Burn blueprint'}>
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body — hidden when minimized */}
      {composeState !== 'minimized' && (
        <form onSubmit={onSend} className="flex-1 flex flex-col justify-between p-4 space-y-3 bg-white">
          <div className="space-y-2 flex-1">
            {/* To field */}
            <div className="relative">
              <div className="flex items-center gap-2 border-b border-neutral-200 py-1.5">
                <span className="font-mono text-(--fs-xs) uppercase tracking-wider text-neutral-400 w-12">{lang === 'zh' ? '寄至: ' : 'To: '}</span>
                <input type="text" required value={composeTo}
                  onChange={e => { onToChange(e.target.value); onToSuggestionsChange(true); }}
                  onFocus={() => onToSuggestionsChange(true)}
                  placeholder="e.g. audit-office@atelier.internal"
                  className="bg-transparent border-none outline-none font-sans text-xs w-full text-neutral-900"
                />
              </div>
              {showToSuggestions && filteredSuggestions.length > 0 && (
                <div className="absolute left-14 right-0 top-8 bg-white border border-neutral-200 z-50 text-xs shadow-lg max-h-48 overflow-y-auto divide-y divide-neutral-100">
                  {filteredSuggestions.map((c, i) => (
                    <div key={i} onClick={() => { onToChange(c.email); onToSuggestionsChange(false); }}
                      className="p-2 hover:bg-neutral-50 cursor-pointer flex justify-between items-center"
                    >
                      <div>
                        <span className="font-bold text-neutral-900 block">{c.name}</span>
                        <span className="font-mono text-(--fs-xs) text-neutral-400">{c.email}</span>
                      </div>
                      <span className="text-(--fs-2xs) font-mono text-neutral-300">import contact [↲]</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Subject */}
            <div className="flex items-center gap-2 border-b border-neutral-200 py-1.5">
              <span className="font-mono text-(--fs-xs) uppercase tracking-wider text-neutral-400 w-12">{lang === 'zh' ? '关于: ' : 'Subject: '}</span>
              <input type="text" required value={composeSubject} onChange={e => onSubjectChange(e.target.value)}
                placeholder="Title of this envelope..."
                className="bg-transparent border-none outline-none font-sans text-xs w-full text-neutral-900"
              />
            </div>

            {/* Category */}
            <div className="flex items-center gap-2 border-b border-neutral-200 py-1.5">
              <span className="font-mono text-(--fs-xs) uppercase tracking-wider text-neutral-400 w-12">{lang === 'zh' ? '分类: ' : 'Label: '}</span>
              <div className="flex items-center gap-1.5">
                {CATEGORIES.map(cat => (
                  <button key={cat} type="button" onClick={() => onCategoryChange(cat)}
                    className={`px-2 py-0.5 text-(--fs-2xs) font-mono uppercase tracking-wider border rounded-none transition-all ${
                      composeCategory === cat ? 'bg-neutral-900 text-white border-neutral-900 font-bold' : 'bg-transparent text-neutral-400 border-neutral-200 hover:border-neutral-400'
                    }`}
                  >{cat}</button>
                ))}
              </div>
            </div>

            {/* Body */}
            <textarea rows={13} required value={composeBody} onChange={e => onBodyChange(e.target.value)}
              placeholder={lang === 'zh' ? '编写具有行业顶尖美学的正文段落...' : 'Formulate structured physical memo body...'}
              className="w-full text-sm p-3 border border-neutral-200 focus:border-neutral-400 outline-none bg-white rounded-none font-sans font-light flex-1 min-h-[280px] leading-relaxed text-neutral-900"
            />
          </div>

          {/* Footer */}
          <div className="flex justify-between items-center border-t border-neutral-200 pt-3">
            <div className="font-mono text-(--fs-2xs) text-neutral-400 uppercase">
              {lang === 'zh' ? '离线多端信道: PGP/E2EE ACTIVE' : 'SECURE ENVELOPE SEALER: ONLINE'}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onShred} className="px-3.5 py-1.5 border border-red-200 hover:bg-red-50 text-red-700 text-(--fs-sm) font-mono uppercase tracking-wider rounded-none">
                {lang === 'zh' ? '粉碎毁弃' : 'Shred'}
              </button>
              <button type="submit" disabled={!composeTo.trim() || !composeSubject.trim()}
                className={`px-5 py-1.5 text-(--fs-sm) font-mono tracking-widest font-bold uppercase transition flex items-center gap-1.5 rounded-none ${
                  composeTo.trim() && composeSubject.trim() ? 'bg-neutral-900 text-white hover:bg-neutral-700' : 'bg-neutral-100 text-neutral-300 border border-neutral-100 cursor-not-allowed'
                }`}
              >
                <SendHorizontal className="w-3.5 h-3.5" />
                <span>{lang === 'zh' ? '封漆寄出' : 'Seal & Send'}</span>
              </button>
            </div>
          </div>
        </form>
      )}
    </motion.div>
  );
}
