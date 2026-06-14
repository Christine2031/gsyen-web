import { X, User } from 'lucide-react';
import { Friend } from '../hooks/useFriends';

interface Props {
  friends: Friend[];
  onClose: () => void;
}

export function FriendsPanel({ friends, onClose }: Props) {
  return (
    <aside className="w-[200px] shrink-0 flex flex-col border-l border-[#1A1A1A]/8 bg-[#F4F2EE]">

      <div className="px-4 pt-4 pb-3 border-b border-[#1A1A1A]/8 flex items-center justify-between">
        <div className="space-y-0.5">
          <p className="text-(--fs-xs) font-mono font-bold tracking-widest uppercase text-[#1A1A1A]/35">
            CONTACTS
          </p>
          <p className="text-(--fs-md) font-mono font-bold text-[#1A1A1A]/80">好友</p>
        </div>
        <button onClick={onClose}
          className="p-0.5 text-[#1A1A1A]/25 hover:text-[#1A1A1A]/60 transition-colors">
          <X className="w-3 h-3" strokeWidth={1.5} />
        </button>
      </div>

      <div className="px-4 pt-3 pb-1">
        <span className="text-(--fs-2xs) font-mono font-bold tracking-widest uppercase text-[#1A1A1A]/30">
          MEMBERS — {friends.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {friends.length === 0 ? (
          <p className="px-2 mt-2 text-(--fs-xs) font-mono uppercase tracking-widest text-[#1A1A1A]/25">
            暂无好友
          </p>
        ) : (
          <div className="space-y-0.5">
            {friends.map(f => (
              <div key={f.user_id}
                className="flex items-center gap-2.5 px-2 py-2 hover:bg-[#1A1A1A]/5 transition-colors">
                <User className="w-3.5 h-3.5 shrink-0 text-[#1A1A1A]/30" strokeWidth={1.5} />
                <div className="min-w-0">
                  <p className="text-(--fs-xs) font-mono text-[#1A1A1A]/65 truncate">
                    {f.user_id.slice(0, 8)}…
                  </p>
                  <p className="text-[7px] font-mono font-bold tracking-widest uppercase text-[#1A1A1A]/25 truncate">
                    {f.teamName}
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
