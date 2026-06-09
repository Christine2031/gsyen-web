import { useState, useEffect } from 'react';
import { Eye, EyeOff, Copy, Check, Trash2 } from 'lucide-react';
import { CardColor } from './cardConstants';
import { CredentialRow } from './passwordVault';
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

const CATEGORY_LABEL: Record<string, { zh: string; en: string }> = {
  api:      { zh: '接口密钥', en: 'API Key' },
  server:   { zh: '服务器证书', en: 'Server Cert' },
  database: { zh: '数据库密保', en: 'Database' },
  personal: { zh: '个人账号', en: 'Personal' },
};

export function VaultExpandContent({
  lang, color: C, credentialId, serviceName, expanded, scope, onScopeChange, onCollapse,
}: Props) {
  const zh = lang === 'zh';

  const [row, setRow] = useState<CredentialRow | null>(() =>
    credentialId ? (vaultStore.getAll().find(r => r.id === credentialId) ?? null) : null
  );
  const [revealed, setRevealed] = useState(false);
  const [copied,   setCopied]   = useState<'user' | 'secret' | null>(null);

  useEffect(() => {
    const sync = () => {
      if (credentialId) setRow(vaultStore.getAll().find(r => r.id === credentialId) ?? null);
    };
    window.addEventListener('vault-updated', sync);
    return () => window.removeEventListener('vault-updated', sync);
  }, [credentialId]);

  useEffect(() => { if (!expanded) { setRevealed(false); setCopied(null); } }, [expanded]);

  const copyText = (text: string, which: 'user' | 'secret') => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(null), 1800);
    });
  };

  const handleDelete = () => {
    if (credentialId) vaultStore.remove(credentialId);
    onCollapse();
  };

  const service    = row?.serviceName ?? serviceName;
  const username   = row?.username   ?? '';
  const secretVal  = row?.secretVal  ?? '';
  const updated    = row?.lastUpdated ?? '';
  const catKey     = row?.category ?? 'personal';
  const catLabel   = CATEGORY_LABEL[catKey]?.[lang] ?? catKey;
  const maskedSecret = '✦'.repeat(Math.min(Math.max(secretVal.length, 8), 20));

  return (
    <div className={`grid transition-[grid-template-rows] duration-[360ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
      <div className="overflow-hidden">
        <div className={`px-4 pb-4 pt-3 border-t ${C.panelBorder} space-y-3`} onClick={e => e.stopPropagation()}>

          {/* service + category */}
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-0.5 min-w-0">
              <p className={`text-[8px] uppercase tracking-widest ${C.panelLabel}`}>{zh ? '服务' : 'SERVICE'}</p>
              <p className={`text-[13px] font-semibold truncate ${C.panelText}`}>{service}</p>
            </div>
            <span className={`shrink-0 mt-3 text-[8px] font-mono uppercase tracking-widest px-2 py-1 rounded ${C.tag}`}>{catLabel}</span>
          </div>

          {/* username */}
          {username && (
            <div className={`flex items-center justify-between py-2 border-t ${C.panelBorder}`}>
              <div className="space-y-0.5 min-w-0 mr-2">
                <p className={`text-[8px] uppercase tracking-widest ${C.panelLabel}`}>{zh ? '用户名' : 'USERNAME'}</p>
                <p className={`text-[11px] font-mono truncate ${C.panelText}`}>{username}</p>
              </div>
              <button type="button" onClick={() => copyText(username, 'user')}
                className={`shrink-0 p-1.5 rounded transition ${C.btnGhost}`}
                title={zh ? '复制' : 'Copy'}>
                {copied === 'user' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}

          {/* secret */}
          <div className={`flex items-center justify-between py-2 border-t ${C.panelBorder}`}>
            <div className="space-y-0.5 flex-1 min-w-0 mr-2">
              <p className={`text-[8px] uppercase tracking-widest ${C.panelLabel}`}>{zh ? '密钥' : 'SECRET'}</p>
              <p className={`text-[11px] font-mono truncate ${C.panelText} ${!revealed ? 'opacity-50 tracking-[0.3em]' : ''}`}>
                {revealed ? (secretVal || '—') : maskedSecret}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button type="button" onClick={() => setRevealed(r => !r)}
                className={`p-1.5 rounded transition ${C.btnGhost}`}
                title={revealed ? (zh ? '隐藏' : 'Hide') : (zh ? '显示' : 'Reveal')}>
                {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              {secretVal && (
                <button type="button" onClick={() => copyText(secretVal, 'secret')}
                  className={`p-1.5 rounded transition ${C.btnPrimary}`}
                  title={zh ? '复制密钥' : 'Copy Secret'}>
                  {copied === 'secret' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
          </div>

          {/* last updated */}
          {updated && (
            <p className={`text-[8px] uppercase tracking-widest ${C.panelLabel} border-t ${C.panelBorder} pt-2`}>
              {zh ? '更新于' : 'UPDATED'} {updated}
            </p>
          )}

          {/* scope + delete */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex gap-1.5">
              {(['self', 'shared'] as const).map(s => (
                <button key={s} type="button" onClick={() => onScopeChange(s)}
                  className={`px-3 py-1.5 text-[9px] font-mono uppercase tracking-widest rounded-md transition ${scope === s ? C.btnPrimary : C.btnGhost}`}>
                  {s === 'self' ? (zh ? '个人' : 'Personal') : (zh ? '团队' : 'Team')}
                </button>
              ))}
            </div>
            <button type="button" onClick={handleDelete}
              className={`p-1.5 rounded transition ${C.btnDanger}`}
              title={zh ? '删除' : 'Delete'}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
