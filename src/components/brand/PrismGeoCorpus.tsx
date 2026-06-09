import { useState, useEffect } from 'react';
import { Plus, Trash2, Copy, Check, Pencil, X, Database } from 'lucide-react';
import { prismStore, CorpusItem, CorpusCategory } from '../../stores/prismStore';

interface Props { lang: 'zh' | 'en'; }

const CATS: { key: CorpusCategory; zh: string; en: string }[] = [
  { key: 'brand',   zh: '品牌',   en: 'Brand' },
  { key: 'product', zh: '产品',   en: 'Product' },
  { key: 'story',   zh: '故事',   en: 'Story' },
  { key: 'qa',      zh: '问答',   en: 'Q&A' },
];

const newItem = (): CorpusItem => ({
  id: `geo-${Date.now()}`, category: 'brand', title: '', content: '', keywords: [],
});

export default function PrismGeoCorpus({ lang }: Props) {
  const zh = lang === 'zh';
  const [items,      setItems]      = useState<CorpusItem[]>(() => prismStore.getCorpus());
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [draft,      setDraft]      = useState<CorpusItem | null>(null);
  const [adding,     setAdding]     = useState(false);
  const [addDraft,   setAddDraft]   = useState<CorpusItem>(newItem);
  const [copied,     setCopied]     = useState(false);

  useEffect(() => {
    const sync = () => setItems(prismStore.getCorpus());
    window.addEventListener('prism-updated', sync);
    return () => window.removeEventListener('prism-updated', sync);
  }, []);

  const saveEdit = () => {
    if (!draft) return;
    prismStore.updateCorpusItem(draft.id, draft);
    setEditingId(null); setDraft(null);
  };

  const saveAdd = () => {
    if (!addDraft.title.trim()) return;
    prismStore.addCorpusItem(addDraft);
    setAdding(false); setAddDraft(newItem());
  };

  const remove = (id: string) => prismStore.removeCorpusItem(id);

  const copyAll = () => {
    navigator.clipboard.writeText(prismStore.exportCorpusText());
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const kwStr = (kw: string[]) => kw.join(', ');
  const kwArr = (s: string) => s.split(',').map(k => k.trim()).filter(Boolean);

  const CorpusForm = ({ item, onSave, onCancel, onChange }: {
    item: CorpusItem;
    onSave: () => void; onCancel: () => void;
    onChange: (patch: Partial<CorpusItem>) => void;
  }) => (
    <div className="border border-[#1A1A1A]/10 bg-[#F9F8F6] p-3 space-y-2">
      {[
        { label: zh ? '标题' : 'Title',   field: 'title'   as const, multi: false },
        { label: zh ? '内容' : 'Content', field: 'content' as const, multi: true  },
        { label: zh ? '关键词(逗号分隔)' : 'Keywords (comma-sep)', field: 'keywords' as const, multi: false },
      ].map(({ label, field, multi }) => (
        <div key={field} className="flex items-start gap-3 border-b border-[#1A1A1A]/8 pb-2">
          <span className="text-[8px] font-mono uppercase tracking-widest w-16 shrink-0 text-right text-[#1A1A1A]/40 pt-1">{label}</span>
          {multi ? (
            <textarea rows={3} value={item[field] as string}
              onChange={e => onChange({ [field]: e.target.value })}
              className="flex-1 text-[11px] font-mono bg-transparent border-none outline-none text-[#1A1A1A] resize-none" />
          ) : (
            <input type="text"
              value={field === 'keywords' ? kwStr(item.keywords) : item[field] as string}
              onChange={e => onChange({ [field]: field === 'keywords' ? kwArr(e.target.value) : e.target.value })}
              className="flex-1 text-[11px] font-mono bg-transparent border-none outline-none text-[#1A1A1A]" />
          )}
        </div>
      ))}
      <div className="flex items-center gap-2 flex-wrap pt-1">
        <span className="text-[8px] font-mono uppercase tracking-widest w-16 shrink-0 text-right text-[#1A1A1A]/40">{zh ? '分类' : 'Type'}</span>
        {CATS.map(c => (
          <button key={c.key} type="button" onClick={() => onChange({ category: c.key })}
            className={`py-0.5 px-2 text-[8px] font-mono uppercase tracking-wider border rounded-none transition-all ${
              item.category === c.key ? 'bg-[#1A1A1A] border-[#1A1A1A] text-white' : 'border-[#1A1A1A]/15 text-[#1A1A1A]/60 hover:text-[#1A1A1A]'
            }`}>
            {zh ? c.zh : c.en}
          </button>
        ))}
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel}
          className="px-3 py-1 text-[9px] font-mono uppercase border border-[#1A1A1A]/15 text-[#1A1A1A]/60 hover:text-[#1A1A1A] rounded-none transition">
          {zh ? '取消' : 'Cancel'}
        </button>
        <button type="button" onClick={onSave}
          className="px-4 py-1 text-[9px] font-mono uppercase bg-[#1A1A1A] text-white hover:bg-[#1A1A1A]/85 rounded-none transition">
          {zh ? '保存' : 'Save'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="bg-white border border-[#1A1A1A]/10 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-[#1A1A1A]/60" strokeWidth={1.5} />
          <span className="text-[9px] font-mono uppercase tracking-widest font-bold text-[#1A1A1A]">
            {zh ? 'GEO 语料库' : 'GEO Corpus'}
          </span>
          <span className="text-[8px] font-mono text-[#1A1A1A]/40 bg-[#1A1A1A]/5 px-1.5 py-0.5">{items.length}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={copyAll}
            className="px-3 py-1 text-[9px] font-mono uppercase border border-[#1A1A1A]/20 text-[#1A1A1A]/70 hover:text-[#1A1A1A] rounded-none transition flex items-center gap-1.5">
            {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
            {zh ? '导出全部' : 'Export All'}
          </button>
          <button onClick={() => { setAdding(true); setAddDraft(newItem()); }}
            className="px-3 py-1 text-[9px] font-mono uppercase bg-[#1A1A1A] text-white hover:bg-[#1A1A1A]/85 rounded-none transition flex items-center gap-1.5">
            <Plus className="w-3 h-3" />{zh ? '添加语料' : 'Add Block'}
          </button>
        </div>
      </div>

      <p className="text-[10px] text-[#1A1A1A]/50 font-mono">
        {zh
          ? '结构化语料块 — 当 AI 搜索引擎被问及此品牌时，这些内容成为引用锚点。'
          : 'Structured blocks cited by generative search engines when queried about this brand.'}
      </p>

      {adding && (
        <CorpusForm item={addDraft}
          onSave={saveAdd}
          onCancel={() => setAdding(false)}
          onChange={p => setAddDraft(d => ({ ...d, ...p }))} />
      )}

      {items.length === 0 && !adding && (
        <p className="text-[11px] font-serif italic text-[#1A1A1A]/35 py-6 text-center">
          {zh ? '暂无语料，点击「添加语料」开始构建 GEO 语料库' : 'No blocks yet — click Add Block to start.'}
        </p>
      )}

      <div className="space-y-2">
        {items.map(item => (
          <div key={item.id} className="space-y-2">
            {editingId === item.id && draft ? (
              <CorpusForm item={draft}
                onSave={saveEdit}
                onCancel={() => { setEditingId(null); setDraft(null); }}
                onChange={p => setDraft(d => d ? { ...d, ...p } : d)} />
            ) : (
              <div className="border border-[#1A1A1A]/8 p-3 group hover:border-[#1A1A1A]/20 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[8px] font-mono uppercase tracking-widest text-[#1A1A1A]/50 bg-[#1A1A1A]/5 px-1.5 py-0.5">
                        {CATS.find(c => c.key === item.category)?.[lang] ?? item.category}
                      </span>
                      <span className="text-[11px] font-mono font-semibold text-[#1A1A1A]">{item.title}</span>
                    </div>
                    <p className="text-[10px] text-[#1A1A1A]/65 font-mono leading-relaxed line-clamp-2">{item.content}</p>
                    {item.keywords.length > 0 && (
                      <p className="text-[9px] font-mono text-[#1A1A1A]/35">{item.keywords.join(' · ')}</p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { setEditingId(item.id); setDraft({ ...item }); }}
                      className="p-1 hover:bg-[#1A1A1A]/5 border border-[#1A1A1A]/10 rounded-none transition">
                      <Pencil className="w-3 h-3 text-[#1A1A1A]/60" />
                    </button>
                    <button onClick={() => remove(item.id)}
                      className="p-1 text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-none transition">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
