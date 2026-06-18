/** useCanvasFileOps — Canvas 文件操作：导入 / 导出 / 打印 */
import { useCallback } from 'react';
import { MenuId } from '../components/CanvasEditorTypes';

interface Params {
  title:         string;
  content:       string;
  onTitleChange: (v: string) => void;
  onContent:     (v: string) => void;
  setActiveMenu: (v: MenuId) => void;
}

export function useCanvasFileOps({ title, content, onTitleChange, onContent, setActiveMenu }: Params) {

  const exportMd = useCallback(() => {
    const blob = new Blob([`# ${title}\n\n${content}`], { type: 'text/markdown' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${title || 'untitled'}.md` });
    a.click(); URL.revokeObjectURL(a.href); setActiveMenu(null);
  }, [title, content, setActiveMenu]);

  const importFile = useCallback(() => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.md,.txt';
    inp.onchange = (ev) => {
      const f = (ev.target as HTMLInputElement).files?.[0]; if (!f) return;
      const r = new FileReader();
      r.onload = (e) => {
        const txt = e.target?.result as string;
        const lines = txt.split('\n');
        const h1 = lines[0].replace(/^#+\s*/, '').trim();
        if (h1) onTitleChange(h1);
        onContent(lines.slice(1).join('\n').trimStart());
      };
      r.readAsText(f);
    };
    inp.click(); setActiveMenu(null);
  }, [onTitleChange, onContent, setActiveMenu]);

  const printDoc = useCallback(() => {
    const w = window.open('', '_blank', 'width=820,height=700');
    if (!w) return;
    const md = content
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
      .replace(/\n\n/g, '</p><p>');
    w.document.write(`<!DOCTYPE html><html><head>
      <title>${title || 'GSYEN Writer'}</title>
      <meta charset="utf-8"/>
      <style>
        body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
             font-size:16px;line-height:1.85;max-width:680px;margin:48px auto;
             color:#1A1A1A;padding:0 24px}
        h1{font-size:1.8em;font-weight:700;margin:0 0 0.8em}
        h2{font-size:1.4em;font-weight:600;margin:1.6em 0 0.4em}
        h3{font-size:1.1em;font-weight:600;margin:1.4em 0 0.3em}
        p{margin:0.8em 0}li{margin:0.3em 0}
        code{background:#f4f4f4;padding:1px 5px;border-radius:3px;font-size:0.9em;font-family:monospace}
        strong{font-weight:700}
        @media print{body{margin:0;padding:20px}}
      </style>
    </head><body>
      <h1>${(title || '无标题').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</h1>
      <p>${md}</p>
    </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 250);
    setActiveMenu(null);
  }, [title, content, setActiveMenu]);

  return { exportMd, importFile, printDoc };
}
