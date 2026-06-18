/**
 * 面板宽度：根据物理屏幕尺寸固定
 * ≥ 1920px (27" 及以上) → 大屏档位
 * <  1920px (笔记本)     → 标准档位
 */
export function useCanvasPanelWidths() {
  return {
    libW:     157,
    doclistW: 242,
  };
}
