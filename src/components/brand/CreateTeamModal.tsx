import { TrendingUp, Heart, Zap, Globe } from 'lucide-react';

interface Props {
  zh: boolean;
  createType: 'contact' | 'team' | null;
  teamType: string;
  teamName: string;
  onSetCreateType: (type: 'contact' | 'team' | null) => void;
  onSetTeamType: (type: string) => void;
  onSetTeamName: (name: string) => void;
  onSubmit?: () => Promise<void>;
}

export function CreateTeamModal({ zh, createType, teamType, teamName, onSetCreateType, onSetTeamType, onSetTeamName, onSubmit }: Props) {
  if (createType !== 'team') return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/5" onClick={() => onSetCreateType(null)}>
      <div className="bg-white rounded-2xl shadow-xl p-10 w-full max-w-2xl mx-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-[22px] font-bold text-[#202124] mb-8 font-sans">{zh ? '创建团队' : 'Create Team'}</h2>

        <div className="grid grid-cols-2 gap-4 mb-8">
          {[
            { id: 'chengYue', zh: '成约', desc: zh ? '成交推进，客户跟进' : 'Deal progress', Icon: TrendingUp, bg: 'bg-[#E8F0FE]', border: 'border-[#1A73E8]', icon: 'text-[#1A73E8]' },
            { id: 'huoban', zh: '伙伴', desc: zh ? '长期合作，战略协同' : 'Long-term cooperation', Icon: Heart, bg: 'bg-[#E6F4EA]', border: 'border-[#34A853]', icon: 'text-[#34A853]' },
            { id: 'xingdong', zh: '行动', desc: zh ? '短期任务，作战小队' : 'Short-term tasks', Icon: Zap, bg: 'bg-[#FEF7E0]', border: 'border-[#FBBC04]', icon: 'text-[#FBBC04]' },
            { id: 'juji', zh: '聚集', desc: zh ? '兴趣社群，同频连接' : 'Interest community', Icon: Globe, bg: 'bg-[#F3E5F5]', border: 'border-[#A142F4]', icon: 'text-[#A142F4]' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => onSetTeamType(t.id)}
              className={`p-5 rounded-xl border-2 transition-all flex items-center gap-4 ${teamType === t.id ? `${t.border} ${t.bg}` : 'border-[#E8EAED] hover:border-[#DADCE0]'}`}>
              <div className={`w-14 h-14 rounded-full ${t.bg} flex items-center justify-center flex-shrink-0`}>
                <t.Icon className={`w-7 h-7 ${t.icon}`} strokeWidth={1.5} />
              </div>
              <div className="text-left">
                <p className="text-(--fs-body) font-medium text-[#202124] font-sans">{t.zh}</p>
                <p className="text-(--fs-md) text-[#9AA0A6] mt-1 font-sans">{t.desc}</p>
              </div>
            </button>
          ))}
        </div>

        <input
          type="text"
          value={teamName}
          onChange={e => onSetTeamName(e.target.value)}
          placeholder={zh ? '团队名称...' : 'Team name...'}
          className="w-full px-4 py-3 rounded-xl border border-[#DADCE0] text-(--fs-body) focus:outline-none focus:border-[#1A73E8] mb-8 font-sans"
        />

        <div className="flex gap-3 justify-end">
          <button
            onClick={() => { onSetCreateType(null); onSetTeamType(''); onSetTeamName(''); }}
            className="px-5 py-2 rounded-lg text-(--fs-body) font-medium text-[#5F6368] hover:bg-[#F1F3F4] font-sans">
            {zh ? '取消' : 'Cancel'}
          </button>
          <button
            disabled={!teamType || !teamName.trim()}
            onClick={async () => { await onSubmit?.(); onSetCreateType(null); onSetTeamType(''); onSetTeamName(''); }}
            className="px-6 py-2 rounded-lg text-(--fs-body) font-medium bg-[#1A73E8] text-white hover:bg-[#1557B0] disabled:opacity-40 font-sans">
            {zh ? '创建' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
