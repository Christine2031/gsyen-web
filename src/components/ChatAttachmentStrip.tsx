import type { ChatAttachment, ChatDocumentSource } from '../types/chat';
import { CloseIcon, DocIcon, SpreadsheetIcon } from '../gsyen-designer';

interface Props {
  attachments: Array<ChatAttachment | ChatDocumentSource>;
  lang: 'zh' | 'en';
  onRemove: (id: string) => void;
}

export function ChatAttachmentStrip({ attachments, lang, onRemove }: Props) {
  if (!attachments.length) return null;
  const zh = lang === 'zh';
  return (
    <div className="mb-2 flex items-stretch gap-2 overflow-x-auto pb-0.5">
      {attachments.map(item => item.type === 'image' ? (
        <div key={item.id} className="relative h-14 w-20 shrink-0 border border-[#1A1A1A]/15 bg-[#F9F8F6]">
          <img src={item.dataUrl} alt={item.name} className="h-full w-full object-cover" />
          <RemoveButton onClick={() => onRemove(item.id)} label={zh ? '移除图片' : 'Remove image'} />
        </div>
      ) : (
        <div key={item.id} className="relative flex h-14 min-w-48 max-w-64 shrink-0 items-center gap-2 border border-[#1A1A1A]/15 bg-[#F9F8F6] px-3 pr-8">
          <DocumentIcon kind={item.documentKind} />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[10px] font-mono font-bold tracking-wide text-[#1A1A1A]">{item.name}</p>
            <p className="mt-1 text-[9px] font-mono uppercase tracking-wider text-[#1A1A1A]/45">{documentMeta(item, zh)}</p>
          </div>
          <RemoveButton onClick={() => onRemove(item.id)} label={zh ? '移除文档' : 'Remove document'} />
        </div>
      ))}
    </div>
  );
}

export function DocumentIcon({ kind }: { kind: 'pdf' | 'word' | 'spreadsheet' | 'text' }) {
  const Icon = kind === 'spreadsheet' ? SpreadsheetIcon : DocIcon;
  return <Icon className="h-4 w-4 shrink-0 text-[#1A1A1A]/65" />;
}

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return <button type="button" aria-label={label} onClick={onClick}
    className="absolute -right-1.5 -top-1.5 border border-white bg-[#1A1A1A] p-0.5 text-white">
    <CloseIcon className="h-3 w-3" />
  </button>;
}

function documentMeta(item: Exclude<ChatAttachment | ChatDocumentSource, { type: 'image' }>, zh: boolean): string {
  if (item.status === 'empty') return zh ? '无可读取文本 · 需 OCR' : 'NO READABLE TEXT · OCR NEEDED';
  const locator = item.pageCount ? `${item.pageCount} ${zh ? '页' : 'PAGES'}` : item.sheetCount ? `${item.sheetCount} ${zh ? '表' : 'SHEETS'}` : `${item.extractedChars.toLocaleString()} ${zh ? '字' : 'CHARS'}`;
  return `${locator} · ${item.status === 'partial' ? (zh ? '部分读取' : 'PARTIAL') : (zh ? '已就绪' : 'READY')}`;
}
