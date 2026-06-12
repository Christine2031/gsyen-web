import React, { useState, useEffect } from 'react';
import { Link, ShieldCheck, ChevronRight } from 'lucide-react';

const api = (window as any).electronAPI?.v2ray as {
  setKey:    (key: string) => Promise<{ ok: boolean; count?: number; name?: string; error?: string }>;
  setSub:    (url: string) => Promise<{ ok: boolean; count?: number; name?: string; error?: string }>;
  getSubUrl: ()            => Promise<string | null>;
} | undefined;

interface Props {
  connected:   boolean;
  count:       number;
  onActivated: () => void;
}

export default function PrismKeyInput({ connected, count, onActivated }: Props) {
  const [expanded,  setExpanded]  = useState(!connected);
  const [input,     setInput]     = useState('');
  const [subUrl,    setSubUrl]    = useState<string | null>(null);
  const [busy,      setBusy]      = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => {
    api?.getSubUrl().then(url => setSubUrl(url));
  }, [connected]);

  if (!api) return null;

  const isUrl = input.trimStart().startsWith('http');

  async function activate() {
    if (!api || busy || !input.trim()) return;
    setBusy(true);
    setError(null);
    const res = isUrl
      ? await api.setSub(input.trim())
      : await api.setKey(input.trim());
    setBusy(false);
    if (res.ok) {
      setInput('');
      setExpanded(false);
      onActivated();
    } else {
      setError(res.error ?? '激活失败');
    }
  }

  // 已激活且收起 → 一行状态条
  if (connected && !expanded) {
    const displayUrl = subUrl
      ? new URL(subUrl).hostname
      : `${count} 条节点`;
    return (
      <div className="flex items-center justify-between bg-white rounded-xl border border-[#DADCE0] px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-4 h-4 text-[#137333]" strokeWidth={1.8} />
          <span className="text-[12px] text-[#202124] font-medium font-sans">订阅已激活</span>
          <span className="text-[11px] font-mono text-[#9AA0A6]">· {displayUrl}</span>
        </div>
        <button
          onClick={() => setExpanded(true)}
          className="text-[10px] font-mono font-bold tracking-widest uppercase text-[#1A1A1A]/50 hover:text-[#1A1A1A] transition-colors"
        >
          更换
        </button>
      </div>
    );
  }

  // 展开 → 输入框
  return (
    <div className="bg-white rounded-xl border border-[#DADCE0] px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Link className="w-4 h-4 text-[#1A1A1A]/70" strokeWidth={1.8} />
          <span className="text-[10px] font-mono font-bold tracking-[0.18em] uppercase text-[#1A1A1A]/60">
            订阅链接
          </span>
        </div>
        {connected && (
          <button
            onClick={() => { setExpanded(false); setError(null); }}
            className="text-[10px] font-mono font-bold tracking-widest uppercase text-[#1A1A1A]/40 hover:text-[#1A1A1A] transition-colors"
          >
            收起
          </button>
        )}
      </div>

      <textarea
        value={input}
        onChange={e => { setInput(e.target.value); setError(null); }}
        placeholder="粘贴订阅链接（https://maas.gsyen.com/...）或 vless:// 节点…"
        rows={3}
        spellCheck={false}
        className="w-full resize-none rounded-lg border border-[#DADCE0] bg-[#F9F8F6]/60 px-3.5 py-3 text-[12px] font-mono text-[#202124] placeholder:text-[#9AA0A6] outline-none focus:border-[#1A73E8] focus:bg-white transition-colors"
      />

      <div className="flex items-center justify-between mt-3">
        <span className="text-[11px] font-mono text-[#D93025]">{error ?? ''}</span>
        <button
          onClick={activate}
          disabled={busy || !input.trim()}
          className="flex items-center gap-1 px-4 py-1.5 text-[10px] font-mono font-bold tracking-widest uppercase rounded-none bg-[#1A1A1A] text-[#F9F8F6] hover:bg-[#1A1A1A]/80 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {busy ? (isUrl ? '拉取中…' : '激活中…') : '激活'}
          {!busy && <ChevronRight className="w-3 h-3" strokeWidth={2.5} />}
        </button>
      </div>
    </div>
  );
}
