// MAIL 卡片展开面板 —— Level 2（详情+操作）& Level 3（全屏撰写）
// 三级均复用 CardExpandPanel 同一套过渡时序与配色，不引入新样式规范。
import { useState, useEffect } from 'react';
import { CardColor } from './cardConstants';

interface Props {
  lang:           'zh' | 'en';
  color:          CardColor;
  recipient:      string;
  subject:        string;
  expanded:       boolean;
  scope:          'self' | 'shared';
  onScopeChange:  (s: 'self' | 'shared') => void;
  onCollapse:     () => void;
  onCompose:      () => void;
  onComposeClose: () => void;
}

export function MailExpandContent({
  lang, color: C, recipient, subject, expanded, scope, onScopeChange,
  onCollapse, onCompose, onComposeClose,
}: Props) {
  const zh = lang === 'zh';
  const [composing, setComposing] = useState(false);
  const [to,     setTo]     = useState(recipient);
  const [cc,     setCc]     = useState('');
  const [subj,   setSubj]   = useState(subject);
  const [body,   setBody]   = useState('');

  const preview = body.trim()
    ? body.slice(0, 80) + (body.length > 80 ? '…' : '')
    : (zh ? `关于「${subject}」…` : `Re: ${subject}…`);

  // 卡片头部折叠时，重置 composing 状态（下次展开从 L2 开始）
  useEffect(() => { if (!expanded) { setComposing(false); onComposeClose(); } }, [expanded]);

  const handleCompose = () => { setComposing(true);  onCompose();      };
  const handleClose   = () => { setComposing(false); onComposeClose(); };

  return (
    <div className={`grid transition-[grid-template-rows] duration-[360ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
      <div className="overflow-hidden">
        <div className={`px-4 pb-4 pt-3 border-t ${C.panelBorder} space-y-3`} onClick={e => e.stopPropagation()}>

          {!composing ? (
            /* ── Level 2 · 详情 ── */
            <>
              <div className="grid grid-cols-2 gap-3 text-(--fs-md) font-mono">
                <div className="space-y-1">
                  <p className={`text-(--fs-2xs) uppercase tracking-widest ${C.panelLabel}`}>{zh ? '收件人' : 'TO'}</p>
                  <p className={`font-bold truncate ${C.panelText}`}>{to || '—'}</p>
                </div>
                <div className="space-y-1">
                  <p className={`text-(--fs-2xs) uppercase tracking-widest ${C.panelLabel}`}>{zh ? '主题' : 'SUBJECT'}</p>
                  <p className={`font-bold truncate ${C.panelText}`}>{subj || '—'}</p>
                </div>
                <div className={`space-y-1 col-span-2 pt-1.5 border-t border-current/10`}>
                  <p className={`text-(--fs-2xs) uppercase tracking-widest ${C.panelLabel}`}>{zh ? '正文摘要' : 'PREVIEW'}</p>
                  <p className={`text-(--fs-sm) italic truncate ${C.panelText} opacity-60`}>{preview}</p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <div className="flex gap-1.5">
                  {(['self', 'shared'] as const).map(s => (
                    <button key={s} type="button" onClick={() => onScopeChange(s)}
                      className={`px-3 py-1.5 text-(--fs-xs) font-mono uppercase tracking-widest rounded-md transition ${scope === s ? C.btnPrimary : C.btnGhost}`}>
                      {s === 'self' ? (zh ? '个人' : 'Personal') : (zh ? '团队' : 'Team')}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={onCollapse}
                    className={`px-3.5 py-1.5 text-(--fs-xs) font-mono uppercase tracking-widest rounded-md transition ${C.btnDanger}`}>
                    {zh ? '丢弃' : 'Discard'}
                  </button>
                  <button type="button" onClick={handleCompose}
                    className={`px-3.5 py-1.5 text-(--fs-xs) font-mono uppercase tracking-widest rounded-md transition ${C.btnPrimary}`}>
                    {zh ? '撰写' : 'Compose'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* ── Level 3 · 撰写 ── */
            <div className="space-y-0 rounded-xl shadow-[inset_0_1px_4px_rgba(0,0,0,0.04)] bg-black/[0.02] px-3 pt-1 pb-2">
              {[
                { label: zh ? '收件人' : 'To',     val: to,   set: setTo,   ph: '' },
                { label: 'CC',                      val: cc,   set: setCc,   ph: zh ? '多人用逗号分隔' : 'Separate with commas' },
                { label: zh ? '主题'  : 'Subject',  val: subj, set: setSubj, ph: '' },
              ].map(({ label, val, set, ph }) => (
                <div key={label} className={`flex items-center gap-4 border-b ${C.panelBorder} py-2`}>
                  <span className={`text-(--fs-2xs) font-mono uppercase tracking-widest w-12 shrink-0 text-right ${C.panelLabel}`}>{label}</span>
                  <input type="text" value={val} onChange={e => set(e.target.value)} placeholder={ph}
                    className={`flex-1 text-(--fs-base) bg-transparent border-none outline-none ${C.panelText} placeholder:opacity-30`} />
                </div>
              ))}

              <textarea rows={12} value={body} onChange={e => setBody(e.target.value)}
                placeholder={zh ? '正文…' : 'Body…'}
                className={`w-full text-(--fs-base) leading-relaxed pt-3 pb-1 bg-transparent border-none outline-none resize-none ${C.panelText} placeholder:opacity-30`} />

              <div className={`flex items-center justify-end gap-2 pt-2 border-t ${C.panelBorder}`}>
                <button type="button" onClick={handleClose}
                  className={`px-3.5 py-1.5 text-(--fs-xs) font-mono uppercase tracking-widest rounded-md transition ${C.btnGhost}`}>
                  {zh ? '收起' : 'Collapse'}
                </button>
                <button type="button"
                  className={`px-4 py-1.5 text-(--fs-xs) font-mono uppercase tracking-widest rounded-md transition ${C.btnPrimary}`}>
                  {zh ? '发送' : 'Send'}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
