import { useState, type ReactElement } from 'react';
import { motion } from 'motion/react';
import { ChatImageAttachment, ChatMessage } from '../types/chat';
import { renderMessageContent } from '../utils/renderMessage';
import { exportQuoteCard } from '../utils/exportCard';
import { ActionCardView } from './ActionCardView';
import { DocumentIcon } from './ChatAttachmentStrip';
import { ChatImageLightbox } from './ChatImageLightbox';
import { CheckIcon, CopyIcon, DownloadIcon, MuseIcon, UserIcon } from '../gsyen-designer';

interface ChatMessageBubbleProps {
  msg: ChatMessage;
  lang: 'zh' | 'en';
  isCopiedId: string | null;
  onCopy: (id: string, text: string) => void;
}

/** 单条聊天气泡：头像 + 内容 + 神机百炼卡片 + 复制/导出动作。 */
export function ChatMessageBubble({ msg, lang, isCopiedId, onCopy }: ChatMessageBubbleProps): ReactElement {
  const isAI = msg.role === 'model';
  const isStreaming = !!msg.streaming;
  const copyText = msg.content.trim();
  const copied = isCopiedId === msg.id;
  const streamingCaret = isStreaming ? (
    <span className="gsyen-stream-anchor" aria-hidden="true">
      <span className="gsyen-stream-caret" />
    </span>
  ) : undefined;
  const [preview, setPreview] = useState<ChatImageAttachment | null>(null);
  const images = (msg.attachments ?? []).filter(
    (item): item is ChatImageAttachment => item.type === 'image',
  );

  return (
    <>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className={`gsyen-message-row ${isAI ? 'is-ai' : 'is-user'} flex gap-3 max-w-3xl ${isAI ? '' : 'ml-auto mr-6 max-w-[min(42rem,calc(100%-3rem))] flex-row-reverse md:mr-10'}`}>
        {/* 头像 */}
        <div className={`gsyen-message-avatar w-7 h-7 flex items-center justify-center shrink-0 mt-1 ${isAI ? 'rounded-full bg-[#1A1A1A] text-[#F9F8F6]' : 'rounded-full bg-[#E8E6E1] text-[#1A1A1A]'}`}>
          {isAI ? <MuseIcon className="w-3 h-3" /> : <UserIcon className="w-3 h-3" />}
        </div>
        <div className="gsyen-message-stack space-y-1 max-w-[88%] min-w-0">
          <div className={`gsyen-message-meta flex items-center gap-1.5 fs-xs font-mono tracking-wider uppercase text-neutral-400 ${!isAI ? 'justify-end' : ''}`}>
            <span className="font-bold text-[#1A1A1A]/50">{isAI ? (lang === 'zh' ? 'Atelier AI' : 'ATELIER AI') : (lang === 'zh' ? '您' : 'CLIENT')}</span>
            <span>·</span><span>{msg.timestamp}</span>
          </div>
          <div className={`gsyen-message-body text-left leading-relaxed select-text break-words [overflow-wrap:anywhere] ${isAI ? 'pt-0.5' : 'max-w-full px-5 py-3.5 bg-[#1A1A1A] text-white rounded-2xl rounded-tr-none shadow-sm font-medium'}`}>
            {!!msg.attachments?.length && (
              <div className="mb-3 flex flex-wrap gap-2">
                {msg.attachments.map(item => item.type === 'image' ? (
                  <button key={item.id} type="button" onClick={() => setPreview(item)}
                    className={`gsyen-message-thumb block overflow-hidden border bg-white/10 cursor-zoom-in transition-opacity hover:opacity-80 ${isAI ? 'border-[#1A1A1A]/10' : 'border-white/20'}`}
                    aria-label={lang === 'zh' ? '放大图片' : 'Open image'}>
                    <img src={item.dataUrl} alt={item.name} className="h-24 w-32 max-w-full object-cover" />
                  </button>
                ) : (
                  <div key={item.id} className={`flex min-w-48 max-w-64 items-center gap-2 border px-3 py-2 text-left ${isAI ? 'border-[#1A1A1A]/10 bg-[#F9F8F6]' : 'border-white/20 bg-white/10'}`}>
                    <DocumentIcon kind={item.documentKind} />
                    <div className="min-w-0"><p className="truncate text-[10px] font-mono font-bold tracking-wide">{item.name}</p>
                      <p className={`mt-1 text-[9px] font-mono uppercase tracking-wider ${isAI ? 'text-[#1A1A1A]/45' : 'text-white/50'}`}>
                        {item.status === 'empty' ? (lang === 'zh' ? '无可读取文本' : 'NO READABLE TEXT') : `${item.extractedChars.toLocaleString()} ${lang === 'zh' ? '字 · 已加入资料' : 'CHARS · ADDED'}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-1">
              {msg.content || isStreaming ? renderMessageContent(msg.content, isAI, streamingCaret) : null}
            </div>
            {isAI && !isStreaming && msg.card && <ActionCardView card={msg.card} lang={lang} />}
            {isAI && !isStreaming && (
              <div className="gsyen-message-actions mt-4 pt-3.5 border-t border-[#1A1A1A]/5 flex items-center justify-end gap-3.5">
                <button onClick={() => onCopy(msg.id, copyText)} disabled={!copyText}
                  className="fs-xs font-mono uppercase tracking-widest text-neutral-400 hover:text-[#1A1A1A] disabled:opacity-30 transition-colors flex items-center gap-1">
                  {copied ? <><CheckIcon className="w-2.5 h-2.5 text-emerald-600" /><span className="text-emerald-600 font-bold">{lang === 'zh' ? '已复制' : 'COPIED'}</span></> : <><CopyIcon className="w-2.5 h-2.5" /><span>{lang === 'zh' ? '复制' : 'COPY'}</span></>}
                </button>
                <button onClick={() => exportQuoteCard(msg, lang)} className="fs-xs font-mono uppercase tracking-widest text-neutral-400 hover:text-[#1A1A1A] transition-colors flex items-center gap-1">
                  <DownloadIcon className="w-2.5 h-2.5" /><span>{lang === 'zh' ? '灵感卡片' : 'CARD'}</span>
                </button>
              </div>
            )}
          </div>
          {!isAI && copyText && (
            <div className="gsyen-user-copy-row flex justify-end pt-1">
              <button onClick={() => onCopy(msg.id, copyText)}
                className="fs-xs font-mono uppercase tracking-widest text-neutral-400 hover:text-[#1A1A1A] disabled:opacity-30 transition-colors flex items-center gap-1">
                {copied ? <><CheckIcon className="w-2.5 h-2.5 text-emerald-600" /><span className="text-emerald-600 font-bold">{lang === 'zh' ? '已复制' : 'COPIED'}</span></> : <><CopyIcon className="w-2.5 h-2.5" /><span>{lang === 'zh' ? '复制' : 'COPY'}</span></>}
              </button>
            </div>
          )}
        </div>
      </motion.div>

      {preview && (
        <ChatImageLightbox
          key={preview.id}
          images={images}
          initialImageId={preview.id}
          lang={lang}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}
