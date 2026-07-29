// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChatImageAttachment } from '../types/chat';
import { ChatImageLightbox } from './ChatImageLightbox';

const images: ChatImageAttachment[] = [
  { id: 'one', type: 'image', name: 'one.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' },
  { id: 'two', type: 'image', name: 'two.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,BB==' },
];

function Harness() {
  const [open, setOpen] = useState(true);
  return open
    ? <ChatImageLightbox images={images} initialImageId="one" lang="zh" onClose={() => setOpen(false)} />
    : null;
}

describe('ChatImageLightbox', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.innerHTML = '';
    document.body.style.overflow = '';
  });

  it('portals the original image into a modal and locks page scrolling', () => {
    act(() => root.render(<Harness />));

    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.body.querySelector('img')?.getAttribute('src')).toBe(images[0].dataUrl);
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('switches images with arrow keys and closes with Escape', () => {
    act(() => root.render(<Harness />));
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })));
    expect(document.body.querySelector('img')?.getAttribute('alt')).toBe('two.png');

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });
});
