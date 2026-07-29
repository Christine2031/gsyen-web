import type { CardAccent } from './CanvasCardData';

export interface CodeSearchResult {
  id: string;
  title: string;
  relPath: string;
  sourcePath: string;
  lineStart: number;
  lineEnd: number;
  accent: CardAccent;
  note: string;
}

const PROJECT_ROOT = 'C:/Users/Ethan/Desktop/01-Projects/GSYEN/gsyen-web';

const SOURCE_FILES = [
  'src/components/AppHeader.tsx',
  'src/hooks/useHiddenShellDrag.ts',
  'electron/preload.cjs',
  'electron/main.cjs',
  'src/hooks/useIsMaximized.ts',
  'src/components/CanvasChrome.tsx',
  'src/components/CanvasEditorContent.tsx',
  'src/styles/index-layers/34-header-hidden-contract.css',
  'src/styles/index-layers/30-laptop-right-header.css',
];

const HEADER_RESULTS: Omit<CodeSearchResult, 'sourcePath'>[] = [
  { id: 'flat-header-selectors', title: 'AppHeader selectors', relPath: 'src/components/AppHeader.tsx', lineStart: 31, lineEnd: 36, accent: 'red', note: '先看这些选择器，后面所有双击和拖动都靠它们找 DOM 区域。' },
  { id: 'flat-header-hookwire', title: 'useHiddenShellDrag 接入', relPath: 'src/components/AppHeader.tsx', lineStart: 57, lineEnd: 60, accent: 'red', note: '只有 Electron 且 headerHidden=true 时，隐藏态拖动 hook 才接入。' },
  { id: 'line-drag-appheader-dblclick', title: '双击隐藏/显示', relPath: 'src/components/AppHeader.tsx', lineStart: 75, lineEnd: 96, accent: 'red', note: 'document dblclick 监听，决定双击哪里会切换 headerHidden。' },
  { id: 'flat-header-dataset', title: 'data-header-hidden', relPath: 'src/components/AppHeader.tsx', lineStart: 99, lineEnd: 102, accent: 'red', note: '把 headerHidden 写到 html dataset，CSS 从这里读隐藏状态。' },
  { id: 'line-drag-appheader-region', title: 'Header 拖拽区域', relPath: 'src/components/AppHeader.tsx', lineStart: 112, lineEnd: 135, accent: 'red', note: '隐藏 hotzone、header root、double-click zone、WebkitAppRegion 都在这里。' },
  { id: 'flat-header-winctrl', title: 'Windows 三键区域', relPath: 'src/components/AppHeader.tsx', lineStart: 193, lineEnd: 205, accent: 'red', note: '窗口最小化、最大化、关闭按钮必须 no-drag，否则会和拖拽区打架。' },
  { id: 'line-drag-hidden-start', title: '隐藏态手写拖动', relPath: 'src/hooks/useHiddenShellDrag.ts', lineStart: 73, lineEnd: 117, accent: 'purple', note: 'getPosition / setPosition。窗口突然变大或乱动，优先看这里。' },
  { id: 'line-drag-hidden-listeners', title: 'pointer 监听', relPath: 'src/hooks/useHiddenShellDrag.ts', lineStart: 134, lineEnd: 188, accent: 'purple', note: 'document/window pointerdown/move/up 监听，决定哪些区域响应拖拽。' },
  { id: 'flat-preload-window-api', title: 'preload window API', relPath: 'electron/preload.cjs', lineStart: 13, lineEnd: 32, accent: 'purple', note: '把 minimize/maximize/getPosition/setPosition 暴露给前端。' },
  { id: 'line-drag-electron-window', title: '主进程窗口 IPC', relPath: 'electron/main.cjs', lineStart: 92, lineEnd: 109, accent: 'purple', note: 'BrowserWindow 真正执行最大化、取位置、设置位置。' },
  { id: 'flat-main-max-events', title: 'maximize 事件回传', relPath: 'electron/main.cjs', lineStart: 164, lineEnd: 165, accent: 'purple', note: '主进程把 maximize/unmaximize 状态发回前端。' },
  { id: 'flat-use-is-maximized', title: 'useIsMaximized', relPath: 'src/hooks/useIsMaximized.ts', lineStart: 9, lineEnd: 22, accent: 'purple', note: '前端读取并订阅最大化状态，影响三键显示。' },
  { id: 'flat-css-hidden-base', title: 'CSS 禁选 / 指针', relPath: 'src/styles/index-layers/34-header-hidden-contract.css', lineStart: 1, lineEnd: 12, accent: 'yellow', note: 'header、toolbar、hotzone 禁止选中文字，避免拖动体验被文本选中干扰。' },
  { id: 'flat-css-hidden-transition', title: 'Header 显示态动画', relPath: 'src/styles/index-layers/34-header-hidden-contract.css', lineStart: 14, lineEnd: 34, accent: 'yellow', note: 'max-height / opacity / transform transition，显示态长什么样在这里。' },
  { id: 'flat-css-hidden-zone', title: '双击热区 CSS', relPath: 'src/styles/index-layers/34-header-hidden-contract.css', lineStart: 36, lineEnd: 47, accent: 'yellow', note: 'gsyen-shell-double-click-zone 的位置、高度、背景。' },
  { id: 'flat-css-hidden-state', title: 'Header 隐藏态 CSS', relPath: 'src/styles/index-layers/34-header-hidden-contract.css', lineStart: 49, lineEnd: 83, accent: 'yellow', note: 'is-header-hidden 的 max-height、opacity、pointer-events。' },
  { id: 'flat-css-windows-hotzone', title: 'Windows hotzone CSS', relPath: 'src/styles/index-layers/30-laptop-right-header.css', lineStart: 3, lineEnd: 16, accent: 'yellow', note: '顶部 reveal hotzone 的 fixed 位置和 no-drag。' },
  { id: 'line-drag-canvas-chrome', title: 'iG Writer 顶栏 drag', relPath: 'src/components/CanvasChrome.tsx', lineStart: 52, lineEnd: 68, accent: 'gray', note: 'Writer 顶栏也有 WebkitAppRegion: drag，但它不是 AppHeader。' },
  { id: 'line-drag-canvas-strip', title: '隐藏 Chrome 拖拽条', relPath: 'src/components/CanvasEditorContent.tsx', lineStart: 266, lineEnd: 272, accent: 'gray', note: 'Canvas Chrome 隐藏后，保留一条拖拽区域。' },
];

