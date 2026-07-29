import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ChatImageAttachment } from '../types/chat';
import { ChevronIcon, CloseIcon } from '../gsyen-designer';

interface ChatImageLightboxProps {
  images: ChatImageAttachment[];
  initialImageId: string;
  lang: 'zh' | 'en';
  onClose: () => void;
}

export function ChatImageLightbox({
  images,
  initialImageId,
  lang,
  onClose,
}: ChatImageLightboxProps) {
  const initialIndex = Math.max(0, images.findIndex(image => image.id === initialImageId));
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [actualSize, setActualSize] = useState(false);
  const activeImage = images[activeIndex];
  const hasMultiple = images.length > 1;

  const move = (offset: number) => {
    setActualSize(false);
    setActiveIndex(index => (index + offset + images.length) % images.length);
  };

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft' && hasMultiple) move(-1);
      if (event.key === 'ArrowRight' && hasMultiple) move(1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [hasMultiple, images.length, onClose]);

  if (!activeImage || typeof document === 'undefined') return null;
  const zh = lang === 'zh';

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={zh ? '图片预览' : 'Image preview'}
      className="fixed inset-0 z-[300] flex bg-[#0F0F0F]/95"
      onClick={onClose}
    >
      <button
        type="button"
        autoFocus
        aria-label={zh ? '关闭预览' : 'Close preview'}
        onClick={onClose}
        className="absolute right-5 top-5 z-20 flex h-9 w-9 items-center justify-center border border-white/20 text-white/75 transition-colors hover:bg-white hover:text-[#1A1A1A]"
      >
        <CloseIcon className="h-3.5 w-3.5" />
      </button>

      {hasMultiple && (
        <>
          <NavButton direction="previous" lang={lang} onClick={() => move(-1)} />
          <NavButton direction="next" lang={lang} onClick={() => move(1)} />
        </>
      )}

      <div
        className="flex min-h-0 w-full flex-col items-center px-16 pb-5 pt-16"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex min-h-0 flex-1 w-full items-center justify-center overflow-auto">
          <img
            src={activeImage.dataUrl}
            alt={activeImage.name}
            draggable={false}
            title={zh ? '点击切换适应窗口 / 原始尺寸' : 'Click to toggle fit / actual size'}
            onClick={() => setActualSize(value => !value)}
            className={`select-none border border-white/15 bg-[#0A0A0A] shadow-2xl ${
              actualSize
                ? 'max-h-none max-w-none cursor-zoom-out object-none'
                : 'max-h-[calc(100vh-8rem)] max-w-[calc(100vw-8rem)] cursor-zoom-in object-contain'
            }`}
          />
        </div>

        <div className="mt-4 flex w-full max-w-5xl items-center justify-between gap-5 text-white/65">
          <span className="min-w-0 truncate fs-xs font-mono tracking-widest uppercase">
            {activeImage.name}
          </span>
          <span className="shrink-0 fs-xs font-mono tracking-widest">
            {hasMultiple ? `${activeIndex + 1} / ${images.length} · ` : ''}
            {actualSize ? '1:1' : 'FIT'} · {zh ? 'ESC 关闭' : 'ESC CLOSE'}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function NavButton({
  direction,
  lang,
  onClick,
}: {
  direction: 'previous' | 'next';
  lang: 'zh' | 'en';
  onClick: () => void;
}) {
  const previous = direction === 'previous';
  const label = previous
    ? (lang === 'zh' ? '上一张图片' : 'Previous image')
    : (lang === 'zh' ? '下一张图片' : 'Next image');
  return (
    <button
      type="button"
      aria-label={label}
      onClick={event => {
        event.stopPropagation();
        onClick();
      }}
      className={`absolute top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center border border-white/15 text-white/65 transition-colors hover:bg-white hover:text-[#1A1A1A] ${
        previous ? 'left-5' : 'right-5'
      }`}
    >
      <ChevronIcon className={previous ? 'h-2 w-3 rotate-90' : 'h-2 w-3 -rotate-90'} />
    </button>
  );
}
