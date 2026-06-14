import { useState, useEffect } from 'react';
import { Eye, EyeOff, Copy, Check, Trash2, Pencil } from 'lucide-react';
import { CardColor } from './cardConstants';
import { CredentialRow, CredentialCategory } from './passwordVault';
import { vaultStore } from '../stores/vaultStore';

interface Props {
  lang:          'zh' | 'en';
  color:         CardColor;
  credentialId:  string | undefined;
  serviceName:   string;
  expanded:      boolean;
  scope:         'self' | 'shared';
  onScopeChange: (s: 'self' | 'shared') => void;
  onCollapse:    () => void;
}

const CATEGORIES: { key: CredentialCategory; zh: string; en: string }[] = [
  { key: 'api',      zh: '接口密钥',    en: 'API Key' },
  { key: 'server',   zh: '服务器证书',  en: 'Server' },
  { key: 'database', zh: '数据库密保',  en: 'Database' },
  { key: 'personal', zh: '私密账号',    en: 'Personal' },
];

const catLabel = (key: string, lang: 'zh' | 'en') =>
  CATEGORIES.find(c => c.key === key)?.[lang] ?? key;

export function VaultExpandContent({
  lang, color: C, credentialId, serviceName, expanded, scope, onScopeChange, onCollapse,
}: Props) {
  const zh = lang === 'zh';

  const [row, setRow] = useState<CredentialRow | null>(() =>
    credentialId ? (vaultStore.getAll().find(r => r.id === credentialId) ?? null) : null
  );
  const [revealed, setRevealed] = useState(false);
  const [copied,   setCopied]   = useState<'user' | 'secret' | null>(null);
  const [editing,  setEditing]  = useState(false);

  // edit-mode state
  const [eService,  setEService]  = useState('');
  const [eUsername, setEUsername] = useState('');
  const [eSecret,   setESecret]   = useState('');
  const [eCategory, setECategory] = useState<CredentialCategory>('personal');

  useEffect(() => {
    const sync = () => {
      if (credentialId) setRow(vaultStore.getAll().find(r => r.id === credentialId) ?? null);
    };
    window.addEventListener('vault-updated', sync);
    return () => window.removeEventListener('vault-updated', sync);
  }, [credentialId]);

  useEffect(() => {
    if (!expanded) { setRevealed(false); setCopied(null); setEditing(false); }
  }, [expanded]);

  const startEdit = () => {
    setEService(row?.serviceName  ?? serviceName);
    setEUsername(row?.username    ?? '');
    setESecret(row?.secretVal     ?? '');
    setECategory(row?.category    ?? 'personal');
    setEditing(true);
  };

  const saveEdit = () => {
    if (!credentialId) return;
    vaultStore.update(credentialId, {
      serviceName: eService,
      username:    eUsername,
      secretVal:   eSecret,
      category:    eCategory,
      lastUpdated: new Date().toISOString().split('T')[0],
    });
    setEditing(false);
  };

  const copyText = (text: string, which: 'user' | 'secret') => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(null), 1800);
    });
  };

  const service   = row?.serviceName ?? serviceName;
  const username  = row?.username   ?? '';
  const secretVal = row?.secretVal  ?? '';
  const updated   = row?.lastUpdated ?? '';
  const catKey    = row?.category   ?? 'personal';

  return (
    <div className={`grid transition-[grid-template-rows] duration-[360ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
      <div className="overflow-hidden">
        <div className={`px-4 pb-4 pt-3 border-t ${C.panelBorder} space-y-3`} onClick={e => e.stopPropagation()}>

          {editing ? (
            /* ── 编辑模式 ── */
            <div className={`space-y-0 rounded-xl shadow-[inset_0_1px_3px_rgba(0,0,0,0.04)] bg-black/[0.015] px-3 pt-1 pb-2`}>
              {[
                { label: zh ? '服务'   : 'Service',  val: eService,  set: setEService },
                { label: zh ? '用户名' : 'Username', val: eUsername, set: setEUsername },
                { label: zh ? '密钥'   : 'Secret',   val: eSecret,   set: setESecret },
              ].map(({ label, val, set }) => (
                <div key={label} className={`flex items-center gap-4 border-b ${C.panelBorder} py-2`}>
                  <span className={`text-(--fs-2xs) font-mono uppercase tracking-widest w-14 shrink-0 text-right ${C.panelLabel}`}>{label}</span>
                  <input type={label === (zh ? '密钥' : 'Secret') ? 'text' : 'text'}
                    value={val} onChange={e => set(e.target.value)}
                    className={`flex-1 text-(--fs-base) bg-transparent border-none outline-none ${C.panelText} placeholder:opacity-30`} />
                </div>
              ))}

              {/* 分类选择 */}
              <div className={`flex items-center gap-2 border-b ${C.panelBorder} py-2`}>
                <span className={`text-(--fs-2xs) font-mono uppercase tracking-widest w-14 shrink-0 text-right ${C.panelLabel}`}>{zh ? '分类' : 'Type'}</span>
                <div className="flex flex-wrap gap-1">
                  {CATEGORIES.map(c => (
                    <button key={c.key} type="button" onClick={() => setECategory(c.key)}
                      className={`px-2 py-1 text-(--fs-2xs) font-mono uppercase tracking-widest rounded transition ${eCategory === c.key ? C.btnPrimary : C.btnGhost}`}>
                      {c[lang]}
                    </button>
                  ))}
                </div>
              </div>

              <div className={`flex items-center justify-end gap-2 pt-2 border-t ${C.panelBorder}`}>
                <button type="button" onClick={() => setEditing(false)}
                  className={`px-3.5 py-1.5 text-(--fs-xs) font-mono uppercase tracking-widest rounded-md transition ${C.btnGhost}`}>
                  {zh ? '取消' : 'Cancel'}
                </button>
                <button type="button" onClick={saveEdit}
                  className={`px-4 py-1.5 text-(--fs-xs) font-mono uppercase tracking-widest rounded-md transition ${C.btnPrimary}`}>
                  {zh ? '保存' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            /* ── 查看模式 ── */
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5 min-w-0">
                  <p className={`text-(--fs-2xs) uppercase tracking-widest ${C.panelLabel}`}>{zh ? '服务' : 'SERVICE'}</p>
                  <p className={`text-(--fs-body) font-semibold truncate ${C.panelText}`}>{service}</p>
                </div>
                <span className={`shrink-0 mt-3 text-(--fs-2xs) font-mono uppercase tracking-widest px-2 py-1 rounded ${C.tag}`}>{catLabel(catKey, lang)}</span>
              </div>

              {username && (
                <div className={`flex items-center justify-between py-2 border-t ${C.panelBorder}`}>
                  <div className="space-y-0.5 min-w-0 mr-2">
                    <p className={`text-(--fs-2xs) uppercase tracking-widest ${C.panelLabel}`}>{zh ? '用户名' : 'USERNAME'}</p>
                    <p className={`text-(--fs-md) font-mono truncate ${C.panelText}`}>{username}</p>
                  </div>
                  <button type="button" onClick={() => copyText(username, 'user')}
                    className={`shrink-0 p-1.5 rounded transition ${C.btnGhost}`}>
                    {copied === 'user' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}

              <div className={`flex items-center justify-between py-2 border-t ${C.panelBorder}`}>
                <div className="space-y-0.5 flex-1 min-w-0 mr-2">
                  <p className={`text-(--fs-2xs) uppercase tracking-widest ${C.panelLabel}`}>{zh ? '密钥' : 'SECRET'}</p>
                  <p className={`text-(--fs-md) font-mono truncate ${C.panelText} ${!revealed ? 'opacity-50 tracking-[0.25em]' : ''}`}>
                    {revealed ? (secretVal || '—') : '* * * * * * * *'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button type="button" onClick={() => setRevealed(r => !r)}
                    className={`p-1.5 rounded transition ${C.btnGhost}`}>
                    {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  {secretVal && (
                    <button type="button" onClick={() => copyText(secretVal, 'secret')}
                      className={`p-1.5 rounded transition ${C.btnPrimary}`}>
                      {copied === 'secret' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>

              {updated && (
                <p className={`text-(--fs-2xs) uppercase tracking-widest ${C.panelLabel} border-t ${C.panelBorder} pt-2`}>
                  {zh ? '更新于' : 'UPDATED'} {updated}
                </p>
              )}

              <div className="flex items-center justify-between gap-2 pt-1">
                <div className="flex gap-1.5">
                  {(['self', 'shared'] as const).map(s => (
                    <button key={s} type="button" onClick={() => onScopeChange(s)}
                      className={`px-3 py-1.5 text-(--fs-xs) font-mono uppercase tracking-widest rounded-md transition ${scope === s ? C.btnPrimary : C.btnGhost}`}>
                      {s === 'self' ? (zh ? '个人' : 'Personal') : (zh ? '团队' : 'Team')}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <button type="button" onClick={startEdit}
                    className={`p-1.5 rounded transition ${C.btnGhost}`} title={zh ? '编辑' : 'Edit'}>
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => { if (credentialId) vaultStore.remove(credentialId); onCollapse(); }}
                    className={`p-1.5 rounded transition ${C.btnDanger}`} title={zh ? '删除' : 'Delete'}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
