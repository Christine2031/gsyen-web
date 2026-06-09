import React, { useState } from 'react';
import { ShieldCheck, Copy, Eye, EyeOff, Trash2, ShieldAlert, Sparkles, Check, Pencil, X } from 'lucide-react';
import { CredentialRow, CredentialCategory, filterTypeTags } from './passwordVault';
import { vaultStore } from '../stores/vaultStore';

interface CredentialTableProps {
  lang: 'zh' | 'en';
  credentials: CredentialRow[];
  onDelete: (id: string) => void;
}

const CATEGORIES: { key: CredentialCategory; zh: string; en: string }[] = [
  { key: 'api',      zh: '接口密钥 (API Keys)',      en: 'API Tokens' },
  { key: 'server',   zh: '服务器主机证书 (SSH)',      en: 'Server Certs' },
  { key: 'database', zh: '数据库密保 (SQL)',           en: 'Databases' },
  { key: 'personal', zh: '私密账号与备用',             en: 'Private Credentials' },
];

interface EditState {
  serviceName: string;
  username:    string;
  secretVal:   string;
  category:    CredentialCategory;
}

/** 右栏：金库凭证表（自管搜索/分类筛选/明文显隐/复制/编辑） */
export default function CredentialTable({ lang, credentials, onDelete }: CredentialTableProps) {
  const [filterCategory, setFilterCategory] = useState('all');
  const [searchFilter,   setSearchFilter]   = useState('');
  const [revealedIds,    setRevealedIds]     = useState<Record<string, boolean>>({});
  const [copiedId,       setCopiedId]        = useState<string | null>(null);
  const [copiedUserId,   setCopiedUserId]    = useState<string | null>(null);
  const [editingId,      setEditingId]       = useState<string | null>(null);
  const [editState,      setEditState]       = useState<EditState | null>(null);

  const copySecret = (txt: string, id: string) => {
    navigator.clipboard.writeText(txt);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const copyUsername = (txt: string, id: string) => {
    navigator.clipboard.writeText(txt);
    setCopiedUserId(id);
    setTimeout(() => setCopiedUserId(null), 2000);
  };

  const toggleVisibility = (id: string) =>
    setRevealedIds(prev => ({ ...prev, [id]: !prev[id] }));

  const startEdit = (item: CredentialRow) => {
    setEditingId(item.id);
    setEditState({ serviceName: item.serviceName, username: item.username, secretVal: item.secretVal, category: item.category });
  };

  const saveEdit = (id: string) => {
    if (!editState) return;
    vaultStore.update(id, { ...editState, lastUpdated: new Date().toISOString().split('T')[0] });
    setEditingId(null);
    setEditState(null);
  };

  const cancelEdit = () => { setEditingId(null); setEditState(null); };

  const visible = credentials
    .filter(c => filterCategory === 'all' || c.category === filterCategory)
    .filter(c => c.serviceName.toLowerCase().includes(searchFilter.toLowerCase()));

  return (
    <div className="bg-white border border-[#1A1A1A]/10 p-6 rounded-none min-h-[480px] flex flex-col justify-between">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#1A1A1A]/10 gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#1A1A1A]" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#1A1A1A] font-bold">
              {lang === 'zh' ? '金库离线防劫持沙箱数据库' : 'TRUST SECURED STANDALONE KEYS TABLE'}
            </span>
          </div>
          <input
            type="text"
            placeholder={lang === 'zh' ? '搜索保密项目...' : 'Search secret targets...'}
            value={searchFilter}
            onChange={e => setSearchFilter(e.target.value)}
            className="px-3 py-1 text-[11px] font-mono border border-[#1A1A1A]/15 bg-transparent rounded-none focus:outline-none focus:border-[#1A1A1A]"
          />
        </div>

        <div className="flex flex-wrap gap-1.5 pt-1">
          {Object.entries(filterTypeTags).map(([key, tag]) => (
            <button key={key} onClick={() => setFilterCategory(key)}
              className={`py-1 px-2 text-[9px] font-mono uppercase tracking-wider border rounded-none transition-all ${
                filterCategory === key
                  ? 'bg-[#1A1A1A] border-[#1A1A1A] text-[#F9F8F6] font-bold'
                  : 'bg-transparent border-[#1A1A1A]/10 text-[#1A1A1A]/60 hover:text-[#1A1A1A]'
              }`}>
              {lang === 'zh' ? tag.zh : tag.en}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <div className="py-24 text-center">
            <p className="text-xs font-serif italic text-[#1A1A1A]/50">
              {lang === 'zh' ? '金库该分类下尚无储存任何密匙数据' : 'Zero items matched current military filters.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#1A1A1A]/5 max-h-[460px] overflow-y-auto pr-1">
            {visible.map(item => {
              const isRevealed = !!revealedIds[item.id];
              const isEditing  = editingId === item.id;

              return (
                <div key={item.id} className="py-4 space-y-3">
                  {/* row header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 group">
                    <div className="space-y-1.5 max-w-[70%]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[9px] font-mono text-[#1A1A1A]/40">
                          {lang === 'zh' ? '更新:' : 'UPDATED:'} {item.lastUpdated}
                        </span>
                        <span className="text-[9px] font-mono uppercase font-bold text-[#1A1A1A]/60 bg-[#1A1A1A]/5 px-2 py-0.5">
                          {item.category.toUpperCase()}
                        </span>
                      </div>
                      <h4 className="text-xs font-bold font-sans text-[#1A1A1A] flex items-center gap-1.5">
                        {item.serviceName}
                        <span className="text-[9px] text-[#1A1A1A]/50 font-mono italic">({item.username})</span>
                      </h4>
                      <code className="text-[11px] font-mono px-2 py-1 bg-[#F4F2EE] border border-[#1A1A1A]/5 text-[#1A1A1A] rounded-none select-all break-all inline-block min-w-[200px]">
                        {isRevealed ? item.secretVal : '* * * * * * * *'}
                      </code>
                    </div>

                    <div className="flex items-center gap-1.5 self-end sm:self-center flex-wrap">
                      <button onClick={() => copyUsername(item.username, item.id)}
                        className="p-1 px-1.5 hover:bg-[#1A1A1A]/5 text-[#1A1A1A]/70 border border-[#1A1A1A]/10 transition-all rounded-none"
                        title={lang === 'zh' ? '复制用户名' : 'Copy username'}>
                        {copiedUserId === item.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 opacity-50" />}
                      </button>
                      <button onClick={() => toggleVisibility(item.id)}
                        className="p-1 px-1.5 hover:bg-[#1A1A1A]/5 text-[#1A1A1A]/70 border border-[#1A1A1A]/10 transition-all rounded-none"
                        title={isRevealed ? (lang === 'zh' ? '隐藏' : 'Mask') : (lang === 'zh' ? '显示' : 'Reveal')}>
                        {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => copySecret(item.secretVal, item.id)}
                        className="p-1 px-1.5 hover:bg-[#1A1A1A]/5 text-[#1A1A1A]/70 border border-[#1A1A1A]/10 transition-all rounded-none"
                        title={lang === 'zh' ? '复制密钥' : 'Copy secret'}>
                        {copiedId === item.id ? <Check className="w-3.5 h-3.5 text-emerald-600 animate-pulse" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => isEditing ? cancelEdit() : startEdit(item)}
                        className="p-1 px-1.5 hover:bg-[#1A1A1A]/5 text-[#1A1A1A]/70 border border-[#1A1A1A]/10 transition-all rounded-none"
                        title={lang === 'zh' ? '编辑' : 'Edit'}>
                        {isEditing ? <X className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => onDelete(item.id)}
                        className="p-1 px-1.5 text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition-all rounded-none"
                        title={lang === 'zh' ? '彻底删除' : 'Purge'}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* inline edit panel */}
                  {isEditing && editState && (
                    <div className="border border-[#1A1A1A]/10 bg-[#F9F8F6] p-3 space-y-2">
                      {([
                        { label: lang === 'zh' ? '服务'   : 'Service',  key: 'serviceName' as const },
                        { label: lang === 'zh' ? '用户名' : 'Username', key: 'username'    as const },
                        { label: lang === 'zh' ? '密钥'   : 'Secret',   key: 'secretVal'   as const },
                      ] as const).map(({ label, key }) => (
                        <div key={key} className="flex items-center gap-3 border-b border-[#1A1A1A]/8 pb-1.5">
                          <span className="text-[8px] font-mono uppercase tracking-widest w-12 shrink-0 text-right text-[#1A1A1A]/40">{label}</span>
                          <input type="text" value={editState[key]}
                            onChange={e => setEditState(s => s ? { ...s, [key]: e.target.value } : s)}
                            className="flex-1 text-[11px] font-mono bg-transparent border-none outline-none text-[#1A1A1A]" />
                        </div>
                      ))}
                      <div className="flex items-center gap-2 flex-wrap pt-1">
                        <span className="text-[8px] font-mono uppercase tracking-widest w-12 shrink-0 text-right text-[#1A1A1A]/40">{lang === 'zh' ? '分类' : 'Type'}</span>
                        {CATEGORIES.map(c => (
                          <button key={c.key} type="button" onClick={() => setEditState(s => s ? { ...s, category: c.key } : s)}
                            className={`py-0.5 px-2 text-[8px] font-mono uppercase tracking-wider border rounded-none transition-all ${
                              editState.category === c.key
                                ? 'bg-[#1A1A1A] border-[#1A1A1A] text-[#F9F8F6]'
                                : 'border-[#1A1A1A]/15 text-[#1A1A1A]/60 hover:text-[#1A1A1A]'
                            }`}>
                            {lang === 'zh' ? c.zh.split(' ')[0] : c.en}
                          </button>
                        ))}
                      </div>
                      <div className="flex justify-end gap-2 pt-1">
                        <button type="button" onClick={cancelEdit}
                          className="px-3 py-1 text-[9px] font-mono uppercase border border-[#1A1A1A]/15 text-[#1A1A1A]/60 hover:text-[#1A1A1A] rounded-none transition">
                          {lang === 'zh' ? '取消' : 'Cancel'}
                        </button>
                        <button type="button" onClick={() => saveEdit(item.id)}
                          className="px-4 py-1 text-[9px] font-mono uppercase bg-[#1A1A1A] text-[#F9F8F6] hover:bg-[#1A1A1A]/85 rounded-none transition">
                          {lang === 'zh' ? '保存' : 'Save'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-8 pt-4 border-t border-[#1A1A1A]/5 flex flex-col md:flex-row items-center justify-between text-[9px] font-mono text-[#1A1A1A]/40 uppercase tracking-widest gap-2">
        <div className="flex items-center gap-1.5 text-emerald-800">
          <Sparkles className="w-3 h-3 text-emerald-700" />
          <span>{lang === 'zh' ? '128位动态哈希密钥环，无任何外置网络上传' : 'Local Sandbox Isolated Security Matrix Active'}</span>
        </div>
        <div className="flex items-center gap-1 text-red-600">
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>{lang === 'zh' ? '切勿共享不安全的终端' : 'GUARANTEE PRIVATE WORK TERMINAL'}</span>
        </div>
      </div>
    </div>
  );
}
