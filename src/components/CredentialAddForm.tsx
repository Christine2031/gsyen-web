import React, { useState } from 'react';
import { localDateStr } from '../utils/date';
import { CredentialRow, CredentialCategory } from './passwordVault';

interface CredentialAddFormProps {
  lang: 'zh' | 'en';
  /** 当前生成器里的密码，用于"绑定生成密码"快捷填入 */
  generatedPass: string;
  /** 是否强制展开（如金库为空时） */
  forceOpen: boolean;
  onAdd: (row: CredentialRow) => void;
}

/** 左栏下半：快捷录入凭证表单（自管表单字段） */
export default function CredentialAddForm({ lang, generatedPass, forceOpen, onAdd }: CredentialAddFormProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newService, setNewService] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newSecretVal, setNewSecretVal] = useState('');
  const [newCategory, setNewCategory] = useState<CredentialCategory>('api');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newService.trim() || !newSecretVal.trim()) return;

    onAdd({
      id: Date.now().toString(),
      serviceName: newService,
      username: newUsername || 'n/a',
      secretVal: newSecretVal,
      category: newCategory,
      lastUpdated: localDateStr(new Date()),
    });

    setNewService('');
    setNewUsername('');
    setNewSecretVal('');
    setShowAddForm(false);
  };

  return (
    <div className="bg-white border border-[#1A1A1A]/10 p-5 rounded-none space-y-4">
      <div className="flex items-center justify-between pb-1">
        <h4 className="text-(--fs-sm) font-mono tracking-widest text-[#1A1A1A] uppercase font-bold">
          {lang === 'zh' ? '存档加密令牌密钥' : 'ENCRYPT BRAND KEY'}
        </h4>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="text-xs bg-[#1A1A1A] text-white hover:bg-[#1A1A1A]/90 transition-all font-bold px-2 py-0.5 text-(--fs-xs) uppercase tracking-wider"
        >
          {showAddForm ? (lang === 'zh' ? '收起' : 'Hide') : (lang === 'zh' ? '快捷录入' : 'Open')}
        </button>
      </div>

      {(showAddForm || forceOpen) && (
        <form onSubmit={handleSubmit} className="space-y-3 pt-1">
          <div>
            <label className="block text-(--fs-xs) tracking-widest font-mono text-[#1A1A1A]/60 uppercase mb-1">
              {lang === 'zh' ? '服务设施/网络名称' : 'TARGET HOST / DEPLOY PORT'}
            </label>
            <input
              type="text"
              required
              value={newService}
              onChange={(e) => setNewService(e.target.value)}
              placeholder="e.g. AWS Production SMTP Credentials"
              className="w-full px-3 py-2 text-xs border border-[#1A1A1A]/15 bg-white text-[#1A1A1A] rounded-none focus:outline-none focus:border-[#1A1A1A]"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-(--fs-xs) tracking-widest font-mono text-[#1A1A1A]/60 uppercase mb-1">
                {lang === 'zh' ? '托管用户名/主机' : 'CUSTODIAN IDENTIFIER'}
              </label>
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="e.g. root_admin"
                className="w-full px-3 py-1.5 text-xs border border-[#1A1A1A]/15 bg-white text-[#1A1A1A] rounded-none"
              />
            </div>
            <div>
              <label className="block text-(--fs-xs) tracking-widest font-mono text-[#1A1A1A]/60 uppercase mb-1">
                {lang === 'zh' ? '分类群组' : 'VAULT DOMAIN'}
              </label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as CredentialCategory)}
                className="w-full px-2 py-1.5 text-xs border border-[#1A1A1A]/15 bg-white text-[#1A1A1A] rounded-none"
              >
                <option value="api">{lang === 'zh' ? '接口令牌钥匙' : 'API Token Node'}</option>
                <option value="server">{lang === 'zh' ? '终端主机证书' : 'Server Cert'}</option>
                <option value="database">{lang === 'zh' ? '数据库凭据' : 'Database Owner'}</option>
                <option value="personal">{lang === 'zh' ? '自主高保密备忘' : 'Isolated Note'}</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-(--fs-xs) tracking-widest font-mono text-[#1A1A1A]/60 uppercase">
                {lang === 'zh' ? '核心机密内容 (密匙/哈希等)' : 'VAULT HIDDEN SECRET KEY'}
              </label>
              {generatedPass && (
                <button
                  type="button"
                  onClick={() => setNewSecretVal(generatedPass)}
                  className="text-(--fs-2xs) font-mono text-indigo-700 underline font-bold"
                >
                  {lang === 'zh' ? '[ 绑定上面刚生成的密码 ]' : '[ Bind Generated Password ]'}
                </button>
              )}
            </div>
            <input
              type="text"
              required
              value={newSecretVal}
              onChange={(e) => setNewSecretVal(e.target.value)}
              placeholder="Provide secure key passphrase..."
              className="w-full px-3 py-2 text-xs border border-[#1A1A1A]/15 bg-white text-[#1A1A1A] rounded-none font-mono"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-[#1A1A1A] hover:bg-[#1A1A1A]/95 text-white font-mono font-bold text-xs uppercase tracking-widest transition-all"
          >
            {lang === 'zh' ? '安全铸造并并入金库' : 'LOCK SECRET INTO CITADEL'}
          </button>
        </form>
      )}
    </div>
  );
}
