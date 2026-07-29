import { useRef, useState } from 'react';
import { DOCUMENT_ACCEPT } from '../utils/chatDocuments';
import { DocIcon, ImageIcon, PlusIcon } from '../gsyen-designer';

interface Props {
  lang: 'zh' | 'en';
  compact?: boolean;
  onFiles: (files: File[]) => void;
}

export function ChatAttachmentPicker({ lang, compact = false, onFiles }: Props) {
  const [open, setOpen] = useState(false);
  const imageRef = useRef<HTMLInputElement>(null);
  const documentRef = useRef<HTMLInputElement>(null);
  const zh = lang === 'zh';
  const choose = (ref: React.RefObject<HTMLInputElement | null>) => {
    setOpen(false);
    ref.current?.click();
  };

  return (
    <div className="relative shrink-0">
      <input ref={imageRef} type="file" accept="image/*" multiple className="hidden"
        onChange={event => { onFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ''; }} />
      <input ref={documentRef} type="file" accept={DOCUMENT_ACCEPT} multiple className="hidden"
        onChange={event => { onFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ''; }} />
      <button type="button" onClick={() => setOpen(value => !value)}
        aria-label={zh ? '添加资料' : 'Add material'} title={zh ? '添加资料' : 'Add material'}
        className={compact
          ? 'inline-flex h-[30px] w-[30px] items-center justify-center border border-[#1A1A1A]/15 text-neutral-500 hover:bg-[#1A1A1A] hover:text-white transition-colors'
          : 'gsyen-chat-input-button p-3 border border-[#1A1A1A]/15 text-neutral-500 hover:bg-[#1A1A1A] hover:text-white transition-colors rounded-none'}>
        <PlusIcon className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
      </button>
      {open && (
        <div className="absolute bottom-[calc(100%+8px)] left-0 z-30 w-48 border border-[#1A1A1A]/15 bg-[#F9F8F6] p-1 shadow-xl">
          <button type="button" onClick={() => choose(imageRef)}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-[10px] font-mono font-bold tracking-widest uppercase text-[#1A1A1A]/70 hover:bg-[#1A1A1A] hover:text-[#F9F8F6] transition-colors">
            <ImageIcon className="w-3.5 h-3.5" />{zh ? '添加图片' : 'IMAGE'}
          </button>
          <button type="button" onClick={() => choose(documentRef)}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-[10px] font-mono font-bold tracking-widest uppercase text-[#1A1A1A]/70 hover:bg-[#1A1A1A] hover:text-[#F9F8F6] transition-colors">
            <DocIcon className="w-3.5 h-3.5" />{zh ? '添加文档' : 'DOCUMENT'}
          </button>
        </div>
      )}
    </div>
  );
}
