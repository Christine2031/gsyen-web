import { supabase } from '../lib/supabase';

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
    void _upsertProfile(p);
  },

  getCorpus(): CorpusItem[] {
    try { return JSON.parse(localStorage.getItem(CORPUS_KEY) ?? '[]'); } catch {}
    return [];
  },
  addCorpusItem(item: CorpusItem) {
    prismStore.saveCorpus([item, ...prismStore.getCorpus()]);
    void _upsertCorpus(item);
  },
  updateCorpusItem(id: string, patch: Partial<CorpusItem>) {
    const updated = prismStore.getCorpus().map(c => c.id === id ? { ...c, ...patch } : c);
    prismStore.saveCorpus(updated);
    const item = updated.find(c => c.id === id);
    if (item) void _upsertCorpus(item);
  },
  removeCorpusItem(id: string) {
    prismStore.saveCorpus(prismStore.getCorpus().filter(c => c.id !== id));
    void _deleteCorpus(id);
  },
  saveCorpus(items: CorpusItem[]) {
    localStorage.setItem(CORPUS_KEY, JSON.stringify(items));
    dispatch();
  },

  exportCorpusText(): string {
    const profile = prismStore.getProfile();
    const corpus  = prismStore.getCorpus();
    const header  = profile.name ? `# ${profile.name}\n${profile.tagline}\n${profile.description}\n\n` : '';
    return header + corpus.map(c =>
      `## ${c.title}\n${c.content}\n关键词：${c.keywords.join(', ')}`
    ).join('\n\n');
  },
};

// ── Supabase 双写同步 ─────────────────────────────────────────────────────────
let _uid: string | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _rt: any = null;

async function _upsertProfile(p: BrandProfile) {
  if (!supabase || !_uid) return;
  await supabase.from('gsyen_prism_profile').upsert({
    user_id: _uid, name: p.name, tagline: p.tagline,
    description: p.description, founded: p.founded, website: p.website,
    updated_at: new Date().toISOString(),
  });
}

async function _upsertCorpus(item: CorpusItem) {
  if (!supabase || !_uid) return;
  await supabase.from('gsyen_prism_corpus').upsert({
    id: item.id, user_id: _uid, category: item.category,
    title: item.title, content: item.content, keywords: item.keywords,
    updated_at: new Date().toISOString(),
  });
}

async function _deleteCorpus(id: string) {
  if (!supabase || !_uid) return;
  await supabase.from('gsyen_prism_corpus').delete().eq('id', id).eq('user_id', _uid);
}

async function _pull(userId: string) {
  if (!supabase) return;
  const [{ data: profile }, { data: corpus }] = await Promise.all([
    supabase.from('gsyen_prism_profile').select('*').eq('user_id', userId).single(),
    supabase.from('gsyen_prism_corpus').select('*').eq('user_id', userId),
  ]);
  if (profile) {
    localStorage.setItem(PROFILE_KEY, JSON.stringify({
      name: profile.name, tagline: profile.tagline,
      description: profile.description, founded: profile.founded, website: profile.website,
    }));
  }
  if (corpus) {
    const remote: CorpusItem[] = corpus.map((r: any) => ({
      id: r.id, category: r.category as CorpusCategory,
      title: r.title, content: r.content, keywords: r.keywords ?? [],
    }));
    const local     = prismStore.getCorpus();
    const remIds    = new Set(remote.map(c => c.id));
    const localOnly = local.filter(c => !remIds.has(c.id));
    for (const item of localOnly) await _upsertCorpus(item);
    localStorage.setItem(CORPUS_KEY, JSON.stringify([...remote, ...localOnly]));
  }
  dispatch();
}

function _subscribeRealtime(uid: string) {
  _rt?.unsubscribe();
  _rt = supabase!
    .channel(`gsyen_prism:${uid}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'gsyen_prism_profile', filter: `user_id=eq.${uid}` }, () => _pull(uid))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'gsyen_prism_corpus',  filter: `user_id=eq.${uid}` }, () => _pull(uid))
    .subscribe();
}

supabase?.auth.onAuthStateChange((_ev, session) => {
  _uid = session?.user?.id ?? null;
  if (_uid) { _pull(_uid); _subscribeRealtime(_uid); }
  else { _rt?.unsubscribe(); _rt = null; }
});
