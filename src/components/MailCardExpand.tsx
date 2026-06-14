import { useState } from 'react';

interface MailCardExpandProps {
  recipient: string;
  subject: string;
  onClose: () => void;
}

// 邮件卡片点开后的内联撰写面板 — 凹陷感(inset shadow)呼应 MailModule 撰写框质感
export default function MailCardExpand({ recipient, subject, onClose }: MailCardExpandProps) {
  const [draftBody, setDraftBody] = useState('');

  return (
    <div className="mt-1.5 rounded-xl border border-white/[0.06] bg-[#222626] shadow-[inset_0_2px_10px_rgba(0,0,0,0.35)] p-4 space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="font-mono text-(--fs-xs) tracking-widest text-white/30 uppercase w-12 shrink-0">收件人</span>
        <input
          type="text"
          defaultValue={recipient}
          placeholder="name@example.com"
          className="flex-1 bg-transparent border-b border-white/10 focus:border-white/30 outline-none text-(--fs-base) text-white/85 font-sans py-1"
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-(--fs-xs) tracking-widest text-white/30 uppercase w-12 shrink-0">主题</span>
        <input
          type="text"
          defaultValue={subject}
          className="flex-1 bg-transparent border-b border-white/10 focus:border-white/30 outline-none text-(--fs-base) text-white/85 font-sans py-1"
        />
      </div>
      <textarea
        rows={10}
        value={draftBody}
        onChange={(e) => setDraftBody(e.target.value)}
        placeholder="自由撰写邮件内容…"
        className="w-full bg-black/20 border border-white/[0.06] rounded-lg shadow-[inset_0_2px_8px_rgba(0,0,0,0.25)] outline-none focus:border-white/15 text-(--fs-base) leading-relaxed text-white/85 font-sans p-3 resize-none"
      />
      <div className="flex items-center justify-end gap-2 pt-0.5">
        <button
          onClick={onClose}
          className="font-mono text-(--fs-sm) tracking-widest uppercase text-white/40 hover:text-white/70 transition px-3 py-1.5"
        >
          收起
        </button>
        <button
          onClick={onClose}
          className="font-mono text-(--fs-sm) tracking-widest uppercase bg-sky-400/90 hover:bg-sky-400 text-[#1A1A1A] rounded-md px-4 py-1.5 transition"
        >
          发送
        </button>
      </div>
    </div>
  );
}
