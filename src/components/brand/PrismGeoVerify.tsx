import { useState } from 'react';
import { Search, Zap, ShieldCheck, AlertTriangle, Hash } from 'lucide-react';
import { prismStore } from '../../stores/prismStore';

interface Props { lang: 'zh' | 'en'; }

interface SimResult {
  query:        string;
  answer:       string;
  score:        number;   // EEAT 0-100
  noisePercent: number;
  facts:        string[];
  hype:         string[];
  chunks:       { title: string; content: string }[];
}

const PRESETS_ZH = [
  '这个品牌是什么时候创立的？',
  '他们的核心产品或服务是什么？',
  '品牌有什么独特的故事或价值观？',
  '有哪些值得信赖的事实依据？',
];
const PRESETS_EN = [
  'When was this brand founded?',
  'What are their core products or services?',
  'What unique story or values define this brand?',
  'What verifiable facts exist about them?',
];

function simulate(query: string, lang: 'zh' | 'en'): SimResult {
  const corpus  = prismStore.getCorpus();
  const profile = prismStore.getProfile();
  const q = query.toLowerCase();

  // Match relevant chunks by keyword overlap
  const chunks = corpus
    .filter(c =>
      c.title.toLowerCase().includes(q.slice(0, 6)) ||
      c.content.toLowerCase().includes(q.slice(0, 6)) ||
      c.keywords.some(k => q.includes(k.toLowerCase())) ||
      q.includes(c.category)
    )
    .slice(0, 3);

  const hasProfile = !!(profile.name || profile.description);
  const score      = Math.min(95, 40 + chunks.length * 18 + (hasProfile ? 12 : 0));
  const noise      = Math.max(5, 35 - chunks.length * 8 - (hasProfile ? 5 : 0));

  const facts: string[] = [];
  if (profile.founded)     facts.push(lang === 'zh' ? `创立于 ${profile.founded}` : `Founded ${profile.founded}`);
  if (profile.name)        facts.push(lang === 'zh' ? `品牌名称：${profile.name}` : `Brand: ${profile.name}`);
  if (chunks.length > 0)   facts.push(...chunks.map(c => c.title));

  const hype = chunks.length < 2
    ? [lang === 'zh' ? '语料不足，可信度偏低' : 'Insufficient corpus — low credibility']
    : [];

  const answerBase = chunks.length > 0
    ? chunks[0].content.slice(0, 120) + (chunks[0].content.length > 120 ? '…' : '')
    : profile.description?.slice(0, 120) ?? (lang === 'zh' ? '暂无匹配语料，请补充品牌档案和语料库。' : 'No matching corpus found. Add brand profile and corpus blocks.');

  return { query, answer: answerBase, score, noisePercent: noise, facts, hype, chunks };
}

