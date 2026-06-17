import { useState, useEffect } from 'react';
import { HardDrive, FolderOpen, X } from 'lucide-react';
import { localVaultService, VaultStatus } from '../services/localVaultService';

interface Props { lang: 'zh' | 'en'; }

export function ChatVaultCard({ lang }: Props) {
  const [status, setStatus] = useState<VaultStatus>('none');

  useEffect(() => {
    if (localVaultService.isSupported()) {
      localVaultService.getStatus().then(setStatus);
    }
  }, []);

  if (!localVaultService.isSupported()) return null;

  const grant = async () => {
    const ok = await localVaultService.requestAccess();
    if (ok) setStatus('granted');
  };

  const revoke = async () => {
    await localVaultService.revokeAccess();
    setStatus('none');
  };

  return (
    <div className="pt-2 border-t border-[#1A1A1A]/10 shrink-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="fs-xs font-mono font-bold tracking-widest uppercase text-[#1A1A1A]/40">
          {lang === 'zh' ? '本地存档' : 'Local Vault'}
        </span>
        {status === 'granted' && (
          <button onClick={revoke} className="text-[#1A1A1A]/25 hover:text-red-400 transition-colors" title="取消授权">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {status === 'granted' ? (
        <div className="flex items-center gap-2 px-2 py-1.5 bg-emerald-50 border border-emerald-200/60">
          <HardDrive className="w-3 h-3 text-emerald-500 shrink-0" />
          <span className="fs-2xs font-mono text-emerald-600 uppercase tracking-widest">
            {lang === 'zh' ? '实时写入中' : 'WRITING LIVE'}
          </span>
        </div>
      ) : (
        <button onClick={grant}
          className="w-full flex items-center gap-2 px-2 py-1.5 border border-[#1A1A1A]/12 hover:bg-[#1A1A1A] hover:text-[#F9F8F6] transition-all text-[#1A1A1A]/50 group rounded-none">
          <FolderOpen className="w-3 h-3 shrink-0" />
          <span className="fs-2xs font-mono font-bold tracking-widest uppercase">
            {lang === 'zh' ? '授权本地文件夹' : 'Grant Folder'}
          </span>
        </button>
      )}
    </div>
  );
}
