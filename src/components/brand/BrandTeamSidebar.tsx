import React from 'react';
import { Plus } from 'lucide-react';

export interface TeamItem {
  id:          string;
  name:        string;
  owner_id:    string;
  invite_code: string;
  seat_limit:  number;
  role:        string;
}

interface Props {
  teams:      TeamItem[];
  selectedId: string | null;
  onSelect:   (t: TeamItem) => void;
  onCreate:   () => void;
  onJoin:     () => void;
}

export default function BrandTeamSidebar({ teams, selectedId, onSelect, onCreate, onJoin }: Props) {
  return (
    <aside className="w-[72px] flex flex-col items-center py-4 gap-3 border-r border-[#1A1A1A]/8 bg-[#ECEAE6] shrink-0">
      {teams.map(t => {
        const active = t.id === selectedId;
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t)}
            title={t.name}
            className={`w-11 h-11 rounded-[14px] flex items-center justify-center text-(--fs-body) font-mono font-bold transition-all ${
              active
                ? 'bg-[#1A1A1A] text-white rounded-[10px]'
                : 'bg-white/70 text-[#1A1A1A]/60 hover:rounded-[10px] hover:bg-white'
            }`}
          >
            {t.name.slice(0, 2)}
          </button>
        );
      })}

      {/* 分割线 */}
      {teams.length > 0 && <div className="w-8 h-px bg-[#1A1A1A]/10" />}

      {/* 开团 */}
      <button
        onClick={onCreate}
        title="开团"
        className="w-11 h-11 rounded-[14px] bg-white/70 hover:bg-white hover:rounded-[10px] flex items-center justify-center text-[#137333] transition-all"
      >
        <Plus className="w-4 h-4" strokeWidth={2} />
      </button>

      {/* 加入团队 */}
      <button
        onClick={onJoin}
        title="加入团队"
        className="w-11 h-11 rounded-[14px] bg-white/70 hover:bg-white hover:rounded-[10px] flex items-center justify-center text-[#1A1A1A]/40 hover:text-[#1A1A1A]/70 transition-all text-(--fs-sm) font-mono font-bold"
      >
        入
      </button>
    </aside>
  );
}
