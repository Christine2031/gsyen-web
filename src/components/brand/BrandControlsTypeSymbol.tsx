import React, { useState, useMemo } from 'react';
import { Type, Sparkles } from 'lucide-react';
import { LogoConfig, FontFamilyType, TrackingType } from '../../types';
import { SYMBOLS } from '../../data';
import { translations, SYMBOL_TRANSLATIONS, CATEGORY_TRANSLATIONS } from '../../translations';
import { iconMap, fontClassMap, logoFallbackIcon } from './logoAssets';

interface Props {
  lang: 'zh' | 'en';
  config: LogoConfig;
  setConfig: React.Dispatch<React.SetStateAction<LogoConfig>>;
}

const FONT_LABELS: Record<FontFamilyType, { zh: string; en: string }> = {
  sans:    { zh: 'Inter (简谐)', en: 'Inter (Clean)' },
  display: { zh: 'Outfit (摩登)', en: 'Outfit' },
  space:   { zh: 'Space Grotesk (前卫)', en: 'Space Grotesk' },
  serif:   { zh: 'Playfair (儒雅衬线)', en: 'Playfair' },
  cinzel:  { zh: 'Cinzel (至臻碑文)', en: 'Cinzel (Luxury)' },
  mono:    { zh: 'JetBrains Mono (科技等宽)', en: 'JetBrains Mono' },
};

const TRACKING_ZH: Record<TrackingType, string> = { tight: '紧凑', normal: '标准', wide: '宽阔', widest: '极宽' };

