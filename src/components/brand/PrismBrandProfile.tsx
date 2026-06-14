import { useState, useEffect } from 'react';
import { Save, Building2 } from 'lucide-react';
import { prismStore, BrandProfile } from '../../stores/prismStore';

interface Props { lang: 'zh' | 'en'; }

const EMPTY: BrandProfile = { name: '', tagline: '', description: '', founded: '', website: '' };

const FIELDS: { key: keyof BrandProfile; zh: string; en: string; multi?: boolean }[] = [
  { key: 'name',        zh: '品牌名称',   en: 'Brand Name' },
  { key: 'tagline',     zh: '品牌标语',   en: 'Tagline' },
  { key: 'description', zh: '品牌简介',   en: 'Description', multi: true },
  { key: 'founded',     zh: '创立年份',   en: 'Founded' },
  { key: 'website',     zh: '官方网址',   en: 'Website' },
];

export default function PrismBrandProfile({ lang }: Props) {
  const zh = lang === 'zh';
  const [form, setForm]     = useState<BrandProfile>(() => ({ ...EMPTY, ...prismStore.getProfile() }));
  const [saved, setSaved]   = useState(false);

  useEffect(() => {
    const sync = () => setForm({ ...EMPTY, ...prismStore.getProfile() });
    window.addEventListener('prism-updated', sync);
    return () => window.removeEventListener('prism-updated', sync);
  }, []);

  const save = () => {
    prismStore.saveProfile(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="bg-white border border-[#1A1A1A]/10 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-[#1A1A1A]/60" strokeWidth={1.5} />
          <span className="text-(--fs-xs) font-mono uppercase tracking-widest font-bold text-[#1A1A1A]">
            {zh ? '品牌档案 · 信息对接' : 'Brand Profile · Data Bridge'}
          </span>
        </div>
        <button onClick={save}
          className={`px-3 py-1 text-(--fs-xs) font-mono uppercase tracking-widest border rounded-none transition-all ${
            saved ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-[#1A1A1A] border-[#1A1A1A] text-white hover:bg-[#1A1A1A]/85'
          }`}>
          <Save className="w-3 h-3 inline mr-1" />
          {saved ? (zh ? '已保存' : 'Saved') : (zh ? '保存' : 'Save')}
        </button>
      </div>

      <p className="text-(--fs-sm) text-[#1A1A1A]/50 font-mono">
        {zh
          ? '此处信息将注入 GEO 语料库，成为 AI 搜索引擎引用的事实锚点。'
          : 'This data feeds the GEO corpus — factual anchors for generative AI citation.'}
      </p>

      <div className="space-y-0 border border-[#1A1A1A]/8">
        {FIELDS.map(({ key, zh: zhLabel, en: enLabel, multi }) => (
          <div key={key} className="flex border-b border-[#1A1A1A]/8 last:border-b-0">
            <span className="w-20 shrink-0 text-(--fs-2xs) font-mono uppercase tracking-widest text-[#1A1A1A]/40 p-3 flex items-start pt-3.5 text-right justify-end border-r border-[#1A1A1A]/8">
              {zh ? zhLabel : enLabel}
            </span>
            {multi ? (
              <textarea
                rows={3}
                value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                className="flex-1 text-(--fs-md) font-mono bg-transparent border-none outline-none text-[#1A1A1A] p-3 resize-none"
                placeholder={zh ? `输入${zhLabel}…` : `Enter ${enLabel}…`}
              />
            ) : (
              <input
                type="text"
                value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                className="flex-1 text-(--fs-md) font-mono bg-transparent border-none outline-none text-[#1A1A1A] p-3"
                placeholder={zh ? `输入${zhLabel}…` : `Enter ${enLabel}…`}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
