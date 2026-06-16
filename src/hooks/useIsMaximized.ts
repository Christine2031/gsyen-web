import { useState, useEffect } from 'react';

/**
 * 跟踪 Electron 窗口是否最大化，用于窗口控件 max ↔ restore 图标切换。
 * 非 Electron（网页端）或缺少 API 时恒返回 false。
 * 通过主进程 maximize/unmaximize 事件同步，所以 Win+↑、双击标题栏等
 * 系统级最大化也会正确反映，而不只是点击按钮时。
 */
export function useIsMaximized(): boolean {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const win = (window as any).electronAPI?.window;
    if (!win?.onMaximized) return;

    win.isMaximized?.().then((v: boolean) => setMaximized(!!v)).catch(() => {});
    const off = win.onMaximized((v: boolean) => setMaximized(!!v));
    return () => { off?.(); };
  }, []);

  return maximized;
}
