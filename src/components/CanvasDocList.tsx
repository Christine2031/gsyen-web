/**
 * CanvasDocList — iA Writer 风格平铺文档列表
 * 当前文件夹的 .md/.txt 文件，按最近修改排序，点击打开。
 */
import { useState, useCallback } from 'react';
import { useLibraryStore, libraryStore } from '../stores/canvasLibraryStore';
import { fsAdapter } from '../hooks/useFileSystem';
import type { FileEntry } from '../hooks/useFileSystem';
import { SYS_FONT } from './CanvasEditorTypes';
import type { Palette } from './CanvasEditorTypes';

interface Props { open: boolean; onFileSelect: (e: FileEntry, c: string) => void; P: Palette; }

function relativeDate(ts?: number): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 86_400_000)  return '今天';
  if (diff < 172_800_000) return '昨天';
  return new Date(ts).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

const EmptyDocIcon = ({ color }: { color: string }) => (
  <svg width="24" height="24" viewBox="0 0 13 13" fill="none" stroke={color}
    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.35 }}>
    <rect x="2" y="1" width="9" height="11" rx="1.5" />
    <line x1="4" y1="4.5" x2="9" y2="4.5" />
    <line x1="4" y1="6.5" x2="9" y2="6.5" />
    <line x1="4" y1="8.5" x2="7" y2="8.5" />
  </svg>
);

export function CanvasDocList({ open, onFileSelect, P }: Props) {
  const { selectedFolder, files, selectedFile, loading } = useLibraryStore();
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);

  const handleSelect = useCallback(async (file: FileEntry) => {
    libraryStore.setSelectedFile(file);
    const content = await fsAdapter.readFile(file);
    onFileSelect(file, content);
  }, [onFileSelect]);

  const handleNew = useCallback(async () => {
    if (!selectedFolder) return;
    const name = `新文档-${Date.now()}.md`;
    const blank: FileEntry = {
      name,
      path: selectedFolder.path ? `${selectedFolder.path}/${name}` : name,
      isMarkdown: true,
    };
    if (selectedFolder.handle) {
      const fh = await (selectedFolder.handle as any).getFileHandle(name, { create: true });
      const w  = await fh.createWritable(); await w.write(''); await w.close();
      blank.handle = fh;
    }
    onFileSelect(blank, '');
    libraryStore.setSelectedFile(blank);
    await libraryStore.selectFolder(selectedFolder);
  }, [selectedFolder, onFileSelect]);

  return (
    <div style={{ width: open && selectedFolder ? 200 : 0, overflow: 'hidden', flexShrink: 0,
      transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)',
      borderRight: `0.5px solid ${P.border}`, display: 'flex', flexDirection: 'column',
      background: `${P.chrome}CC` }}>
      <div style={{ width: 200, height: '100%', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ height: 32, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 12px', borderBottom: `0.5px solid ${P.border}`, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: P.menuFg, fontWeight: 500, fontFamily: SYS_FONT,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 148 }}>
            {selectedFolder?.name ?? ''}
          </span>
          <button onClick={handleNew} title="新建文档"
            style={{ fontSize: 16, color: P.menuFg, background: 'transparent',
              border: 'none', cursor: 'pointer', padding: '0 2px', lineHeight: 1, fontFamily: SYS_FONT }}>+</button>
        </div>

        {/* Flat list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>

          {loading && (
            <div style={{ padding: '12px', fontSize: 11, color: P.dim, fontFamily: SYS_FONT }}>读取中...</div>
          )}

          {!loading && files.length === 0 && selectedFolder && (
            <div style={{ padding: '24px 12px 16px', display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 8, textAlign: 'center',
              fontSize: 11, color: P.dim, lineHeight: 1.6, fontFamily: SYS_FONT }}>
              <EmptyDocIcon color={P.menuFg} />
              <div>文件夹为空<br/>点击 + 新建文档</div>
            </div>
          )}

          {files.map(file => {
            const active  = selectedFile?.path === file.path;
            const hovered = hoveredPath === file.path;
            return (
              <div key={file.path} onClick={() => handleSelect(file)}
                onMouseEnter={() => setHoveredPath(file.path)}
                onMouseLeave={() => setHoveredPath(null)}
                style={{ padding: '8px 12px', cursor: 'pointer',
                  borderBottom: `0.5px solid ${P.border}`,
                  borderLeft: active ? `2px solid ${P.accent}` : '2px solid transparent',
                  background: active ? `${P.fg}0A` : hovered ? `${P.fg}06` : 'transparent',
                  transition: 'background 0.12s' }}>
                <div style={{ fontSize: 12, color: P.fg, fontWeight: active ? 500 : 400,
                  fontFamily: SYS_FONT,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {file.name.replace(/\.(md|txt)$/i, '')}
                </div>
                <div style={{ fontSize: 10, color: P.dim, marginTop: 2, fontFamily: SYS_FONT }}>
                  {relativeDate(file.lastModified)}
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
