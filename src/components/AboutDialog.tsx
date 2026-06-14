import { useState, useEffect } from 'react';
import { X, RefreshCw } from 'lucide-react';
import VintageCar from './VintageCar';

interface AboutDialogProps {
  lang: 'zh' | 'en';
  onClose: () => void;
}

export default function AboutDialog({ lang, onClose }: AboutDialogProps) {
  const api = (window as any).electronAPI;
  const [version, setVersion] = useState('');
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);

  useEffect(() => {
    api?.getVersion().then((v: string) => setVersion(v));
  }, []);

  const checkUpdate = async () => {
    if (!api?.updater) return;
    setChecking(true);
    setCheckResult(null);
    api.updater.onNotAvailable(() => {
      setChecking(false);
      setCheckResult(lang === 'zh' ? '已是最新版本' : 'Already up to date');
    });
    api.updater.onAvailable((info: any) => {
      setChecking(false);
      setCheckResult(lang === 'zh' ? `发现新版本 v${info.version}，正在下载…` : `v${info.version} found, downloading…`);
    });
    api.updater.onError(() => {
      setChecking(false);
      setCheckResult(lang === 'zh' ? '检查失败，请稍后重试' : 'Check failed, try again later');
    });
    await api.updater.check();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#F9F8F6] border border-[#1A1A1A]/12 w-72 flex flex-col items-center gap-0 shadow-xl"
        onClick={e => e.stopPropagation()}>

        {/* 关闭按钮 */}
        <div className="w-full flex justify-end px-3 pt-3">
          <button onClick={onClose} className="p-1 text-[#1A1A1A]/30 hover:text-[#1A1A1A] transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Logo */}
        <div className="mt-2 mb-4">
          <VintageCar size={56} className="text-[#1A1A1A]/90" />
        </div>

        {/* 品牌名 */}
        <div className="flex items-baseline gap-2 mb-1">
          <span className="font-serif-sc text-xl font-black tracking-[0.1em] text-[#111]">疆域</span>
          <span className="font-cinzel text-sm font-bold tracking-[0.2em] text-[#111]/80 uppercase">GSYEN</span>
          <span className="font-cinzel text-sm font-bold tracking-[0.15em] text-[#111]/60">for Windows</span>
        </div>

        {/* 版本号 */}
        <p className="text-(--fs-sm) font-mono text-[#1A1A1A]/40 tracking-wider mb-6">
          Version {version || '…'} ({__GIT_SHA__})
        </p>

        {/* 检查更新按钮 */}
        <div className="w-full px-6 mb-3">
          <button onClick={checkUpdate} disabled={checking}
            className="w-full flex items-center justify-center gap-2 py-2 border border-[#1A1A1A]/15 bg-white text-(--fs-sm) font-mono font-bold tracking-widest uppercase text-[#1A1A1A]/70 hover:text-[#1A1A1A] hover:border-[#1A1A1A]/30 transition-all disabled:opacity-50">
            <RefreshCw className={`w-3 h-3 ${checking ? 'animate-spin' : ''}`} />
            {checking ? (lang === 'zh' ? '检查中…' : 'Checking…') : (lang === 'zh' ? '检查更新' : 'Check for Updates')}
          </button>
          {checkResult && (
            <p className="text-(--fs-xs) font-mono text-[#1A1A1A]/50 text-center mt-2">{checkResult}</p>
          )}
        </div>

        {/* 支持链接 */}
        <div className="w-full px-6 mb-6">
          <a href="mailto:Ethan7586@gsyen.com"
            className="w-full flex items-center justify-center py-2 border border-[#1A1A1A]/10 bg-white/60 text-(--fs-sm) font-mono font-bold tracking-widest uppercase text-[#1A1A1A]/50 hover:text-[#1A1A1A] transition-all">
            {lang === 'zh' ? '联系支持' : 'Get Support'}
          </a>
        </div>

        {/* 版权 */}
        <p className="text-(--fs-2xs) font-mono text-[#1A1A1A]/25 tracking-wider pb-1">
          © 2026 雍彻科技 · GSYEN
        </p>
        <p className="text-(--fs-2xs) font-mono text-[#1A1A1A]/15 tracking-wider pb-4">
          All rights reserved.
        </p>
      </div>
    </div>
  );
}
