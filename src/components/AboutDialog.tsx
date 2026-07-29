import { useState, useEffect } from 'react';
import VintageCar from './VintageCar';
import BrandWordmark from './BrandWordmark';
import { CloseIcon, RefreshIcon } from '../gsyen-designer';

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
    <div className="fixed inset-0 z-[200] flex items-start justify-end bg-[#1A1A1A]/12 backdrop-blur-[1px] p-4 sm:pt-20 sm:pr-10" onClick={onClose}>
      <div className="bg-[#F9F8F6] border border-[#1A1A1A]/14 w-full max-w-[318px] flex flex-col items-center gap-0 shadow-[0_18px_46px_rgba(26,26,26,0.16)]"
        onClick={e => e.stopPropagation()}>

        {/* 关闭按钮 */}
        <div className="w-full flex justify-end px-3 pt-3 pb-1">
          <button onClick={onClose} className="p-1 text-[#1A1A1A]/30 hover:text-[#1A1A1A] transition-colors">
            <CloseIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Logo */}
        <div className="mt-1 mb-3">
          <VintageCar size={38} className="text-[#1A1A1A]/90" />
        </div>

        {/* 品牌名 */}
        <div className="flex items-center gap-2 mb-1 px-6 max-w-full">
          <BrandWordmark height={20} />
          <span className="font-cinzel text-[11px] font-bold tracking-[0.18em] text-[#111]/48 whitespace-nowrap">for Windows</span>
        </div>

        {/* 版本号 */}
        <p className="fs-xs font-mono text-[#1A1A1A]/38 tracking-wider mb-5">
          Version {version || '…'} ({__GIT_SHA__})
        </p>

        {/* 检查更新按钮 */}
        <div className="w-full px-5 mb-3">
          <button onClick={checkUpdate} disabled={checking}
            className="w-full flex items-center justify-center gap-2 py-2 border border-[#1A1A1A]/12 bg-white/70 fs-xs font-mono font-bold tracking-widest uppercase text-[#1A1A1A]/70 hover:text-[#1A1A1A] hover:border-[#1A1A1A]/30 transition-all disabled:opacity-50">
            <RefreshIcon className={`w-3 h-3 ${checking ? 'animate-spin' : ''}`} />
            {checking ? (lang === 'zh' ? '检查中…' : 'Checking…') : (lang === 'zh' ? '检查更新' : 'Check for Updates')}
          </button>
          {checkResult && (
            <p className="fs-xs font-mono text-[#1A1A1A]/50 text-center mt-2">{checkResult}</p>
          )}
        </div>

        {/* 支持链接 */}
        <div className="w-full px-5 mb-5">
          <a href="mailto:Ethan7586@gsyen.com"
            className="w-full flex items-center justify-center py-2 border border-[#1A1A1A]/8 bg-white/45 fs-xs font-mono font-bold tracking-widest uppercase text-[#1A1A1A]/50 hover:text-[#1A1A1A] transition-all">
            {lang === 'zh' ? '联系支持' : 'Get Support'}
          </a>
        </div>

        {/* 版权 */}
        <p className="fs-2xs font-mono text-[#1A1A1A]/25 tracking-wider pb-1">
          © 2026 雍彻科技 · GSYEN
        </p>
        <p className="fs-2xs font-mono text-[#1A1A1A]/15 tracking-wider pb-4">
          All rights reserved.
        </p>
      </div>
    </div>
  );
}
