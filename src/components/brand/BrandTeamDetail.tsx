import React, { useState } from 'react';
import { Copy, Check, LogOut, Trash2 } from 'lucide-react';
import type { TeamItem } from './BrandTeam';

export interface MemberItem {
  user_id:   string;
  role:      string;
  joined_at: string;
}

interface Props {
  team:          TeamItem;
  members:       MemberItem[];
  currentUserId: string;
  onLeave:       () => void;
  onDisband:     () => void;
}

const AVATAR_COLORS = [
  'bg-[#1A73E8]', 'bg-[#137333]', 'bg-[#B05E00]',
  'bg-[#9334E6]', 'bg-[#D93025]', 'bg-[#0097A7]',
];

export default function BrandTeamDetail({ team, members, currentUserId, onLeave, onDisband }: Props) {
  const [copied, setCopied] = useState(false);
  const isOwner = team.owner_id === currentUserId;

  function copyInvite() {
    navigator.clipboard.writeText(team.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 pb-6 flex flex-col gap-4 min-h-0">

      {/* 邀请码 banner（团长）/ 退出按钮（成员） */}
      {isOwner ? (
        <div className="bg-[#E8F0FE] rounded-lg px-5 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-(--fs-md) text-[#5F6368] font-sans mb-0.5">邀请码</p>
            <code className="text-(--fs-body) font-mono text-[#1A73E8] font-semibold">{team.invite_code}</code>
          </div>
          <button onClick={copyInvite}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-(--fs-base) font-sans font-medium bg-white border border-[#DADCE0] text-[#1A73E8] hover:bg-[#F8F9FA] transition-all shrink-0">
            {copied ? <Check className="w-3.5 h-3.5" strokeWidth={2.5} /> : <Copy className="w-3.5 h-3.5" strokeWidth={2} />}
            {copied ? '已复制' : '复制'}
          </button>
          <button onClick={onDisband}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-(--fs-base) font-sans font-medium border border-red-200 text-red-600 bg-white hover:bg-red-50 transition-all shrink-0">
            <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
            解散
          </button>
        </div>
      ) : (
        <div className="flex justify-end">
          <button onClick={onLeave}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-(--fs-base) font-sans border border-[#DADCE0] text-[#5F6368] hover:bg-[#F1F3F4] transition-all">
            <LogOut className="w-3.5 h-3.5" strokeWidth={2} />
            退出团队
          </button>
        </div>
      )}

      {/* 成员表格 */}
      <div className="bg-white rounded-lg border border-[#DADCE0] overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[#E8EAED] bg-[#F8F9FA]">
              <th className="py-3 pl-6 pr-3 text-left text-(--fs-md) font-semibold text-[#5F6368] uppercase tracking-wider font-sans">成员</th>
              <th className="py-3 px-3 text-left text-(--fs-md) font-semibold text-[#5F6368] uppercase tracking-wider font-sans">
                席位 {members.length} / {team.seat_limit}
              </th>
              <th className="py-3 px-3 text-left text-(--fs-md) font-semibold text-[#5F6368] uppercase tracking-wider font-sans">加入时间</th>
              <th className="py-3 pl-3 pr-6 text-left text-(--fs-md) font-semibold text-[#5F6368] uppercase tracking-wider font-sans">角色</th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-12 text-center text-(--fs-body) text-[#9AA0A6] font-sans">暂无成员</td>
              </tr>
            ) : members.map(m => {
              const isSelf = m.user_id === currentUserId;
              const color  = AVATAR_COLORS[m.user_id.charCodeAt(0) % AVATAR_COLORS.length];
              return (
                <tr key={m.user_id} className="border-b border-[#E8EAED] hover:bg-[#F8F9FA] transition-colors">
                  <td className="py-3.5 pl-6 pr-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full ${color} flex items-center justify-center shrink-0`}>
                        <span className="text-white text-(--fs-md) font-bold font-sans">
                          {m.user_id.slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <p className="text-(--fs-body) font-medium text-[#202124] font-sans">
                        {isSelf ? '你' : `用户 ${m.user_id.slice(0, 8)}`}
                      </p>
                    </div>
                  </td>
                  <td className="py-3.5 px-3">
                    <p className="text-(--fs-base) text-[#9AA0A6] font-sans">—</p>
                  </td>
                  <td className="py-3.5 px-3">
                    <p className="text-(--fs-base) text-[#5F6368] font-sans">
                      {new Date(m.joined_at).toLocaleDateString('zh-CN')}
                    </p>
                  </td>
                  <td className="py-3.5 pl-3 pr-6">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-(--fs-md) font-medium font-sans ${
                      m.role === 'owner'
                        ? 'bg-[#E6F4EA] text-[#137333]'
                        : 'bg-[#F1F3F4] text-[#5F6368]'
                    }`}>
                      {m.role === 'owner' ? '团长' : '成员'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