export default function PrismGeoVerify({ lang }: Props) {
  const zh = lang === 'zh';
  const [query,  setQuery]  = useState('');
  const [result, setResult] = useState<SimResult | null>(null);

  const run = (q: string) => {
    if (!q.trim()) return;
    setResult(simulate(q, lang));
    setQuery(q);
  };

  const scoreColor = (s: number) => s >= 80 ? 'text-emerald-700' : s >= 60 ? 'text-amber-600' : 'text-red-600';
  const noiseColor = (n: number) => n <= 20  ? 'text-emerald-700' : n <= 35  ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="bg-white border border-[#1A1A1A]/10 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Zap className="w-4 h-4 text-[#1A1A1A]/60" strokeWidth={1.5} />
        <span className="text-[9px] font-mono uppercase tracking-widest font-bold text-[#1A1A1A]">
          {zh ? 'GEO 引用模拟 · EEAT 评分' : 'GEO Citation Simulation · EEAT Score'}
        </span>
      </div>
      <p className="text-[10px] text-[#1A1A1A]/50 font-mono">
        {zh
          ? '模拟生成式 AI 搜索引擎（ChatGPT / Perplexity / Gemini）如何引用此品牌语料。'
          : 'Simulates how generative search engines cite this brand corpus.'}
      </p>

      {/* 预设查询 */}
      <div className="flex flex-wrap gap-1.5">
        {(zh ? PRESETS_ZH : PRESETS_EN).map(p => (
          <button key={p} onClick={() => run(p)}
            className="px-2 py-1 text-[9px] font-mono border border-[#1A1A1A]/12 text-[#1A1A1A]/60 hover:text-[#1A1A1A] hover:border-[#1A1A1A]/30 rounded-none transition-all">
            {p}
          </button>
        ))}
      </div>

      {/* 自定义输入 */}
      <div className="flex gap-2">
        <input type="text" value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && run(query)}
          placeholder={zh ? '输入查询词，测试 GEO 效果…' : 'Enter query to test GEO coverage…'}
          className="flex-1 px-3 py-2 text-[11px] font-mono border border-[#1A1A1A]/15 bg-[#F9F8F6] outline-none focus:border-[#1A1A1A] rounded-none transition" />
        <button onClick={() => run(query)}
          className="px-4 py-2 bg-[#1A1A1A] text-white rounded-none hover:bg-[#1A1A1A]/85 transition">
          <Search className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 结果 */}
      {result && (
        <div className="border border-[#1A1A1A]/10 space-y-0 divide-y divide-[#1A1A1A]/8">
          {/* 评分头 */}
          <div className="p-4 flex items-center gap-6 bg-[#F9F8F6]">
            <div className="text-center">
              <p className={`text-3xl font-mono font-extrabold ${scoreColor(result.score)}`}>{result.score}</p>
              <p className="text-[8px] font-mono uppercase tracking-widest text-[#1A1A1A]/40 mt-0.5">
                {zh ? 'EEAT 可信度' : 'EEAT Score'} /100
              </p>
            </div>
            <div className="text-center">
              <p className={`text-3xl font-mono font-extrabold ${noiseColor(result.noisePercent)}`}>{result.noisePercent}%</p>
              <p className="text-[8px] font-mono uppercase tracking-widest text-[#1A1A1A]/40 mt-0.5">
                {zh ? 'Slop 噪声' : 'Slop Noise'}
              </p>
            </div>
            <div className="flex-1">
              {result.score >= 80
                ? <div className="flex items-center gap-1.5 text-emerald-700"><ShieldCheck className="w-4 h-4" /><span className="text-[9px] font-mono uppercase tracking-widest font-bold">{zh ? '核心事实锚定' : 'CORE FACT ANCHORED'}</span></div>
                : <div className="flex items-center gap-1.5 text-amber-600"><AlertTriangle className="w-4 h-4" /><span className="text-[9px] font-mono uppercase tracking-widest font-bold">{zh ? '语料补强建议' : 'CORPUS BOOST NEEDED'}</span></div>
              }
            </div>
          </div>

          {/* AI 引用回答 */}
          <div className="p-4 space-y-1.5">
            <p className="text-[8px] font-mono uppercase tracking-widest text-[#1A1A1A]/40">{zh ? 'AI 生成引用' : 'AI Citation'}</p>
            <p className="text-[11px] text-[#1A1A1A]/80 font-mono leading-relaxed">{result.answer}</p>
          </div>

          {/* 注入语料块 */}
          {result.chunks.length > 0 && (
            <div className="p-4 space-y-2">
              <p className="text-[8px] font-mono uppercase tracking-widest text-[#1A1A1A]/40 flex items-center gap-1.5">
                <Hash className="w-3 h-3" />{zh ? '命中语料块' : 'Injected Chunks'} ({result.chunks.length})
              </p>
              {result.chunks.map((c, i) => (
                <div key={i} className="bg-[#F4F2EE] px-3 py-2 border-l-2 border-[#1A1A1A]/20">
                  <p className="text-[9px] font-mono font-bold text-[#1A1A1A]">{c.title}</p>
                  <p className="text-[9px] font-mono text-[#1A1A1A]/60 line-clamp-2 mt-0.5">{c.content}</p>
                </div>
              ))}
            </div>
          )}

          {/* 事实 / Hype */}
          <div className="p-4 grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <p className="text-[8px] font-mono uppercase tracking-widest text-emerald-700">{zh ? '可信事实' : 'Detected Facts'}</p>
              {result.facts.map((f, i) => <p key={i} className="text-[9px] font-mono text-[#1A1A1A]/70">✓ {f}</p>)}
            </div>
            {result.hype.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[8px] font-mono uppercase tracking-widest text-amber-600">{zh ? 'Slop 预警' : 'Slop Warnings'}</p>
                {result.hype.map((h, i) => <p key={i} className="text-[9px] font-mono text-[#1A1A1A]/70">⚠ {h}</p>)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
