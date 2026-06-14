import React from 'react';

interface Props {
  isOpen: boolean;
  busy: boolean;
  error: string | null;
  value: string;
  onChange: (value: string) => void;
  onJoin: () => void;
  onClose: () => void;
}

export default function BrandTeamJoinModal({ isOpen, busy, error, value, onChange, onJoin, onClose }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50"
      onClick={onClose}>
      <div className="bg-white rounded-2xl border border-[#DADCE0] px-6 py-5 w-80 flex flex-col gap-4"
        onClick={e => e.stopPropagation()}>
        <p className="text-(--fs-body) font-sans font-semibold text-[#202124]">加入团队</p>
        <input autoFocus value={value} onChange={e => onChange(e.target.value)}
          placeholder="粘贴邀请码…"
          className="border border-[#DADCE0] rounded-lg px-3 py-2 text-(--fs-body) font-sans text-[#202124] placeholder:text-[#9AA0A6] outline-none focus:border-[#1A73E8] transition-colors"
          onKeyDown={e => e.key === 'Enter' && onJoin()}
        />
        {error && <p className="text-(--fs-base) font-sans text-[#D93025]">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose}
            className="px-4 py-2 rounded-full text-(--fs-base) font-sans text-[#5F6368] hover:bg-[#F1F3F4] transition-all">
            取消
          </button>
          <button onClick={onJoin} disabled={busy}
            className="px-4 py-2 rounded-full text-(--fs-base) font-sans font-medium bg-[#1A73E8] text-white hover:bg-[#1557B0] disabled:opacity-40 transition-all">
            {busy ? '…' : '加入'}
          </button>
        </div>
      </div>
    </div>
  );
}
