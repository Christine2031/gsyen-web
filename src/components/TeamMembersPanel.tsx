import { X, User } from 'lucide-react';
import { TeamItem, TeamMember } from '../hooks/useTeams';

interface Props {
  team:    TeamItem;
  members: TeamMember[];
  onClose: () => void;
}

export function TeamMembersPanel({ team, members, onClose }: Props) {
  return (
    <aside className="w-[200px] shrink-0 flex flex-col border-l border-[#1A1A1A]/8 bg-[#F4F2EE]">

      {/* 头部 */}
      <div className="px-4 pt-4 pb-3 border-b border-[#1A1A1A]/8 flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="text-(--fs-xs) font-mono font-bold tracking-widest uppercase text-[#1A1A1A]/35">
            {team.type ?? 'TEAM'}
          </p>
          <p className="text-(--fs-md) font-mono font-bold text-[#1A1A1A]/80 leading-snug truncate">
            {team.name}
          </p>
        </div>
        <button onClick={onClose}
          className="shrink-0 p-0.5 text-[#1A1A1A]/25 hover:text-[#1A1A1A]/60 transition-colors mt-0.5">
          <X className="w-3 h-3" strokeWidth={1.5} />
        </button>
      </div>

      {/* 成员数 label */}
      <div className="px-4 pt-3 pb-1">
        <span className="text-(--fs-2xs) font-mono font-bold tracking-widest uppercase text-[#1A1A1A]/30">
          MEMBERS — {members.length}
        </span>
      </div>

      {/* 成员列表 */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {members.length === 0 ? (
          <p className="px-2 text-(--fs-xs) font-mono uppercase tracking-widest text-[#1A1A1A]/25 mt-2">
            暂无成员
          </p>
        ) : (
          <div className="space-y-0.5">
            {members.map(m => (
              <div key={m.user_id}
                className="flex items-center gap-2.5 px-2 py-2 hover:bg-[#1A1A1A]/5 transition-colors">
                <User className="w-3.5 h-3.5 shrink-0 text-[#1A1A1A]/30" strokeWidth={1.5} />
                <div className="min-w-0">
                  <p className="text-(--fs-xs) font-mono text-[#1A1A1A]/65 truncate">
                    {m.user_id.slice(0, 8)}…
                  </p>
                  <p className="text-[7px] font-mono font-bold tracking-widest uppercase text-[#1A1A1A]/25">
                    {m.role === 'owner' ? '团长' : '成员'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
