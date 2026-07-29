/** ChatEmptyState — 灵阁待命态。 */
import { useRef, type ClipboardEvent } from 'react';
import { motion } from 'motion/react';
import VintageCar from './VintageCar';
import { PRESET_QUERIES, PRESET_SHORT_LABELS } from '../config/presets';
import { PULSE_FOCUS_LABEL, getPulseSignal, getStandbyPulseSignals } from '../config/pulseSignals';
import type { ChatAttachment, ChatDocumentSource } from '../types/chat';
import { useChatAttachments } from '../hooks/useChatAttachments';
import { isDocumentFile } from '../utils/chatDocuments';
import { isImageFile } from '../utils/chatAttachments';
import { ChatAttachmentPicker } from './ChatAttachmentPicker';
import { ChatAttachmentStrip } from './ChatAttachmentStrip';
import { MuseIcon, SendIcon } from '../gsyen-designer';

interface ChatEmptyStateProps {
  lang: 'zh' | 'en';
  inputVal: string;
  setInputVal: (value: string) => void;
  onSend: (text: string, attachments?: Array<ChatAttachment | ChatDocumentSource>) => void;
}

export function ChatEmptyState({ lang, inputVal, setInputVal, onSend }: ChatEmptyStateProps) {
  const zh = lang === 'zh';
  const composingRef = useRef(false);
  const compositionGuardUntil = useRef(0);
  const { attachments, error, addFiles, removeAttachment, clearAttachments } = useChatAttachments();
  const canSend = inputVal.trim().length > 0 || attachments.length > 0;
  const isComposing = () => composingRef.current || Date.now() < compositionGuardUntil.current;
  const dgwmSignal = getPulseSignal(lang, 'DGWM');
  const standbyRows = [
    { label: zh ? '上下文' : 'CONTEXT', value: zh ? '灵阁 / 创意灵感' : 'Muse / Creative Signal' },
    { label: zh ? '今日焦点' : 'FOCUS', value: PULSE_FOCUS_LABEL, tone: 'primary' },
    { label: zh ? '待裁决' : 'UNRESOLVED', value: dgwmSignal.summary, tone: 'warn' },
    { label: zh ? '本地' : 'LOCAL', value: zh ? '资料仅在本机解析' : 'materials parsed locally' },
  ];

  const submit = () => {
    if (!canSend || isComposing()) return;
    onSend(inputVal, attachments);
    clearAttachments();
  };
  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.items).filter(item => item.kind === 'file')
      .map(item => item.getAsFile()).filter((file): file is File => !!file && (isImageFile(file) || isDocumentFile(file)));
    if (files.length) {
      if (!event.clipboardData.getData('text/plain')) event.preventDefault();
      void addFiles(files);
    }
  };

  return (
    <motion.div key="empty" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24 }}
      className="gsyen-standby-shell h-full px-4 pt-8 md:px-8 md:pt-10">
      <div className="gsyen-standby-frame">
        <div className="gsyen-standby-header">
          <div className="gsyen-standby-mark"><VintageCar size={30} strokeWidth={1.5} className="text-[#1A1A1A]/90" /></div>
          <div className="gsyen-standby-copy min-w-0"><p className="gsyen-standby-kicker">ATELIER AI / SIGNAL READY</p><h2 className="gsyen-standby-title">{zh ? '灵阁待命' : 'Muse Standby'}</h2></div>
          <div className="gsyen-standby-index"><span>03</span><small>{zh ? '未处理信号' : 'OPEN SIGNALS'}</small></div>
        </div>
        <div className="gsyen-standby-grid">
          <div className="gsyen-standby-ledger">{standbyRows.map(row => <div key={row.label} className={`gsyen-standby-row ${row.tone ? `is-${row.tone}` : ''}`}><span>{row.label}</span><strong>{row.value}</strong></div>)}</div>
          <div className="gsyen-standby-feed">
            <div className="gsyen-standby-feed-title"><span>{zh ? '疆域信号' : 'GYEN SIGNALS'}</span><span>{zh ? '静态' : 'STATIC'}</span></div>
            {getStandbyPulseSignals(lang).map(signal => <div key={signal.label} className={`gsyen-standby-signal ${signal.tone ? `is-${signal.tone}` : ''}`}><span>{signal.label}</span><strong>{signal.summary}</strong></div>)}
          </div>
        </div>
        <form onSubmit={event => { event.preventDefault(); submit(); }} className="gsyen-standby-input">
          <div className="px-4 pt-3"><ChatAttachmentStrip attachments={attachments} lang={lang} onRemove={removeAttachment} /></div>
          {error && <p className="px-4 pt-2 text-[10px] font-mono tracking-wide text-red-700" role="status">{error}</p>}
          <textarea autoFocus rows={3} value={inputVal} onChange={event => setInputVal(event.target.value)} onPaste={handlePaste}
            onCompositionStart={() => { composingRef.current = true; }}
            onCompositionEnd={() => { composingRef.current = false; compositionGuardUntil.current = Date.now() + 120; }}
            onDrop={event => { event.preventDefault(); void addFiles(Array.from(event.dataTransfer.files)); }}
            onKeyDown={event => { if (event.key === 'Enter' && (event.nativeEvent.isComposing || isComposing())) return; if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(); } }}
            placeholder={zh ? '添加资料，或输入一个想法、任务、判断…' : 'Add material, or enter a thought, task, or decision…'}
            className="w-full resize-none bg-transparent px-4 py-3 font-sans text-sm leading-relaxed text-[#1A1A1A] outline-none placeholder:text-[#1A1A1A]/28" />
          <div className="gsyen-standby-input-footer">
            <span>{zh ? 'ENTER 发送 / SHIFT 换行' : 'ENTER SEND / SHIFT NEW LINE'}</span>
            <ChatAttachmentPicker lang={lang} compact onFiles={files => void addFiles(files)} />
            <button type="submit" disabled={!canSend} aria-label={zh ? '发送消息' : 'Send message'}><SendIcon className="w-3.5 h-3.5" /></button>
          </div>
        </form>
        <div className="gsyen-standby-actions">{PRESET_QUERIES.map((query, index) => <button key={index} onClick={() => onSend(zh ? query.zh : query.en)}><MuseIcon className="w-2.5 h-2.5" /><span>{zh ? PRESET_SHORT_LABELS[index].zh : PRESET_SHORT_LABELS[index].en}</span></button>)}</div>
      </div>
    </motion.div>
  );
}
