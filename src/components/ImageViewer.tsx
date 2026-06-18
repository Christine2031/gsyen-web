import type { FileEntry } from '../hooks/useFileSystem';
import type { Palette } from './CanvasEditorTypes';

interface Props { entry: FileEntry; P: Palette; }

export function ImageViewer({ entry, P }: Props) {
  const src = `file:///${(entry.path ?? '').replace(/\\/g, '/')}`;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: '100%', height: '100%', background: P.bg, overflow: 'auto', padding: 40,
    }}>
      <img src={src} alt={entry.name}
        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
          borderRadius: 4, boxShadow: '0 4px 24px rgba(0,0,0,0.15)' }} />
    </div>
  );
}
