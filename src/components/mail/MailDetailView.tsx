import { motion } from 'motion/react';
import { ArrowLeft, Printer, Reply, SendHorizontal } from 'lucide-react';
import { EmailItem } from '../../types/mail';

interface MailDetailViewProps {
  lang: 'zh' | 'en';
  email: EmailItem;
  inlineReplyText: string;
  onReplyChange: (v: string) => void;
  onSendReply: () => void;
  onBack: () => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function MailDetailView({
  lang, email, inlineReplyText, onReplyChange, onSendReply,
  onBack, onArchive, onDelete,
}: MailDetailViewProps) {
  return (
    <motion.div
      key="detail-panel"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="bg-white border border-[#1A1A1A] rounded-none overflow-hidden"
    >
      {/* Header */}
      <div className="p-3 bg-[#F4F2EE] border-b border-[#1A1A1A] flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="p-1.5 border border-[#1A1A1A] bg-white hover:bg-[#1A1A1A] hover:text-white transition-colors" title={lang === 'zh' ? '回执上一级' : 'Back'}>
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono text-(--fs-xs) uppercase tracking-widest text-neutral-400">
            {lang === 'zh' ? '信件线程阅读端' : 'READING CORRESPONDENCE THREADED DECK'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => onArchive(email.id)} className="p-1.5 bg-white border border-[#1A1A1A]/10 hover:bg-stone-800 hover:text-white text-(--fs-sm) font-mono uppercase tracking-wider transition rounded-none">
            {lang === 'zh' ? '归档' : 'Archive'}
          </button>
          <button onClick={() => onDelete(email.id)} className="p-1.5 bg-white border border-red-200 text-red-800 hover:bg-red-800 hover:text-white text-(--fs-sm) font-mono uppercase tracking-wider transition rounded-none">
            {lang === 'zh' ? '销毁' : 'Destroy'}
          </button>
          <button onClick={() => window.print()} className="p-1.5 bg-white border border-[#1A1A1A]/10 hover:bg-[#1A1A1A]/5 rounded-none" title={lang === 'zh' ? '物理打印保存' : 'Print'}>
            <Printer className="w-3.5 h-3.5 text-neutral-600" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-6 md:p-8 space-y-8 bg-[#F9F8F6]/20 font-sans">
        <div className="border-b border-[#1A1A1A]/10 pb-5">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-lg md:text-xl font-serif text-[#1A1A1A] font-bold tracking-tight">{email.subject}</h1>
            <div className="flex items-center gap-2">
              <span className="font-mono text-(--fs-xs) uppercase tracking-widest py-0.5 px-2 bg-stone-900 text-white rounded-none">{email.category}</span>
              {email.starred && <span className="bg-amber-100 text-amber-800 text-(--fs-sm) font-mono px-1.5 py-0.5 border border-amber-200">★ Focus Label</span>}
            </div>
          </div>
          <p className="text-(--fs-sm) font-mono uppercase text-[#1A1A1A]/35 tracking-wider mt-2">
            {lang === 'zh' ? `系统信件密匙: ${email.id}` : `Secure cipher payload token: ${email.id}`}
          </p>
        </div>

        {/* Thread messages */}
        <div className="space-y-6">
          {email.threadMessages.map((msg, i) => (
            <div key={msg.id || i} className={`p-5 rounded-none border border-[#1A1A1A]/10 ${msg.isMe ? 'bg-white border-l-4 border-l-[#1A1A1A]' : 'bg-[#F4F2EE]/40 border-l-4 border-l-stone-300'}`}>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-[#1A1A1A]/5 pb-3 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 bg-[#1A1A1A] text-white font-serif flex items-center justify-center font-bold text-xs">
                    {msg.senderName.charAt(0)}
                  </div>
                  <div>
                    <span className="font-semibold text-xs block text-[#1A1A1A]">
                      {msg.isMe ? (lang === 'zh' ? '亚历山大·斯特林 (我)' : 'Alexander Sterling (Self)') : msg.senderName}
                    </span>
                    <span className="font-mono text-(--fs-xs) text-[#1A1A1A]/50 block">{msg.senderAddress}</span>
                  </div>
                </div>
                <div className="text-right font-mono text-(--fs-2xs) sm:text-(--fs-xs) uppercase text-[#1A1A1A]/45">{msg.date} @ {msg.time}</div>
              </div>
              <div className="whitespace-pre-line text-xs font-sans text-stone-800 leading-relaxed font-light">{msg.body}</div>
              <div className="mt-4 pt-3 border-t border-dashed border-[#1A1A1A]/5 flex justify-between items-center text-(--fs-2xs) font-mono text-neutral-400">
                <span>{msg.isMe ? 'DISPATCHED_VIA: ATELIER INTERN' : 'SIGNED_BY: COMPLIANT SERVER'}</span>
                <span>SHA256_CERTIFIED: OK</span>
              </div>
            </div>
          ))}
        </div>

        {/* Inline reply */}
        <div className="border border-[#1A1A1A] p-4 bg-white space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-[#1A1A1A]/5">
            <Reply className="w-3.5 h-3.5 text-neutral-600" />
            <span className="font-mono text-(--fs-xs) uppercase tracking-widest text-[#1A1A1A]/60">
              {lang === 'zh' ? '快速起草追加信函 (Inline Sealed Reply)' : 'Inline Sealed Thread Dispatch'}
            </span>
          </div>
          <textarea rows={4} value={inlineReplyText} onChange={e => onReplyChange(e.target.value)}
            placeholder={lang === 'zh' ? '写信回复这封安全信件...' : 'Compose inline encrypted reply to this thread...'}
            className="w-full p-3 text-xs bg-[#F9F8F6] outline-none border border-[#1A1A1A]/10 focus:border-[#1A1A1A] rounded-none font-sans font-light"
          />
          <div className="flex justify-between items-center">
            <div className="text-(--fs-xs) font-mono text-[#1A1A1A]/40 uppercase">
              {lang === 'zh' ? '发往地址: ' : 'Routing to: '}{email.senderAddress}
            </div>
            <div className="flex gap-2">
              <button onClick={() => onReplyChange('')} className="px-3 py-1.5 border border-[#1A1A1A]/10 hover:bg-stone-50 text-(--fs-sm) font-mono uppercase tracking-wider transition rounded-none">
                {lang === 'zh' ? '清空' : 'Clear'}
              </button>
              <button onClick={onSendReply} disabled={!inlineReplyText.trim()}
                className={`px-4 py-1.5 text-(--fs-sm) font-mono uppercase tracking-wider font-bold transition flex items-center gap-1.5 rounded-none ${inlineReplyText.trim() ? 'bg-[#1A1A1A] text-white hover:bg-[#2C2C2C]' : 'bg-neutral-100 text-neutral-300 border border-neutral-200 cursor-not-allowed'}`}
              >
                <SendHorizontal className="w-3 h-3" />
                <span>{lang === 'zh' ? '加印发送' : 'Seal & Airmail'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
