/**
 * 实时汇率 — CNY ↔ USD。
 * 用免费、无需 API key 的 open.er-api.com，结果缓存到 localStorage（6 小时有效），
 * 避免每次记账/收款都发请求；离线或请求失败时退回缓存值，再不行退回保守的静态汇率。
 */
export type Currency = 'CNY' | 'USD';

const CACHE_KEY = 'identity_lab_fx_rate';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 小时
const FALLBACK_USD_TO_CNY = 7.2; // 兜底静态汇率（API 不可用时使用）

interface RateCache {
  usdToCny: number;
  fetchedAt: number;
}

function readCache(): RateCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(usdToCny: number): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ usdToCny, fetchedAt: Date.now() } as RateCache));
  } catch { /* ignore quota errors */ }
}

/** Returns 1 USD = N CNY, refreshing from the API when the cache is stale. */
export async function getUsdToCnyRate(): Promise<number> {
  const cached = readCache();
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.usdToCny;
  }
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!res.ok) throw new Error(`fx fetch failed: ${res.status}`);
    const data = await res.json();
    const rate = data?.rates?.CNY;
    if (typeof rate === 'number' && rate > 0) {
      writeCache(rate);
      return rate;
    }
    throw new Error('fx response missing CNY rate');
  } catch {
    // 离线/接口异常 → 用上次缓存（哪怕过期）或静态兜底值
    return cached?.usdToCny ?? FALLBACK_USD_TO_CNY;
  }
}

/** Synchronous best-effort read for render paths that can't await (uses cache/fallback only). */
export function getCachedUsdToCnyRate(): number {
  return readCache()?.usdToCny ?? FALLBACK_USD_TO_CNY;
}

/** Convert an amount between CNY and USD using the given USD→CNY rate. */
export function convertAmount(amount: number, from: Currency, to: Currency, usdToCny: number): number {
  if (from === to) return amount;
  return from === 'USD' ? amount * usdToCny : amount / usdToCny;
}

const SYMBOL: Record<Currency, string> = { CNY: '¥', USD: '$' };
/**
 * 单位符号放在数字左侧（"¥ 100" 而非 "100 ¥"）—— 财务报表的传统排法，
 * 与"复式财务账簿"页面的展示数字保持统一，整个产品的货币写法不再两套标准。
 * 符号与数字之间用窄不换行空格(U+202F)隔开（比 U+2009 细空格在衬线体下更明显），
 * 清楚分开又不会破行；金额最多保留一位小数。
 */
export function formatAmount(amount: number, currency: Currency): string {
  return `${SYMBOL[currency]} ${amount.toLocaleString(undefined, { maximumFractionDigits: 1 })}`;
}

export function detectCurrency(text: string): Currency {
  if (/美元|美金|刀|usd|\$/i.test(text)) return 'USD';
  return 'CNY';
}

/** 从已渲染好的文案片段（如 "+¥500" / "≈ $73.6"）里识别其使用的币种符号。 */
export function detectSymbolCurrency(text: string): Currency {
  return /\$/.test(text) ? 'USD' : 'CNY';
}

// 全局「显示币种」开关已迁移到 ../hooks/useDisplayCurrency —— 那里统一管理跨组件、
// 跨刷新、跨标签页的联动同步（聊天卡片 + 财务账簿左上角收入卡共用同一个全局状态）。
