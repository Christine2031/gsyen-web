const PROFILE_KEY = 'prism-brand-profile';
const CORPUS_KEY  = 'prism-geo-corpus';

export type CorpusCategory = 'brand' | 'product' | 'story' | 'qa';

export interface CorpusItem {
  id:       string;
  category: CorpusCategory;
  title:    string;
  content:  string;
  keywords: string[];
}

export interface BrandProfile {
  name:        string;
  tagline:     string;
  description: string;
  founded:     string;
  website:     string;
}

const DEFAULT_PROFILE: BrandProfile = {
  name: '', tagline: '', description: '', founded: '', website: '',
};

function dispatch() { window.dispatchEvent(new Event('prism-updated')); }

export const prismStore = {
  getProfile(): BrandProfile {
    try { return JSON.parse(localStorage.getItem(PROFILE_KEY) ?? '{}'); } catch {}
    return DEFAULT_PROFILE;
  },
  saveProfile(p: BrandProfile) {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
    dispatch();
  },

  getCorpus(): CorpusItem[] {
    try { return JSON.parse(localStorage.getItem(CORPUS_KEY) ?? '[]'); } catch {}
    return [];
  },
  addCorpusItem(item: CorpusItem) {
    prismStore.saveCorpus([item, ...prismStore.getCorpus()]);
  },
  updateCorpusItem(id: string, patch: Partial<CorpusItem>) {
    prismStore.saveCorpus(prismStore.getCorpus().map(c => c.id === id ? { ...c, ...patch } : c));
  },
  removeCorpusItem(id: string) {
    prismStore.saveCorpus(prismStore.getCorpus().filter(c => c.id !== id));
  },
  saveCorpus(items: CorpusItem[]) {
    localStorage.setItem(CORPUS_KEY, JSON.stringify(items));
    dispatch();
  },

  /** 导出全部语料为纯文本，供注入 System Prompt 或提交 RAG API */
  exportCorpusText(): string {
    const profile = prismStore.getProfile();
    const corpus  = prismStore.getCorpus();
    const header  = profile.name ? `# ${profile.name}\n${profile.tagline}\n${profile.description}\n\n` : '';
    return header + corpus.map(c =>
      `## ${c.title}\n${c.content}\n关键词：${c.keywords.join(', ')}`
    ).join('\n\n');
  },
};
