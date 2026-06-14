import React from 'react';
import { motion } from 'motion/react';
import { LayoutGrid, Copy, Check, Download } from 'lucide-react';
import { LogoConfig, ColorPalette } from '../../types';
import { translations, PALETTE_TRANSLATIONS } from '../../translations';
import { PaletteColors } from './palette';
import { fontClassMap, trackingClassMap } from './logoAssets';
import { LogoIcon, LogoBadge } from './LogoRender';

interface Props {
  lang: 'zh' | 'en';
  config: LogoConfig;
  setConfig: React.Dispatch<React.SetStateAction<LogoConfig>>;
  colors: PaletteColors;
  activePalette: ColorPalette;
  svgMarkup: string;
  isCopied: boolean;
  onCopy: () => void;
}

/** Brand Lab · 工作室画布标签：可视化设置条 + 实时 logo 合成预览 */
export default function BrandStudioCanvas({ lang, config, setConfig, colors, activePalette, svgMarkup, isCopied, onCopy }: Props) {
  const t = translations[lang];
  const toneName = lang === 'zh' && PALETTE_TRANSLATIONS[activePalette.id] ? PALETTE_TRANSLATIONS[activePalette.id] : activePalette.name;

  const downloadSvg = () => {
    const blob = new Blob([svgMarkup], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${config.brandName.toLowerCase()}-brand-logo.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <motion.div
      key="studio-view"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex-1 flex flex-col"
    >
      {/* 可视化设置条 */}
      <div className="flex flex-wrap items-center justify-between border border-[#1A1A1A]/10 bg-white p-4 rounded-none mb-6 gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setConfig(prev => ({ ...prev, gridOverlay: !prev.gridOverlay }))}
            className={`flex items-center gap-2 px-4 py-2 rounded-none text-(--fs-sm) uppercase tracking-widest font-bold transition-all border ${
              config.gridOverlay ? 'bg-[#1A1A1A] text-[#F9F8F6] border-[#1A1A1A]' : 'border-[#1A1A1A]/15 text-[#1A1A1A]/60 hover:text-[#1A1A1A]'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            {config.gridOverlay ? t.gridSystemOn : t.gridSystemHide}
          </button>
          <div className="text-(--fs-sm) text-[#1A1A1A]/50 flex items-center gap-1.5 uppercase tracking-wider font-mono">
            <span>{t.toneSet}:</span>
            <span className="text-[#1A1A1A] font-bold">{toneName}</span>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onCopy}
            className="flex items-center gap-2 bg-transparent hover:bg-[#1A1A1A]/5 text-(--fs-sm) uppercase tracking-wider font-mono font-bold px-4 py-2 rounded-none text-[#1A1A1A] border border-[#1A1A1A] transition-all"
          >
            {isCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            {isCopied ? t.copied : t.copyCleanSvg}
          </button>
          <button
            onClick={downloadSvg}
            className="flex items-center gap-2 bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-(--fs-sm) px-4 py-2 rounded-none text-[#F9F8F6] transition-all font-bold uppercase tracking-widest"
          >
            <Download className="w-4 h-4" />
            {t.exportVectorSvg}
          </button>
        </div>
      </div>

      {/* 画布背景 */}
      <div
        className="flex-1 relative rounded-none border border-[#1A1A1A]/10 overflow-hidden flex items-center justify-center p-8 transition-colors duration-500 shadow-sm"
        style={{ backgroundColor: colors.bg }}
        id="branding-master-backdrop"
      >
        {config.gridOverlay && (
          <div className="absolute inset-0 pointer-events-none select-none overflow-hidden transition-opacity">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#1a1a1a05_1px,transparent_1px),linear-gradient(to_bottom,#1a1a1a05_1px,transparent_1px)] bg-[size:40px_40px]" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-[#1A1A1A]/10 w-44 h-44" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-[#1A1A1A]/15 w-72 h-72" />
            <div className="absolute top-1/2 left-0 w-full h-[1px] border-t border-dashed border-[#1A1A1A]/10" />
            <div className="absolute left-1/2 top-0 h-full w-[1px] border-l border-dashed border-[#1A1A1A]/10" />
            <div className="absolute bottom-6 left-6 font-mono text-(--fs-xs) text-[#1A1A1A]/70 leading-relaxed max-w-[200px] space-y-1 bg-white p-3.5 rounded-none border border-[#1A1A1A]/10 shadow-sm">
              <p className="text-[#1A1A1A] font-bold uppercase tracking-wider mb-1 font-sans text-(--fs-sm)">{t.specificationsBlock}</p>
              <p>{t.canvasLabel}</p>
              <p>{t.symbolLabel}: {config.iconName}</p>
              <p>{t.dimsLabel}: {config.iconSize} x {config.iconSize} px</p>
              <p>{t.rotationLabel}: {config.iconRotation}°</p>
              <p>{t.fontLabel}: {config.fontFamily.toUpperCase()}</p>
              <p>{t.trackingLabel}: {config.fontTracking.toUpperCase()}</p>
            </div>
          </div>
        )}

        {/* logo 合成块 */}
        <div className="text-center z-10 select-none flex flex-col items-center max-w-full">
          {config.layout !== 'text-only' && (
            <div className="mb-4">
              <LogoBadge config={config} paletteSecondary={colors.secondary}>
                <LogoIcon config={config} colorClass={config.contrastMode ? 'text-slate-950' : activePalette.primary} />
              </LogoBadge>
            </div>
          )}

          <div className="flex flex-col items-center">
            {config.layout !== 'icon-only' && (
              <h1
                className={`${fontClassMap[config.fontFamily]} ${trackingClassMap[config.fontTracking]} ${config.textUppercase ? 'uppercase' : ''} transition-all duration-300`}
                style={{ color: colors.text, fontSize: `${Math.max(20, config.iconSize * 0.7)}px`, lineHeight: 1.1 }}
              >
                {config.brandName || t.placeholderBrand}
              </h1>
            )}
            {config.layout !== 'icon-only' && config.layout !== 'text-only' && config.tagline && (
              <p
                className={`${fontClassMap[config.taglineFontFamily || 'sans']} ${trackingClassMap[config.taglineTracking || 'widest']} ${config.taglineUppercase ? 'uppercase' : ''} mt-2 opacity-85 transition-all duration-300 text-xs`}
                style={{ color: colors.tagline, fontSize: `${Math.max(8, config.iconSize * 0.22)}px` }}
              >
                {config.tagline}
              </p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
