import React from 'react';
import { motion } from 'motion/react';
import { Crown } from 'lucide-react';
import { LogoConfig } from '../../types';
import { translations } from '../../translations';
import { PaletteColors } from './palette';
import { fontClassMap, trackingClassMap } from './logoAssets';
import { LogoIcon, LogoBadge } from './LogoRender';

interface Props {
  lang: 'zh' | 'en';
  config: LogoConfig;
  colors: PaletteColors;
}

/** Brand Lab · 物料样机标签：名片 / 包装压印 / 落地页 三种真实场景预览 */
export default function BrandCollateral({ lang, config, colors }: Props) {
  const t = translations[lang];

  return (
    <motion.div
      key="collateral-view"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex-1 overflow-y-auto space-y-6 max-h-[80vh]"
      id="collateral-mockups-list"
    >
      {/* 样机 1：高端名片 */}
      <div className="bg-white border border-[#1A1A1A]/10 rounded-none p-6">
        <span className="text-(--fs-xs) font-mono font-bold text-[#1A1A1A]/50 uppercase tracking-widest block mb-4">{t.simulationGrid01}</span>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="aspect-[1.75/1] rounded-none bg-[#F4F2EE] p-8 border border-[#1A1A1A]/10 flex items-center justify-center relative overflow-hidden shadow-sm">
            <div className="text-center scale-90 flex flex-col items-center">
              <LogoBadge config={config} paletteSecondary={colors.secondary} customBg="bg-[#F4F2EE]">
                <LogoIcon config={config} colorClass="text-[#1A1A1A]" size={36} />
              </LogoBadge>
              <h3 className={`text-xl ${fontClassMap[config.fontFamily]} ${trackingClassMap[config.fontTracking]} text-[#1A1A1A] mt-2 ${config.textUppercase ? 'uppercase' : ''}`}>
                {config.brandName || (lang === 'zh' ? '雅致标志' : 'ATELIER')}
              </h3>
              {config.tagline && (
                <p className={`text-(--fs-xs) ${fontClassMap[config.taglineFontFamily]} tracking-widest text-[#1A1A1A]/60 mt-1 uppercase`}>
                  {config.tagline}
                </p>
              )}
            </div>
          </div>

          <div className="aspect-[1.75/1] rounded-none bg-white p-8 border border-[#1A1A1A]/15 flex flex-col justify-between relative overflow-hidden shadow-sm">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-serif font-bold text-[#1A1A1A]">{t.alexanderSterling}</p>
                <p className="text-(--fs-xs) font-mono uppercase tracking-wider text-[#1A1A1A]/50">{t.chiefExecutive}</p>
              </div>
              <div className="scale-70 -translate-y-2">
                <Crown className="w-5 h-5 text-[#1A1A1A]" />
              </div>
            </div>
            <div className="space-y-1 text-(--fs-xs) font-mono text-[#1A1A1A]/60 border-l border-[#1A1A1A]/35 pl-3">
              <p>TEL: +1 (555) 0182 920</p>
              <p>EMAIL: alexander@{config.brandName.toLowerCase().replace(/\s+/g, '') || 'studio'}.com</p>
              <p>HQ: 480 West End Avenue, New York NY</p>
            </div>
          </div>
        </div>
      </div>

      {/* 样机 2：包装压印 */}
      <div className="bg-white border border-[#1A1A1A]/10 rounded-none p-6">
        <span className="text-(--fs-xs) font-mono font-bold text-[#1A1A1A]/50 uppercase tracking-widest block mb-4">{t.simulationGrid02}</span>
        <div className="aspect-[16/7] rounded-none bg-[#F4F2EE] p-8 border border-[#1A1A1A]/10 flex items-center justify-center relative overflow-hidden shadow-sm">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,0,0,0)_0%,rgba(0,0,0,0.03)_100%)]" />
          <div className="bg-[#FFFDF9] text-[#1A1A1A] py-10 px-16 rounded-none text-center shadow-md border border-[#1A1A1A]/10 flex flex-col items-center scale-95 md:scale-100 max-w-sm">
            <div className="mb-3">
              <div className="p-2 border border-[#1A1A1A]/15 rounded-full flex items-center justify-center">
                <LogoIcon config={config} colorClass="text-[#1A1A1A]" size={30} />
              </div>
            </div>
            <h4 className={`text-lg font-bold text-[#1A1A1A] tracking-widest uppercase ${fontClassMap[config.fontFamily]}`}>
              {config.brandName || (lang === 'zh' ? '雅致标志' : 'Atelier')}
            </h4>
            <p className="text-(--fs-2xs) tracking-widest text-[#1A1A1A]/65 uppercase mt-1">
              {config.tagline || (lang === 'zh' ? '特调原装' : 'Original Roast')}
            </p>
            <div className="w-12 h-[1px] bg-[#1A1A1A]/20 my-3" />
            <span className="text-[7px] tracking-widest font-mono text-[#1A1A1A]/40 uppercase font-bold">{t.batchNo}</span>
          </div>
        </div>
      </div>

      {/* 样机 3：落地页 Hero */}
      <div className="bg-white border border-[#1A1A1A]/10 rounded-none p-6">
        <span className="text-(--fs-xs) font-mono font-bold text-[#1A1A1A]/50 uppercase tracking-widest block mb-4">{t.simulationGrid03}</span>
        <div className="p-6 rounded-none border border-[#1A1A1A]/15" style={{ backgroundColor: colors.bg }}>
          <div className="flex items-center justify-between border-b pb-4 shrink-0" style={{ borderColor: `${colors.primary}1a` }}>
            <div className="flex items-center gap-2 scale-90">
              <LogoIcon config={config} colorClass={colors.primary} size={24} />
              <span className={`text-sm font-bold ${fontClassMap[config.fontFamily]} ${config.textUppercase ? 'uppercase' : ''}`} style={{ color: colors.text }}>
                {config.brandName || (lang === 'zh' ? '雅致工坊' : 'Atelier')}
              </span>
            </div>
            <div className="flex items-center gap-6 text-(--fs-md) font-mono" style={{ color: colors.tagline }}>
              <span className="hover:opacity-100 cursor-pointer opacity-70">{t.products}</span>
              <span className="hover:opacity-100 cursor-pointer opacity-70">{t.caseStudies}</span>
              <span className="hover:opacity-100 cursor-pointer opacity-70">{t.philosophy}</span>
              <span className="px-3 py-1 bg-[#1A1A1A] text-[#F9F8F6] font-bold transition-all text-(--fs-sm) hover:bg-[#1A1A1A]/90">{t.launchEngine}</span>
            </div>
          </div>
          <div className="py-12 text-center max-w-lg mx-auto">
            <div className="mb-4 inline-flex items-center justify-center p-3 rounded-none bg-black/5">
              <LogoIcon config={config} colorClass={colors.primary} size={40} />
            </div>
            <h5 className="text-xl font-serif font-medium text-[#1A1A1A] tracking-tight leading-normal">
              {t.poweringSystemPre}<span className="font-serif italic font-bold">{config.brandName || (lang === 'zh' ? '雅致工坊' : 'Atelier')}</span>{t.poweringSystemPost}
            </h5>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
