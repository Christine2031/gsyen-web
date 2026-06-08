/**
 * useDisplayCurrency — 全局「显示币种」开关
 *
 * 产品里只保留两个可点入口：
 *   1) 聊天 LEDGER/PAYMENT 卡片上任意一张带货币的金额
 *   2) 复式财务账簿左上角「累计主营业务收入」金色数字
 * 点击其中任何一个，全站所有金额（聊天历史里的旧卡片 + 财务账簿的三张汇总卡 + 每一笔交易）
 * 都会跟着一起切换 ¥ / $ —— 这是有意为之的"全局联动"，而不是各自独立。
 *
 * 用模块级订阅者列表 + localStorage 实现跨组件、跨刷新、跨标签页同步：
 * - 同页面内多个组件通过 subscribe() 互相通知
 * - 跨标签页/刷新页面通过 localStorage + storage 事件同步
 */
import { useEffect, useState, useCallback } from 'react';
import { Currency } from '../utils/exchangeRate';

const STORAGE_KEY = 'identity_lab_display_currency';
const listeners = new Set<(c: Currency) => void>();

function readStored(): Currency {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'USD' ? 'USD' : 'CNY';
  } catch {
    return 'CNY';
  }
}

function writeStored(c: Currency): void {
  try { localStorage.setItem(STORAGE_KEY, c); } catch { /* ignore quota errors */ }
}

let current: Currency = readStored();

function emit(): void {
  listeners.forEach(fn => fn(current));
}

function setGlobalCurrency(c: Currency): void {
  if (current === c) return;
  current = c;
  writeStored(c);
  emit();
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      const next = readStored();
      if (next !== current) {
        current = next;
        emit();
      }
    }
  });
}

/** 返回 [当前显示币种, 切换函数]——切换会立刻广播给页面上所有订阅者并持久化。 */
export function useDisplayCurrency(): [Currency, () => void] {
  const [value, setValue] = useState<Currency>(current);

  useEffect(() => {
    const listener = (c: Currency) => setValue(c);
    listeners.add(listener);
    setValue(current); // 订阅时同步一次最新值，避免挂载之间的竞态
    return () => { listeners.delete(listener); };
  }, []);

  const toggle = useCallback(() => {
    setGlobalCurrency(current === 'CNY' ? 'USD' : 'CNY');
  }, []);

  return [value, toggle];
}
