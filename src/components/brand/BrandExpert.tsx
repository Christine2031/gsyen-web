import { useState } from 'react';
import { motion } from 'motion/react';
import { Copy, FileText, Layers } from 'lucide-react';
import { LogoConfig, ColorPalette } from '../../types';
import { translations } from '../../translations';
import PrismBrandProfile from './PrismBrandProfile';
import PrismGeoCorpus from './PrismGeoCorpus';
import PrismGeoVerify from './PrismGeoVerify';

interface Props {
  lang:          'zh' | 'en';
  config:        LogoConfig;
  activePalette: ColorPalette;
  svgMarkup:     string;
  isCopied:      boolean;
  onCopy:        () => void;
}

type PrismSection = 'profile' | 'corpus' | 'verify' | 'prompt';

const SECTIONS: { key: PrismSection; zh: string; en: string }[] = [
  { key: 'profile', zh: '品牌档案',   en: 'Brand Profile' },
  { key: 'corpus',  zh: 'GEO 语料库', en: 'GEO Corpus' },
  { key: 'verify',  zh: '引用模拟',   en: 'Citation Sim' },
  { key: 'prompt',  zh: 'AI 提示词',  en: 'AI Prompt' },
];

export default function BrandExpert({ lang, config, activePalette, svgMarkup, isCopied, onCopy }: Props) {
  const t = translations[lang];
  const zh = lang === 'zh';
  const [active, setActive] = useState<PrismSection>('profile');

  const copyPrompt = () => {
    navigator.clipboard.writeText(
      `Minimalist vector logo for '${config.brandName}', ${config.iconName} icon. ` +
      `Color: ${activePalette.name} (${activePalette.primaryHex} / ${activePalette.bgHex}). ` +
      `Geometric, clean, flat, 4k.`
    );
  };

  return (
    <motion.div key="prism-view" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }} className="flex-1 space-y-4">

      {/* PRISM 头 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#1A1A1A]/50" strokeWidth={1.5} />
          <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-[#1A1A1A]">PRISM</span>
          <span className="text-[9px] font-mono text-[#1A1A1A]/40">
            {zh ? '品牌情报 · GEO 生成式搜索优化' : 'Brand Intelligence · Generative Engine Optimization'}
          </span>
        </div>
      </div>

      {/* 内部 tab */}
      <div className="flex gap-1 border-b border-[#1A1A1A]/10 pb-0">
        {SECTIONS.map(s => (
          <button key={s.key} onClick={() => setActive(s.key)}
            className={`px-3 py-1.5 text-[9px] font-mono uppercase tracking-widest rounded-none transition-all border-b-2 -mb-px ${
              active === s.key
                ? 'border-[#1A1A1A] text-[#1A1A1A] font-bold'
                : 'border-transparent text-[#1A1A1A]/45 hover:text-[#1A1A1A]'
            }`}>
            {zh ? s.zh : s.en}
          </button>
        ))}
      </div>

      {/* 内容区 */}
      {active === 'profile' && <PrismBrandProfile lang={lang} />}
      {active === 'corpus'  && <PrismGeoCorpus  lang={lang} />}
      {active === 'verify'  && <PrismGeoVerify  lang={lang} />}

      {active === 'prompt' && (
        <div className="space-y-4">
          <div className="bg-white border border-[#1A1A1A]/10 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-mono uppercase tracking-widest text-[#1A1A1A]/50">{t.autoFormattedPrompt}</span>
              <button onClick={copyPrompt}
                className="text-[9px] font-mono font-bold tracking-widest uppercase text-[#1A1A1A] hover:underline flex items-center gap-1.5">
                <Copy className="w-3.5 h-3.5" /> {t.copyPrompt}
              </button>
            </div>
            <div className="p-4 bg-[#F4F2EE] border border-[#1A1A1A]/10">
              <p className="text-[11px] text-[#1A1A1A]/80 leading-relaxed font-mono">
                "Minimalist vector logo for <span className="font-bold text-[#1A1A1A]">'{config.brandName}'</span>,
                featuring <span className="font-bold">{config.iconName}</span> icon.
                Color palette <span className="font-bold">{activePalette.name}</span>
                ({activePalette.primaryHex} / {activePalette.bgHex}).
                Geometric, pristine, flat, 4k."
              </p>
            </div>
          </div>

          <div className="bg-white border border-[#1A1A1A]/10 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-[9px] font-mono tracking-widest uppercase font-bold flex items-center gap-2 text-[#1A1A1A]">
                <FileText className="w-3.5 h-3.5" /> {t.inlineSourceCode}
              </h4>
              <span className="text-[9px] text-[#1A1A1A]/40 font-mono uppercase tracking-wider">{t.xmlDesc}</span>
            </div>
            <div className="bg-[#F4F2EE] border border-[#1A1A1A]/10 p-4 overflow-x-auto max-h-48">
              <pre className="text-[10px] text-[#1A1A1A]/80 font-mono whitespace-pre">{svgMarkup}</pre>
            </div>
            <button onClick={onCopy}
              className="bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-[10px] uppercase font-mono tracking-widest text-white font-bold px-4 py-2.5 flex items-center gap-2 transition-all">
              <Copy className="w-4 h-4" />
              {isCopied ? t.codeCopied : t.copyToClipboard}
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
