import React, { useState, useMemo } from 'react';
import { AnimatePresence } from 'motion/react';
import { LogoConfig } from '../../types';
import { translations } from '../../translations';
import { getActivePalette, resolvePaletteColors } from './palette';
import { buildSvgMarkup } from './svgMarkup';
import BrandControlsIdentity from './BrandControlsIdentity';
import BrandControlsTypeSymbol from './BrandControlsTypeSymbol';
import BrandStudioCanvas from './BrandStudioCanvas';
import BrandCollateral from './BrandCollateral';
import BrandExpert from './BrandExpert';
import BrandOrders from './BrandOrders';

type BrandTab = 'studio' | 'collateral' | 'expert' | 'orders';

const DEFAULT_CONFIG: LogoConfig = {
  brandName: 'GSYEN',
  tagline: 'CENTURY CARRIAGE ATELIER',
  layout: 'horizontal',
  fontFamily: 'cinzel',
  taglineFontFamily: 'sans',
  fontTracking: 'widest',
  taglineTracking: 'widest',
  colorPaletteId: 'midnight-gold',
  iconName: 'VintageCar',
  iconSize: 84,
  iconRotation: 0,
  iconStrokeWidth: 1.5,
  badgeShape: 'none',
  textUppercase: true,
  taglineUppercase: true,
  gridOverlay: false,
  contrastMode: false,
};

interface BrandLabProps {
  lang: 'zh' | 'en';
}

/**
 * Brand Lab — 标识美学设计器（从 App.tsx 抽出）。
 * 自持 LogoConfig 状态与子标签，派生调色板/SVG，编排侧栏控件与预览三视图。
 */
export default function BrandLab({ lang }: BrandLabProps) {
  const t = translations[lang];
  const [config, setConfig] = useState<LogoConfig>(DEFAULT_CONFIG);
  const [activeTab, setActiveTab] = useState<BrandTab>('studio');
  const [isCopied, setIsCopied] = useState(false);

  const activePalette = useMemo(() => getActivePalette(config.colorPaletteId), [config.colorPaletteId]);
  const colors = useMemo(() => resolvePaletteColors(activePalette, config.contrastMode), [activePalette, config.contrastMode]);
  const svgMarkup = useMemo(() => buildSvgMarkup(config, colors), [config, colors]);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(svgMarkup);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const tabBtn = (tab: BrandTab, label: string) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`px-3 py-1 rounded-none text-[9px] font-mono tracking-widest uppercase transition-all border ${
        activeTab === tab ? 'bg-white border-[#1A1A1A]/15 text-[#1A1A1A] font-bold' : 'border-transparent text-[#1A1A1A]/50 hover:text-[#1A1A1A] hover:bg-[#1A1A1A]/5'
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      {/* 品牌子标签条 */}
      <div className="bg-[#1A1A1A]/5 border-b border-[#1A1A1A]/10 px-8 py-3 flex items-center gap-4 flex-wrap">
        <span className="text-[9px] font-mono tracking-widest text-[#1A1A1A]/45 uppercase font-bold">
          {lang === 'zh' ? '品牌研发工具集:' : 'ATELIER BRAND LAB ENGINE:'}
        </span>
        <div className="flex gap-1.5 flex-wrap">
          {tabBtn('orders', lang === 'zh' ? '订单' : 'Orders')}
          {tabBtn('expert', t.creativeAssistant)}
          {tabBtn('studio', t.studioCanvas)}
          {tabBtn('collateral', t.collateralMockups)}
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row min-h-0" id="main-studio-workspace">
        {/* 左侧控制面板 — 订单/PRISM 页时隐藏 */}
        {activeTab !== 'orders' && (
          <aside className="w-full lg:w-[420px] border-r border-[#1A1A1A]/10 bg-[#F4F2EE] p-6 overflow-y-auto space-y-7 flex-shrink-0" id="design-control-sidebar">
            <BrandControlsIdentity lang={lang} config={config} setConfig={setConfig} />
            <hr className="border-[#1A1A1A]/10" />
            <BrandControlsTypeSymbol lang={lang} config={config} setConfig={setConfig} />
          </aside>
        )}

        {/* 预览工作区 */}
        <main className="flex-1 bg-[#F9F8F6] p-8 flex flex-col min-h-0" id="studio-preview-main">
          <AnimatePresence mode="wait">
            {activeTab === 'studio' && (
              <BrandStudioCanvas
                key="studio" lang={lang} config={config} setConfig={setConfig}
                colors={colors} activePalette={activePalette} svgMarkup={svgMarkup}
                isCopied={isCopied} onCopy={handleCopyCode}
              />
            )}
            {activeTab === 'collateral' && (
              <BrandCollateral key="collateral" lang={lang} config={config} colors={colors} />
            )}
            {activeTab === 'expert' && (
              <BrandExpert
                key="expert" lang={lang} config={config} activePalette={activePalette}
                svgMarkup={svgMarkup} isCopied={isCopied} onCopy={handleCopyCode}
              />
            )}
            {activeTab === 'orders' && (
              <BrandOrders key="orders" lang={lang} />
            )}
          </AnimatePresence>

          <footer className="mt-auto pt-6 border-t border-[#1A1A1A]/10 text-[9px] text-[#1A1A1A]/40 font-mono uppercase tracking-widest flex flex-col sm:flex-row items-center justify-between gap-4" id="app-footer">
            <p>{lang === 'zh' ? '© 2026 标识美学设计工作室。原生生成合规、生产级可复用的 SVG 矢量资源。' : '© 2026 Logo Design Studio. Generates valid and production-certified SVG assets.'}</p>
            <div className="flex gap-4">
              <span className="hover:text-[#1A1A1A] cursor-pointer">{t.securitySandbox}</span>
              <span className="hover:text-[#1A1A1A] cursor-pointer">{t.reactNativeCompat}</span>
            </div>
          </footer>
        </main>
      </div>
    </>
  );
}
