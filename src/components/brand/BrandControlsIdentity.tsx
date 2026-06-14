import React from 'react';
import { Palette, Type, Sliders } from 'lucide-react';
import { LogoConfig, LayoutType, BadgeShapeType } from '../../types';
import { COLOR_PALETTES, STYLE_PRESETS } from '../../data';
import {
  translations, PRESET_TRANSLATIONS, PALETTE_TRANSLATIONS, GEOMETRY_TRANSLATIONS, BORDER_TRANSLATIONS,
} from '../../translations';

interface Props {
  lang: 'zh' | 'en';
  config: LogoConfig;
  setConfig: React.Dispatch<React.SetStateAction<LogoConfig>>;
}

/** 侧栏上半：风格预设 + 品牌文本 + 形状徽章 + 调色板 */
export default function BrandControlsIdentity({ lang, config, setConfig }: Props) {
  const t = translations[lang];

  const applyPreset = (presetId: string) => {
    const preset = STYLE_PRESETS.find(p => p.id === presetId);
    if (preset) setConfig(prev => ({ ...prev, ...preset.config }));
  };

  return (
    <>
      {/* 风格预设 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-(--fs-sm) font-mono tracking-[0.2em] text-[#1A1A1A] uppercase font-bold flex items-center gap-2">
            <Palette className="w-3.5 h-3.5" /> {t.identityPresets}
          </h2>
          <span className="text-(--fs-xs) font-mono tracking-widest text-[#1A1A1A]/40 uppercase">{t.selectStyle}</span>
        </div>

        <div className="grid grid-cols-1 gap-2">
          {STYLE_PRESETS.map(preset => {
            const presetTrans = PRESET_TRANSLATIONS[preset.id];
            const presetName = lang === 'zh' && presetTrans ? presetTrans.name : preset.name;
            const presetDesc = lang === 'zh' && presetTrans ? presetTrans.desc : preset.description;
            return (
              <button
                key={preset.id}
                onClick={() => applyPreset(preset.id)}
                className="group relative text-left p-3.5 rounded-none border border-[#1A1A1A]/10 bg-white/40 hover:bg-white transition-all flex items-center justify-between"
              >
                <div className="space-y-1">
                  <p className="text-(--fs-md) font-bold tracking-wider text-[#1A1A1A] uppercase font-mono">{presetName}</p>
                  <p className="text-(--fs-xs) text-[#1A1A1A]/60 line-clamp-1 max-w-[260px] font-serif italic">{presetDesc}</p>
                </div>
                <span className="text-(--fs-xs) font-mono uppercase tracking-wider bg-[#1A1A1A]/5 text-[#1A1A1A] py-1 px-2 rounded-none group-hover:bg-[#1A1A1A] group-hover:text-[#F9F8F6] transition-all">
                  {t.apply}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <hr className="border-[#1A1A1A]/10" />

      {/* 品牌文本 */}
      <div className="space-y-4">
        <h3 className="text-(--fs-sm) font-mono tracking-[0.2em] text-[#1A1A1A] uppercase font-bold flex items-center gap-2">
          <Type className="w-3.5 h-3.5" /> {t.identityParameters}
        </h3>
        <div>
          <label className="block text-(--fs-xs) tracking-[0.15em] font-mono text-[#1A1A1A]/60 uppercase mb-1.5">{t.brandNameLabel}</label>
          <input
            id="brand-name-input"
            type="text"
            value={config.brandName}
            onChange={e => setConfig(prev => ({ ...prev, brandName: e.target.value }))}
            className="w-full bg-white border border-[#1A1A1A]/20 rounded-none px-3.5 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:border-[#1A1A1A]/70 uppercase tracking-widest font-mono font-medium"
            maxLength={24}
          />
        </div>
        <div>
          <label className="block text-(--fs-xs) tracking-[0.15em] font-mono text-[#1A1A1A]/60 uppercase mb-1.5">{t.taglineLabel}</label>
          <input
            id="tagline-input"
            type="text"
            value={config.tagline}
            onChange={e => setConfig(prev => ({ ...prev, tagline: e.target.value }))}
            className="w-full bg-white border border-[#1A1A1A]/20 rounded-none px-3.5 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:border-[#1A1A1A]/70 uppercase tracking-widest font-mono font-medium"
            maxLength={40}
          />
        </div>
      </div>

      <hr className="border-[#1A1A1A]/10" />

      {/* 形状徽章 */}
      <div className="space-y-3">
        <h3 className="text-(--fs-sm) font-mono tracking-[0.2em] text-[#1A1A1A] uppercase font-bold flex items-center gap-2">
          <Sliders className="w-3.5 h-3.5" /> {t.geometryFrame}
        </h3>
        <div>
          <label className="block text-(--fs-xs) tracking-[0.15em] font-mono text-[#1A1A1A]/60 uppercase mb-2">{t.displayComposition}</label>
          <div className="grid grid-cols-5 gap-1 bg-[#1A1A1A]/5 p-1 rounded-none border border-[#1A1A1A]/10">
            {(['horizontal', 'vertical', 'icon-only', 'text-only', 'badge'] as LayoutType[]).map(l => (
              <button
                key={l}
                onClick={() => setConfig(prev => ({ ...prev, layout: l }))}
                className={`py-1 rounded-none text-(--fs-xs) font-bold tracking-wider uppercase transition-all text-center ${
                  config.layout === l ? 'bg-[#1A1A1A] text-[#F9F8F6]' : 'text-[#1A1A1A]/60 hover:text-[#1A1A1A]'
                }`}
              >
                {lang === 'zh' && GEOMETRY_TRANSLATIONS[l] ? GEOMETRY_TRANSLATIONS[l] : l.replace('-', ' ')}
              </button>
            ))}
          </div>
        </div>
        <div className="pt-2">
          <label className="block text-(--fs-xs) tracking-[0.15em] font-mono text-[#1A1A1A]/60 uppercase mb-2">{t.structuralEmblemBorder}</label>
          <div className="grid grid-cols-5 gap-1.5">
            {(['none', 'circle', 'square', 'shield', 'hexagon'] as BadgeShapeType[]).map(b => (
              <button
                key={b}
                onClick={() => setConfig(prev => ({ ...prev, badgeShape: b }))}
                className={`py-2 rounded-none text-(--fs-xs) font-mono transition-all text-center border uppercase font-bold ${
                  config.badgeShape === b ? 'border-[#1A1A1A] bg-[#1A1A1A] text-[#F9F8F6]' : 'border-[#1A1A1A]/15 bg-white text-[#1A1A1A]/50 hover:text-[#1A1A1A]'
                }`}
              >
                {lang === 'zh' && BORDER_TRANSLATIONS[b] ? BORDER_TRANSLATIONS[b] : b}
              </button>
            ))}
          </div>
        </div>
      </div>

      <hr className="border-[#1A1A1A]/10" />

      {/* 调色板 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-(--fs-sm) font-mono tracking-[0.2em] text-[#1A1A1A] uppercase font-bold flex items-center gap-2">
            <Palette className="w-3.5 h-3.5" /> {t.inkTonePalette}
          </h3>
          <button
            onClick={() => setConfig(prev => ({ ...prev, contrastMode: !prev.contrastMode }))}
            className="text-(--fs-xs) font-mono tracking-wider text-[#1A1A1A] uppercase hover:underline flex items-center gap-1 font-bold"
          >
            {t.invertContrastPlay}
          </button>
        </div>
        <div className="space-y-2">
          {COLOR_PALETTES.map(p => {
            const paletteName = lang === 'zh' && PALETTE_TRANSLATIONS[p.id] ? PALETTE_TRANSLATIONS[p.id] : p.name;
            return (
              <button
                key={p.id}
                onClick={() => setConfig(prev => ({ ...prev, colorPaletteId: p.id }))}
                className={`w-full p-2.5 rounded-none border transition-all text-left flex items-center justify-between ${
                  config.colorPaletteId === p.id ? 'border-[#1A1A1A] bg-[#1A1A1A]/5 font-bold' : 'border-[#1A1A1A]/10 bg-white/40 hover:bg-white/80'
                }`}
              >
                <span className="text-(--fs-md) font-mono text-[#1A1A1A] uppercase tracking-wider">{paletteName}</span>
                <div className="flex items-center gap-1">
                  <span className="w-3.5 h-3.5 rounded-full border border-[#1A1A1A]/20" style={{ backgroundColor: p.bgHex }} title="Background" />
                  <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: p.primaryHex }} title="Primary" />
                  <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: p.secondaryHex }} title="Secondary" />
                  <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: p.accentHex }} title="Accent" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