/** 侧栏下半：字体排印 + 标识符号选择 + 尺寸/旋转/描边滑块 */
export default function BrandControlsTypeSymbol({ lang, config, setConfig }: Props) {
  const t = translations[lang];
  const [activeSymbolCategory, setActiveSymbolCategory] = useState<'all' | 'core' | 'tech' | 'abstract' | 'retail' | 'nature'>('all');

  const filteredSymbols = useMemo(
    () => (activeSymbolCategory === 'all' ? SYMBOLS : SYMBOLS.filter(s => s.category === activeSymbolCategory)),
    [activeSymbolCategory],
  );

  return (
    <>
      {/* 字体排印 */}
      <div className="space-y-4">
        <h3 className="text-(--fs-sm) font-mono tracking-[0.2em] text-[#1A1A1A] uppercase font-bold flex items-center gap-2">
          <Type className="w-3.5 h-3.5" /> {t.bookTypographySetup}
        </h3>
        <div>
          <label className="block text-(--fs-xs) tracking-[0.15em] font-mono text-[#1A1A1A]/60 uppercase mb-1.5">{t.selectedEditorialTypeface}</label>
          <div className="grid grid-cols-2 gap-2">
            {(['sans', 'display', 'space', 'serif', 'cinzel', 'mono'] as FontFamilyType[]).map(f => (
              <button
                key={f}
                onClick={() => setConfig(prev => ({ ...prev, fontFamily: f }))}
                className={`p-2.5 rounded-none text-left border transition-all ${
                  config.fontFamily === f ? 'border-[#1A1A1A] bg-[#1A1A1A] text-[#F9F8F6]' : 'border-[#1A1A1A]/15 bg-white text-[#1A1A1A]/70 hover:text-[#1A1A1A] hover:bg-white'
                }`}
              >
                <span className={`text-xs block capitalize ${fontClassMap[f]}`}>{FONT_LABELS[f][lang]}</span>
                <span className="text-(--fs-xs) opacity-60 font-mono tracking-widest uppercase">{lang === 'zh' ? '选择' : 'Select'}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-(--fs-xs) tracking-[0.15em] font-mono text-[#1A1A1A]/60 uppercase mb-1.5">{t.microTrackingScale}</label>
          <div className="grid grid-cols-4 gap-1 bg-[#1A1A1A]/5 p-1 rounded-none border border-[#1A1A1A]/10">
            {(['tight', 'normal', 'wide', 'widest'] as TrackingType[]).map(tText => (
              <button
                key={tText}
                onClick={() => setConfig(prev => ({ ...prev, fontTracking: tText }))}
                className={`py-1.5 rounded-none text-(--fs-xs) uppercase tracking-wider transition-all ${
                  config.fontTracking === tText ? 'bg-[#1A1A1A] text-[#F9F8F6] font-bold' : 'text-[#1A1A1A]/60 hover:text-[#1A1A1A]'
                }`}
              >
                {lang === 'zh' ? TRACKING_ZH[tText] : tText}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between pt-1">
          <span className="text-(--fs-xs) tracking-[0.15em] font-mono text-[#1A1A1A]/60 uppercase">{t.forceCapitalization}</span>
          <button
            onClick={() => setConfig(prev => ({ ...prev, textUppercase: !prev.textUppercase }))}
            className={`w-9 h-5 rounded-none p-0.5 transition-all focus:outline-none ${config.textUppercase ? 'bg-[#1A1A1A]' : 'bg-[#1A1A1A]/20'}`}
          >
            <div className={`w-4 h-4 rounded-none bg-white transition-all ${config.textUppercase ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
        </div>
      </div>

      <hr className="border-[#1A1A1A]/10" />

      {/* 标识符号 */}
      <div className="space-y-4">
        <h3 className="text-(--fs-sm) font-mono tracking-[0.2em] text-[#1A1A1A] uppercase font-bold flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5" /> {t.designInsigniaSymbol}
        </h3>
        <div className="flex flex-wrap gap-1">
          {(['all', 'core', 'tech', 'abstract', 'retail', 'nature'] as const).map(cat => (
            <button
              key={cat}
              onClick={() => setActiveSymbolCategory(cat)}
              className={`px-2.5 py-1 text-(--fs-2xs) font-mono font-bold tracking-widest rounded-none transition-all border uppercase ${
                activeSymbolCategory === cat ? 'border-[#1A1A1A] bg-[#1A1A1A] text-[#F9F8F6]' : 'border-[#1A1A1A]/10 bg-white/40 text-[#1A1A1A]/50 hover:text-[#1A1A1A]'
              }`}
            >
              {lang === 'zh' && CATEGORY_TRANSLATIONS[cat] ? CATEGORY_TRANSLATIONS[cat] : cat}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-6 gap-2">
          {filteredSymbols.map(sym => {
            const IconComponent = iconMap[sym.id] || logoFallbackIcon;
            const symTranslatedName = lang === 'zh' && SYMBOL_TRANSLATIONS[sym.name] ? SYMBOL_TRANSLATIONS[sym.name] : sym.name;
            return (
              <button
                key={sym.id}
                onClick={() => setConfig(prev => ({ ...prev, iconName: sym.id }))}
                className={`p-2 rounded-none transition-all aspect-square flex flex-col items-center justify-center border ${
                  config.iconName === sym.id ? 'border-[#1A1A1A] bg-[#1A1A1A] text-[#F9F8F6]' : 'border-[#1A1A1A]/10 bg-white/40 text-[#1A1A1A]/50 hover:text-[#1A1A1A] hover:bg-white'
                }`}
                title={symTranslatedName}
              >
                <IconComponent size={18} strokeWidth={1.5} />
              </button>
            );
          })}
        </div>

        {/* 滑块参数 */}
        <div className="space-y-3 pt-2">
          <SliderRow
            label={`${t.symbolHeight} (${config.iconSize}px)`} resetLabel={t.reset}
            min={24} max={180} step={1} value={config.iconSize}
            onReset={() => setConfig(prev => ({ ...prev, iconSize: 42 }))}
            onChange={v => setConfig(prev => ({ ...prev, iconSize: v }))}
          />
          <SliderRow
            label={`${t.insigniaRotation} (${config.iconRotation}°)`} resetLabel={t.reset}
            min={-180} max={180} step={1} value={config.iconRotation}
            onReset={() => setConfig(prev => ({ ...prev, iconRotation: 0 }))}
            onChange={v => setConfig(prev => ({ ...prev, iconRotation: v }))}
          />
          <SliderRow
            label={`${t.strokePrecision} (${config.iconStrokeWidth.toFixed(1)}x)`} resetLabel={t.reset}
            min={1} max={3} step={0.5} value={config.iconStrokeWidth}
            onReset={() => setConfig(prev => ({ ...prev, iconStrokeWidth: 1.5 }))}
            onChange={v => setConfig(prev => ({ ...prev, iconStrokeWidth: v }))}
          />
        </div>
      </div>
    </>
  );
}

interface SliderRowProps {
  label: string; resetLabel: string;
  min: number; max: number; step: number; value: number;
  onReset: () => void; onChange: (v: number) => void;
}

function SliderRow({ label, resetLabel, min, max, step, value, onReset, onChange }: SliderRowProps) {
  return (
    <div>
      <div className="flex justify-between text-(--fs-xs) tracking-wider text-[#1A1A1A]/60 font-mono uppercase mb-1">
        <span>{label}</span>
        <button onClick={onReset} className="text-(--fs-xs) text-[#1A1A1A] font-bold hover:underline">{resetLabel}</button>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(step < 1 ? parseFloat(e.target.value) : parseInt(e.target.value))}
        className="w-full h-1 bg-[#1A1A1A]/10 rounded-none appearance-none cursor-pointer accent-[#1A1A1A]"
      />
    </div>
  );
}
