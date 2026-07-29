import React, { useRef } from 'react';
import type { ChatAttachment, ChatDocumentSource } from '../types/chat';
import { isDocumentFile } from '../utils/chatDocuments';
import { isImageFile } from '../utils/chatAttachments';
import { useChatAttachments } from '../hooks/useChatAttachments';
import { ChatAttachmentPicker } from './ChatAttachmentPicker';
import { ChatAttachmentStrip } from './ChatAttachmentStrip';
import { SendIcon, TrashIcon } from '../gsyen-designer';

interface ChatInputBarProps {
  lang: 'zh' | 'en';
  inputVal: string;
  hidden: boolean;
  onInputChange: React.Dispatch<React.SetStateAction<string>>;
  onSend: (text: string, attachments?: Array<ChatAttachment | ChatDocumentSource>) => void;
  sourceDocuments: ChatDocumentSource[];
  onRemoveSource: (id: string) => void;
  onClear: () => void;
}

export function ChatInputBar({ lang, inputVal, hidden, onInputChange, onSend, sourceDocuments, onRemoveSource, onClear }: ChatInputBarProps) {
  const composingRef = useRef(false);
  const compositionGuardUntil = useRef(0);
  const { attachments, error, addFiles, removeAttachment, clearAttachments } = useChatAttachments();
  const canSend = inputVal.trim().length > 0 || attachments.length > 0;
  const isComposing = () => composingRef.current || Date.now() < compositionGuardUntil.current;

  const submit = () => {
    if (!canSend || isComposing()) return;
    onSend(inputVal, attachments);
    clearAttachments();
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const files = filesFromItems(event.clipboardData.items);
    if (files.length) {
      if (!event.clipboardData.getData('text/plain')) event.preventDefault();
      void addFiles(files);
    }
  };

  return (
    <div className={`gsyen-chat-input-bar shrink-0 p-4 border-t border-[#1A1A1A]/10 bg-white ${hidden ? 'hidden' : ''}`}>
      {sourceDocuments.length > 0 && (
        <div className="mb-3 border-b border-[#1A1A1A]/10 pb-2">
          <p className="mb-1.5 text-[9px] font-mono font-bold uppercase tracking-widest text-[#1A1A1A]/45">{lang === 'zh' ? '本次资料 · 仅本机索引' : 'SESSION MATERIAL · LOCAL ONLY'}</p>
          <ChatAttachmentStrip attachments={sourceDocuments} lang={lang} onRemove={onRemoveSource} />
        </div>
      )}
      <ChatAttachmentStrip attachments={attachments} lang={lang} onRemove={removeAttachment} />
      {error && <p className="mb-2 text-[10px] font-mono tracking-wide text-red-700" role="status">{error}</p>}
      <form onSubmit={event => { event.preventDefault(); submit(); }} className="gsyen-chat-input-form flex items-center gap-2">
        <button type="button" onClick={onClear} aria-label={lang === 'zh' ? '清空对话' : 'Clear chat'}
          className="gsyen-chat-input-button p-3 border border-[#1A1A1A]/15 hover:bg-[#1A1A1A] hover:text-white transition-colors text-neutral-500 rounded-none shrink-0">
          <TrashIcon className="w-4 h-4" />
        </button>
        <ChatAttachmentPicker lang={lang} onFiles={files => void addFiles(files)} />
        <input type="text"
          placeholder={lang === 'zh' ? '添加资料，或向缈缈提问…' : 'Add material, or ask Muse…'}
          value={inputVal} onChange={event => onInputChange(event.target.value)} onPaste={handlePaste}
          onCompositionStart={() => { composingRef.current = true; }}
          onCompositionEnd={() => { composingRef.current = false; compositionGuardUntil.current = Date.now() + 120; }}
          onDrop={event => { event.preventDefault(); void addFiles(Array.from(event.dataTransfer.files)); }}
          className="gsyen-chat-input-field flex-grow p-3 bg-[#F9F8F6] border border-[#1A1A1A]/15 focus:border-[#1A1A1A] focus:bg-white rounded-none outline-none font-sans text-xs text-[#1A1A1A]" />
        <button type="submit" disabled={!canSend} aria-label={lang === 'zh' ? '发送消息' : 'Send message'}
          className="gsyen-chat-input-button p-3 bg-[#1A1A1A] text-white disabled:bg-[#1A1A1A]/10 disabled:text-neutral-300 transition-colors rounded-none shrink-0 border border-[#1A1A1A]">
          <SendIcon className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}

function filesFromItems(items: DataTransferItemList): File[] {
  return Array.from(items)
    .filter(item => item.kind === 'file')
    .map(item => item.getAsFile())
    .filter((file): file is File => !!file && (isImageFile(file) || isDocumentFile(file)));
}