function absolutePath(relPath: string) {
  return `${PROJECT_ROOT}/${relPath}`.replace(/\\/g, '/');
}

async function readSource(relPath: string) {
  const path = absolutePath(relPath);
  const api = (window as any).electronAPI;
  if (api?.readFile) {
    const text = await api.readFile(path);
    if (typeof text === 'string') return text;
  }
  const res = await fetch(`/@fs/${path}`);
  return res.ok ? res.text() : '';
}

function expandedTokens(query: string) {
  const q = query.toLowerCase();
  const tokens = q.split(/[\s,，。:：/\\]+/).filter(token => token.length > 1);
  if (/header|顶部|顶栏|隐藏|收起|拖|窗口|shell/i.test(query)) {
    tokens.push(
      'headerhidden',
      'header_hidden',
      'header-shell',
      'hidden',
      'dblclick',
      'webkitappregion',
      'getposition',
      'setposition',
      'gsyen-shell',
    );
  }
  return [...new Set(tokens)];
}

function isHeaderQuery(query: string) {
  return /header|顶部|顶栏|隐藏|收起|拖|窗口|shell/i.test(query);
}

async function genericSearch(query: string): Promise<CodeSearchResult[]> {
  const tokens = expandedTokens(query);
  if (tokens.length === 0) return [];
  const results: CodeSearchResult[] = [];

  for (const relPath of SOURCE_FILES) {
    const text = await readSource(relPath);
    const lines = text.split(/\r?\n/);
    const matchIndex = lines.findIndex(line => {
      const lower = line.toLowerCase();
      return tokens.some(token => lower.includes(token));
    });
    if (matchIndex < 0) continue;
    const lineStart = Math.max(1, matchIndex - 3);
    const lineEnd = Math.min(lines.length, matchIndex + 7);
    results.push({
      id: `ask-${relPath.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${lineStart}`,
      title: relPath.split('/').at(-1) ?? relPath,
      relPath,
      sourcePath: absolutePath(relPath),
      lineStart,
      lineEnd,
      accent: 'red',
      note: '本地关键词命中。点开后看高亮行附近代码。',
    });
    if (results.length >= 12) break;
  }

  return results;
}

export async function searchLocalCode(query: string): Promise<CodeSearchResult[]> {
  if (isHeaderQuery(query)) {
    return HEADER_RESULTS.map(result => ({
      ...result,
      sourcePath: absolutePath(result.relPath),
    }));
  }
  return genericSearch(query);
}
