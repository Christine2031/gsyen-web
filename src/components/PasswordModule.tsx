import React, { useState, useEffect, useCallback } from 'react';
import PasswordGeneratorPanel from './PasswordGeneratorPanel';
import CredentialAddForm from './CredentialAddForm';
import CredentialTable from './CredentialTable';
import { CredentialRow, LOCAL_STORAGE_KEY, defaultCredentials } from './passwordVault';

interface PasswordModuleProps {
  lang: 'zh' | 'en';
}

/**
 * Secret Key Citadel — 密钥生成与保管箱（编排层）
 * 拆分：passwordVault(类型/逻辑) + 生成器面板 + 录入表单 + 凭证表。
 * 本文件只持有共享态（凭证列表 + 当前生成密码）并做本地持久化。
 */
export default function PasswordModule({ lang }: PasswordModuleProps) {
  const [credentials, setCredentials] = useState<CredentialRow[]>([]);
  const [generatedPass, setGeneratedPass] = useState('');

  // 初次加载：读本地存储，无则写入默认凭证
  useEffect(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      try { setCredentials(JSON.parse(saved)); return; }
      catch (e) { console.error(e); }
    }
    const seed = defaultCredentials(lang);
    setCredentials(seed);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(seed));
  }, [lang]);

  // 与 vaultStore 双向同步——VAULT 卡片的增删会触发此事件
  useEffect(() => {
    const sync = () => {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) try { setCredentials(JSON.parse(saved)); } catch {}
    };
    window.addEventListener('vault-updated', sync);
    return () => window.removeEventListener('vault-updated', sync);
  }, []);

  const handleAdd = useCallback((row: CredentialRow) => {
    setCredentials((prev) => {
      const updated = [row, ...prev];
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const handleDelete = useCallback((id: string) => {
    setCredentials((prev) => {
      const updated = prev.filter((c) => c.id !== id);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Empty toolbar strip — 对齐其他模块的 toolbar 高度 */}
      <div className="relative shrink-0 h-[52px] px-8 border-b border-[#1A1A1A]/8 bg-[#F4F2EE]">
      </div>
      <div className="flex-1 overflow-y-auto px-8 pt-0 pb-10 space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-4">
          <PasswordGeneratorPanel lang={lang} onGeneratedChange={setGeneratedPass} />
          <CredentialAddForm
            lang={lang}
            generatedPass={generatedPass}
            forceOpen={credentials.length === 0}
            onAdd={handleAdd}
          />
        </div>

        <div className="lg:col-span-7 space-y-4">
          <CredentialTable lang={lang} credentials={credentials} onDelete={handleDelete} />
        </div>
      </div>
      </div>{/* /Body */}
    </div>
  );
}
