import React, { useState, useEffect, useCallback } from 'react';
import { Copy, RefreshCw, Check } from 'lucide-react';
import { generatePassword, calcStrength, strengthLabels } from './passwordVault';

interface PasswordGeneratorPanelProps {
  lang: 'zh' | 'en';
  /** 每次重新生成后把当前密码上报给父级（供录入表单"绑定生成密码"使用） */
  onGeneratedChange: (pass: string) => void;
}

/** 左栏：密码学密钥生成器（深色控制台，自管全部生成参数） */
export default function PasswordGeneratorPanel({ lang, onGeneratedChange }: PasswordGeneratorPanelProps) {
  const [genLength, setGenLength] = useState(18);
  const [includeUpper, setIncludeUpper] = useState(true);
  const [includeNumbers, setIncludeNumbers] = useState(true);
  const [includeSymbols, setIncludeSymbols] = useState(true);
  const [customPrefix, setCustomPrefix] = useState('');
  const [generatedPass, setGeneratedPass] = useState('');
  const [strengthScore, setStrengthScore] = useState(3);
  const [isCopiedGen, setIsCopiedGen] = useState(false);
  const [nonce, setNonce] = useState(0); // 手动"刷新"按钮触发器

  const report = useCallback(onGeneratedChange, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 任一参数变化（或点刷新）即重新生成，读到的永远是最新选项值
  useEffect(() => {
    const pass = generatePassword({ length: genLength, includeUpper, includeNumbers, includeSymbols, prefix: customPrefix });
    setGeneratedPass(pass);
    setStrengthScore(calcStrength(pass));
    report(pass);
  }, [genLength, includeUpper, includeNumbers, includeSymbols, customPrefix, nonce, report]);

  const copyGenerated = () => {
    navigator.clipboard.writeText(generatedPass);
    setIsCopiedGen(true);
    setTimeout(() => setIsCopiedGen(false), 2000);
  };

  const currentStrength = strengthLabels[strengthScore - 1] || strengthLabels[2];

  const toggleBtn = (active: boolean) =>
    `px-2 py-0.5 text-(--fs-2xs) border font-bold transition-all ${
      active ? 'border-[#E5C158] bg-[#E5C158] text-black' : 'border-white/20 text-white/40'
    }`;

  return (
    <div className="bg-[#1A1A1A] text-white p-5 rounded-none border border-[#1A1A1A] space-y-4">
      <h3 className="text-(--fs-sm) font-mono tracking-[0.2em] uppercase font-bold flex items-center justify-between pb-2 border-b border-white/10 text-[#E5C158]">
        <span>{lang === 'zh' ? '密码学密钥生成器' : 'CRYPTOGRAPHIC ENGINE'}</span>
        <RefreshCw className="w-3.5 h-3.5" />
      </h3>

      {/* 生成结果框 */}
      <div className="space-y-2">
        <div className="relative bg-white/5 border border-white/10 p-3.5 rounded-none font-mono text-xs text-[#F9F8F6] break-all select-all flex items-center justify-between min-h-[50px] pr-12">
          <span>{generatedPass}</span>
          <button
            onClick={copyGenerated}
            className="absolute right-2 top-2 p-2 hover:bg-white/10 text-white/70 hover:text-white transition-all rounded-none"
            title={lang === 'zh' ? '复制到剪贴板' : 'Copy Key'}
          >
            {isCopiedGen ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>

        {/* 实时熵值强度条 */}
        <div className="space-y-1.5 p-2.5 bg-white/5 border border-white/5 rounded-none">
          <div className="flex justify-between items-center text-(--fs-xs) font-mono uppercase tracking-wider">
            <span className="text-white/60">{lang === 'zh' ? '算法安全冗余等级' : 'ENTROPY DEFENSE SCORE'}</span>
            <span className="font-bold text-[#E5C158]">LV.{strengthScore} / 5</span>
          </div>
          <div className="grid grid-cols-5 gap-1">
            {[1, 2, 3, 4, 5].map((cellIdx) => (
              <div
                key={cellIdx}
                className={`h-1.5 rounded-none transition-all ${cellIdx <= strengthScore ? currentStrength.color : 'bg-white/10'}`}
              />
            ))}
          </div>
          <p className="text-(--fs-xs) font-mono uppercase text-[#E5C158] italic tracking-tight pt-1">
            &gt; {lang === 'zh' ? currentStrength.labelZh : currentStrength.labelEn}
          </p>
        </div>
      </div>

      {/* 控制项 */}
      <div className="space-y-3 pt-1 text-xs">
        <div className="space-y-1">
          <div className="flex justify-between font-mono text-(--fs-xs) text-white/50 uppercase">
            <span>{lang === 'zh' ? '密钥符号长度' : 'ALGORITHMIC REQUISITE LENGTH'}</span>
            <span className="text-[#E5C158] font-bold">{genLength} bytes</span>
          </div>
          <input
            type="range"
            min="8"
            max="64"
            value={genLength}
            onChange={(e) => setGenLength(parseInt(e.target.value))}
            className="w-full accent-[#E5C158] bg-white/10 h-1"
          />
        </div>

        <div>
          <label className="block font-mono text-(--fs-xs) text-white/50 uppercase mb-1">
            {lang === 'zh' ? '指定固定开头前缀 (可用于开发辨别)' : 'STATIC PREFIX HEAD (e.g. ATELIER_)'}
          </label>
          <input
            type="text"
            value={customPrefix}
            onChange={(e) => setCustomPrefix(e.target.value)}
            placeholder="e.g. KEY_"
            className="w-full px-3 py-1.5 text-xs bg-white/5 border border-white/15 focus:outline-none focus:border-white/40 text-white font-mono rounded-none"
          />
        </div>

        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between font-mono text-(--fs-sm) text-white/80">
            <span>A-Z (大写英文字母)</span>
            <button onClick={() => setIncludeUpper(!includeUpper)} className={toggleBtn(includeUpper)}>
              {includeUpper ? 'ENABLED' : 'DISABLED'}
            </button>
          </div>
          <div className="flex items-center justify-between font-mono text-(--fs-sm) text-white/80">
            <span>0-9 (数字字符)</span>
            <button onClick={() => setIncludeNumbers(!includeNumbers)} className={toggleBtn(includeNumbers)}>
              {includeNumbers ? 'ENABLED' : 'DISABLED'}
            </button>
          </div>
          <div className="flex items-center justify-between font-mono text-(--fs-sm) text-white/80">
            <span>#@% (特殊高强度符号)</span>
            <button onClick={() => setIncludeSymbols(!includeSymbols)} className={toggleBtn(includeSymbols)}>
              {includeSymbols ? 'ENABLED' : 'DISABLED'}
            </button>
          </div>
        </div>

        <button
          onClick={() => setNonce((n) => n + 1)}
          className="w-full py-2 bg-white hover:bg-white/90 text-black font-mono font-bold uppercase text-(--fs-sm) tracking-widest transition-all mt-4"
        >
          {lang === 'zh' ? '刷新随机高强密码' : 'REGENERATED ENTROPY'}
        </button>
      </div>
    </div>
  );
}
