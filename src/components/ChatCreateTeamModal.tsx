import { useState } from 'react';
import { TrendingUp, Heart, Zap, Globe, X } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { createTeam } from '../hooks/useTeams';

interface Props {
  open: boolean;
  zh: boolean;
  onClose: () => void;
  onSubmit?: (type: string, name: string) => void;
}

const TYPES = [
  { id: 'chengYue', label: '成约', desc: '成交推进 · 客户跟进', Icon: TrendingUp },
  { id: 'huoban',   label: '伙伴', desc: '长期合作 · 战略协同', Icon: Heart      },
  { id: 'xingdong', label: '行动', desc: '短期任务 · 作战小队', Icon: Zap        },
  { id: 'juji',     label: '聚集', desc: '兴趣社群 · 同频连接', Icon: Globe      },
];

export function ChatCreateTeamModal({ open, zh, onClose, onSubmit }: Props) {
  const { user } = useAuth();
  const [teamType, setTeamType] = useState('');
  const [teamName, setTeamName] = useState('');
  const [loading,  setLoading]  = useState(false);

  if (!open) return null;

  const close = () => { setTeamType(''); setTeamName(''); onClose(); };

  const handleCreate = async () => {
    if (!user || !teamType || !teamName.trim()) return;
    setLoading(true);
    const ok = await createTeam(user.id, teamName.trim(), teamType);
    setLoading(false);
    if (ok) { onSubmit?.(teamType, teamName); close(); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 backdrop-blur-[2px]"
      onClick={close}>
      <div className="bg-[#F9F8F6] border border-[#1A1A1A]/12 w-full max-w-sm mx-4 shadow-sm"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[#1A1A1A]/8">
          <span className="text-(--fs-sm) font-mono font-bold tracking-widest uppercase text-[#1A1A1A]/60">
            {zh ? '开团' : 'New Team'}
          </span>
          <button onClick={close} className="p-0.5 text-[#1A1A1A]/25 hover:text-[#1A1A1A]/60 transition-colors">
            <X className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </div>

        {/* Type grid */}
        <div className="grid grid-cols-2 gap-px p-px bg-[#1A1A1A]/8 m-5 mb-4">
          {TYPES.map(({ id, label, desc, Icon }) => {
            const active = teamType === id;
            return (
              <button key={id} onClick={() => setTeamType(id)}
                className={`flex items-start gap-3 p-4 transition-all text-left ${active ? 'bg-[#1A1A1A]' : 'bg-[#F9F8F6] hover:bg-[#1A1A1A]/5'}`}>
                <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${active ? 'text-[#F9F8F6]/70' : 'text-[#1A1A1A]/40'}`} strokeWidth={1.5} />
                <div className="min-w-0">
                  <p className={`text-(--fs-md) font-mono font-bold tracking-widest uppercase ${active ? 'text-[#F9F8F6]' : 'text-[#1A1A1A]'}`}>
                    {label}
                  </p>
                  <p className={`text-(--fs-xs) font-mono mt-1 leading-snug ${active ? 'text-[#F9F8F6]/60' : 'text-[#1A1A1A]/50'}`}>
                    {desc}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Name + actions */}
        <div className="px-5 pb-5">
          <input
            type="text"
            value={teamName}
            onChange={e => setTeamName(e.target.value)}
            placeholder={zh ? '团队名称...' : 'Team name...'}
            className="w-full px-3 py-2 bg-white border border-[#1A1A1A]/12 focus:border-[#1A1A1A]/40 outline-none text-(--fs-md) font-sans text-[#1A1A1A] placeholder:text-[#1A1A1A]/25 rounded-none mb-4"
          />
          <div className="flex gap-2 justify-end">
            <button onClick={close}
              className="px-3 py-1.5 text-(--fs-sm) font-mono font-bold tracking-widest uppercase border border-[#1A1A1A]/12 text-[#1A1A1A]/40 hover:bg-[#1A1A1A]/5 transition-all rounded-none">
              {zh ? '取消' : 'CANCEL'}
            </button>
            <button
              disabled={!teamType || !teamName.trim() || loading}
              onClick={handleCreate}
              className="px-3 py-1.5 text-(--fs-sm) font-mono font-bold tracking-widest uppercase bg-[#1A1A1A] text-[#F9F8F6] hover:bg-[#1A1A1A]/80 disabled:bg-[#1A1A1A]/15 disabled:text-[#1A1A1A]/30 transition-all rounded-none">
              {loading ? '···' : (zh ? '创建 →' : 'CREATE →')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
