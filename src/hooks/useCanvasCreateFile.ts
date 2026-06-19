/** useCanvasCreateFile — 新建空白文件（doc/canvas/nodes，doc 分支按 defaultExt 决定格式） */
import { useCallback } from 'react';
import type { FileEntry } from './useFileSystem';
import { fsAdapter } from './useFileSystem';
import { libraryStore } from '../stores/canvasLibraryStore';
import { canvasPrefsStore } from '../stores/canvasPrefsStore';
import { createBlankXlsx, createBlankDocx } from '../utils/createBlankFiles';

type DocType = 'doc' | 'canvas' | 'nodes' | 'image' | 'office';

interface Args {
  setDocType:          (t: DocType) => void;
  setCanvasEverActive: (v: boolean) => void;
  setNodesEverActive:  (v: boolean) => void;
  setActiveFsFile:     (e: FileEntry | null) => void;
  setContent:          (c: string) => void;
  setTitle:            (t: string) => void;
  onFsFileSelect:      (e: FileEntry, text: string) => void;
}

async function writeBinary(path: string, buf: Uint8Array): Promise<void> {
  let b64 = '';
  for (let i = 0; i < buf.length; i++) b64 += String.fromCharCode(buf[i]);
  await (window as any).electronAPI?.writeFileBuffer?.(path, btoa(b64));
}

export function useCanvasCreateFile({
  setDocType, setCanvasEverActive, setNodesEverActive,
  setActiveFsFile, setContent, setTitle, onFsFileSelect,
}: Args) {
  return useCallback(async (type: 'doc' | 'canvas' | 'nodes') => {
    const { selectedFolder, navStack } = libraryStore.get();
    const folder = navStack.length > 0 ? navStack[navStack.length - 1] : selectedFolder;
    if (!folder) return;
    const ts = Date.now(); const fp = folder.path ?? folder.name;

    if (type === 'doc') {
      const def = canvasPrefsStore.get().defaultExt;
      if (def === '.xlsx' || def === '.docx') {
        const ext = def.slice(1);
        const name = `Untitled-${ts}.${ext}`; const path = `${fp}/${name}`;
        await writeBinary(path, def === '.xlsx' ? createBlankXlsx() : createBlankDocx());
        await libraryStore.refreshCurrent();
        onFsFileSelect({ name, path, isMarkdown: false }, '');
        return;
      }
      const name = `Untitled-${ts}${def}`; const path = `${fp}/${name}`;
      const entry: FileEntry = { name, path, isMarkdown: false };
      await fsAdapter.writeFile(entry, ''); await libraryStore.refreshCurrent();
      setDocType('doc'); setActiveFsFile(entry); setContent(''); setTitle('Untitled');
      return;
    }

    const ext = type === 'canvas' ? '.excalidraw' : '.canvas';
    const name = `Untitled-${ts}${ext}`; const path = `${fp}/${name}`;
    const content = type === 'canvas'
      ? JSON.stringify({ type: 'excalidraw', version: 2, source: 'gsyen', elements: [], appState: { viewBackgroundColor: '#ffffff' }, files: {} })
      : JSON.stringify({ nodes: [], edges: [] });
    const entry: FileEntry = { name, path, isMarkdown: false };
    await fsAdapter.writeFile(entry, content); await libraryStore.refreshCurrent();
    setDocType(type === 'canvas' ? 'canvas' : 'nodes');
    if (type === 'canvas') setCanvasEverActive(true); else setNodesEverActive(true);
    setActiveFsFile(entry); setContent(content); setTitle('Untitled');
  }, [setDocType, setCanvasEverActive, setNodesEverActive, setActiveFsFile, setContent, setTitle, onFsFileSelect]);
}
