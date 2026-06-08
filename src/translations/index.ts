// 翻译聚合入口 —— 保持 `import ... from './translations'` 路径不变。
export type { TranslationDict } from './dict';
export { translations } from './dict';
export {
  SYMBOL_TRANSLATIONS,
  PRESET_TRANSLATIONS,
  PALETTE_TRANSLATIONS,
  CATEGORY_TRANSLATIONS,
  TIMEPACE_TRANSLATIONS,
  GEOMETRY_TRANSLATIONS,
  BORDER_TRANSLATIONS,
} from './labels';
