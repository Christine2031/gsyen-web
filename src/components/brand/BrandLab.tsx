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
import BrandContacts from './BrandContacts';
import BrandTeam from './BrandTeam';
import PrismRoutes from './PrismRoutes';
import BrandMember from './BrandMember';

type BrandTab = 'studio' | 'collateral' | 'expert' | 'orders' | 'contacts' | 'team' | 'routes' | 'member';

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

export type { BrandTab };

interface BrandLabProps {
  lang: 'zh' | 'en';
  requestedTab?: BrandTab;
  onTabConsumed?: () => void;
}

/**
 * Brand Lab — 标识美学设计器（从 App.tsx 抽出）。
 * 自持 LogoConfig 状态与子标签，派生调色板/SVG，编排侧栏控件与预览三视图。
 */
export default function BrandLab({ lang, requestedTab, onTabConsumed }: BrandLabProps) {
  const t = translations[lang];
  const [config, setConfig] = useState<LogoConfig>(DEFAULT_CONFIG);
  const [activeTab, setActiveTab] = useState<BrandTab>(requestedTab ?? 'studio');
  const [isCopied, setIsCopied] = useState(false);

  React.useEffect(() => {
    if (requestedTab) {
      setActiveTab(requestedTab);
      onTabConsumed?.();
    }
  }, [requestedTab]);

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
      className={`px-3.5 py-1.5 text-[10px] font-mono font-bold uppercase tracking-widest transition-all rounded-none ${
        activeTab === tab ? 'bg-[#1A1A1A] text-white' : 'text-[#1A1A1A]/60 hover:bg-[#1A1A1A]/5'
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      {/* 品牌子标签条 — 透明无色带，切换器样式与日历视图切换统一 */}
      <div className="relative shrink-0 h-[52px] flex items-center px-8 border-b border-[#1A1A1A]/8 bg-[#F4F2EE]">
        <div className="flex items-center gap-1 border border-[#1A1A1A]/10 p-1 bg-[#F9F8F6]/40">
          {tabBtn('orders', lang === 'zh' ? '订单' : 'Orders')}
          {tabBtn('contacts', lang === 'zh' ? '往来' : 'Contacts')}
          {tabBtn('expert', t.creativeAssistant)}
          {tabBtn('studio', t.studioCanvas)}
          {tabBtn('collateral', t.collateralMockups)}
          {tabBtn('routes', lang === 'zh' ? '穹弯算筹' : 'Halfsphere')}
          {tabBtn('member', lang === 'zh' ? '会员中心' : 'Membership')}
        </div>
      </div>


      <div className="flex-1 flex flex-col lg:flex-row min-h-0" id="main-studio-workspace">
        {/* 左侧控制面板 — 订单/往来/线路页时隐藏 */}
        {activeTab !== 'orders' && activeTab !== 'contacts' && activeTab !== 'team' && activeTab !== 'routes' && activeTab !== 'member' && (
          <aside className="w-full lg:w-[420px] border-r border-[#1A1A1A]/10 bg-[#F4F2EE] px-6 pb-6 pt-0 overflow-y-auto space-y-7 flex-shrink-0" id="design-control-sidebar">
            <BrandControlsIdentity lang={lang} config={config} setConfig={setConfig} />
            <hr className="border-[#1A1A1A]/10" />
            <BrandControlsTypeSymbol lang={lang} config={config} setConfig={setConfig} />
          </aside>
        )}

        {/* 预览工作区 */}
        <main className="flex-1 bg-[#F9F8F6] px-8 pb-8 pt-0 flex flex-col min-h-0" id="studio-preview-main">
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
            {activeTab === 'contacts' && (
              <BrandContacts key="contacts" lang={lang} />
            )}
            {activeTab === 'team' && (
              <BrandTeam key="team" />
            )}
            {activeTab === 'routes' && (
              <PrismRoutes key="routes" />
            )}
            {activeTab === 'member' && (
              <BrandMember key="member" lang={lang} />
            )}
          </AnimatePresence>

        </main>
      </div>
    </>
  );
}
