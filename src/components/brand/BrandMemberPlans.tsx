import React, { useState } from 'react';
import { motion } from 'motion/react';
import { useAuth } from '../../auth/useAuth';
import PaymentModal from './PaymentModal';

interface Feature { label: string; included: boolean }

const F_FREE: Feature[] = [
  { label: '100,000 算筹 / 月', included: true },
  { label: '7 大功能模块', included: true },
  { label: '基础 AI 模型', included: true },
  { label: '优先推理通道', included: false },
  { label: '高级模型（Opus）', included: false },
  { label: '邮件支持', included: false },
];
const F_PRO: Feature[] = [
  { label: '5,000,000 算筹 / 月', included: true },
  { label: '7 大功能模块', included: true },
  { label: '全部 AI 模型', included: true },
  { label: '优先推理通道', included: true },
  { label: '高级模型（Opus）', included: true },
  { label: '邮件支持', included: true },
];
const F_ENT: Feature[] = [
  { label: '不限算筹', included: true },
  { label: '全部功能 + API 接入', included: true },
  { label: '全部 AI 模型', included: true },
  { label: '优先推理通道', included: true },
  { label: '私有部署选项', included: true },
  { label: '专属客服', included: true },
];

const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 28 },
  show:   { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 260, damping: 22 } },
};
const CONTAINER_VARIANTS = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.09 } },
};

type PlanName = 'FREE' | 'PRO' | 'ENTERPRISE';

interface PlansProps { lang: 'zh' | 'en'; onClose?: () => void }

export default function BrandMemberPlans({ lang, onClose }: PlansProps) {
  const [billing, setBilling]     = useState<'month' | 'year'>('month');
  const [selected, setSelected]   = useState<PlanName>('PRO');
  const [showPayment, setShowPayment] = useState(false);
  const { tier } = useAuth();

  const proMonthly = billing === 'year' ? 158 : 198;
  const isFree = !tier || tier === 'free' || tier === 'free_unverified';
  const isPro  = tier === 'pro_month' || tier === 'pro_year';
  const isEnt  = tier === 'enterprise';

  const inner = (
    <div>
      <div className="flex items-start justify-between mb-7">
        <div>
          <h2 className="text-[17px] font-mono font-bold text-[#1A1A1A] mb-1">会员方案</h2>
          <p className="text-(--fs-sm) font-mono text-[#1A1A1A]/40 tracking-wide">穹弯算筹 · 按量计费</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-[#1A1A1A]/30 hover:text-[#1A1A1A] text-lg leading-none transition-colors mt-1">✕</button>
        )}
      </div>

      <div className="flex items-center border border-[#1A1A1A]/10 mb-8 w-fit">
        <button onClick={() => setBilling('month')}
          className={`px-4 py-1.5 text-(--fs-sm) font-mono font-bold tracking-widest uppercase rounded-none transition-all ${billing === 'month' ? 'bg-[#1A1A1A] text-white' : 'text-[#1A1A1A]/50 hover:bg-[#1A1A1A]/5'}`}>
          月付
        </button>
        <button onClick={() => setBilling('year')}
          className={`px-4 py-1.5 text-(--fs-sm) font-mono font-bold tracking-widest uppercase rounded-none transition-all flex items-center gap-1.5 ${billing === 'year' ? 'bg-[#1A1A1A] text-white' : 'text-[#1A1A1A]/50 hover:bg-[#1A1A1A]/5'}`}>
          年付 <span className={`text-(--fs-2xs) font-bold ${billing === 'year' ? 'text-white/60' : 'text-[#1A6ECC]'}`}>-20%</span>
        </button>
      </div>

      <motion.div className="grid grid-cols-1 lg:grid-cols-3 gap-4 max-w-3xl"
        variants={CONTAINER_VARIANTS} initial="hidden" animate="show">
        <PlanCard name="FREE" price="¥0" period="/月" subtitle="永久免费"
          features={F_FREE} isCurrent={isFree} isSelected={selected === 'FREE'}
          onSelect={() => setSelected('FREE')}
          cta={isFree ? '当前方案' : '选择 Free'} ctaDisabled={isFree} ctaVariant="ghost" />
        <PlanCard name="PRO" price={`¥${proMonthly}`} period="/月"
          subtitle={billing === 'month' ? '首月 ¥99 试用' : `¥${proMonthly * 12}/年，省¥${(198 - proMonthly) * 12}`}
          features={F_PRO} isCurrent={isPro} isSelected={selected === 'PRO'}
          onSelect={() => setSelected('PRO')} recommended
          badge={billing === 'month' ? '首月 ¥99' : '年付 8 折'}
          originalPrice={billing === 'year' ? '原价 ¥198/月' : undefined}
          cta={isPro ? '当前方案' : '立即升级'} ctaDisabled={isPro} ctaVariant="primary"
          onCtaClick={() => !isPro && setShowPayment(true)} />
        <PlanCard name="ENTERPRISE" price="定制" period="" subtitle="联系我们获取报价"
          features={F_ENT} isCurrent={isEnt} isSelected={selected === 'ENTERPRISE'}
          onSelect={() => setSelected('ENTERPRISE')}
          cta="联系我们" ctaDisabled={false} ctaVariant="amber"
          onCtaClick={() => window.open('mailto:hello@gsyen.com')} />
      </motion.div>

      {showPayment && <PaymentModal billing={billing} onClose={() => setShowPayment(false)} />}
    </div>
  );

  if (onClose) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1A1A]/40 backdrop-blur-sm"
        onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="bg-[#F9F8F6] max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto p-10 shadow-2xl">
          {inner}
        </div>
      </div>
    );
  }

  return inner;
}

interface PlanCardProps {
  name: string; price: string; period: string; subtitle: string;
  features: Feature[]; isCurrent: boolean; isSelected: boolean; onSelect: () => void;
  recommended?: boolean; badge?: string; originalPrice?: string;
  cta: string; ctaDisabled: boolean; ctaVariant: 'primary' | 'ghost' | 'amber';
  onCtaClick?: () => void;
}

function PlanCard({ name, price, period, subtitle, features, isCurrent,
  isSelected, onSelect, recommended, badge, originalPrice,
  cta, ctaDisabled, ctaVariant, onCtaClick }: PlanCardProps) {
  const dark  = isSelected;
  const isEnt = name === 'ENTERPRISE';
  const onDark = dark || isEnt;
  const fg      = onDark ? 'text-[#F0EDEA]'   : 'text-[#1A1A1A]';
  const fgMuted = onDark ? 'text-[#F0EDEA]/55' : 'text-[#1A1A1A]/40';
  const divider = onDark ? 'border-white/10'   : 'border-[#1A1A1A]/8';
  const ctaCls  = onDark ? 'bg-[#F0EDEA] text-[#1A1A1A] hover:bg-white'
    : 'border border-[#1A1A1A]/15 text-[#1A1A1A]/45 hover:bg-[#1A1A1A]/5';
  const cardBg: React.CSSProperties = isEnt
    ? { background: '#3B5998', boxShadow: '0 4px 16px rgba(59,89,152,0.25)', borderColor: 'rgba(255,255,255,0.1)' }
    : dark
    ? { background: 'linear-gradient(160deg, #2C3858 0%, #232E4A 55%, #1A233B 100%)',
        boxShadow: '0 6px 20px rgba(26,32,53,0.35), inset 0 1px 0 rgba(255,255,255,0.07)',
        borderColor: 'rgba(100,130,200,0.12)' }
    : {};

  return (
    <motion.div variants={CARD_VARIANTS} onClick={onSelect} className="cursor-pointer">
      <motion.div
        animate={{ scale: isSelected ? 1.03 : 0.965, y: isSelected ? -6 : 0 }}
        transition={{ type: 'spring', stiffness: 240, damping: 30 }}
        whileHover={{ y: -1, transition: { type: 'spring', stiffness: 300, damping: 32 } }}
        className={`relative flex flex-col border select-none ${onDark ? 'border-white/5' : 'bg-[#E8E6E1] border-[#1A1A1A]/10'}`}
        style={{ ...cardBg, padding: isSelected ? '28px 24px 36px' : '24px 24px 28px', willChange: 'transform' }}>
        {dark && <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(160deg, rgba(255,255,255,0.04) 0%, transparent 45%)' }} />}
        {recommended && !isSelected && (
          <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-[#1A1A1A]/60 text-white/60 text-[7px] font-mono font-bold tracking-widest uppercase whitespace-nowrap">{badge}</span>
        )}
        {badge && isSelected && (
          <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-[#1A6ECC] text-white text-[7.5px] font-mono font-bold tracking-widest uppercase whitespace-nowrap"
            style={{ boxShadow: '0 4px 12px rgba(26,110,204,0.45)' }}>{badge}</span>
        )}
        {isSelected && (
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 18 }}
            className="absolute top-3 right-3 w-4 h-4 flex items-center justify-center text-(--fs-2xs) font-bold"
            style={{ color: onDark ? 'rgba(240,237,234,0.6)' : '#1A1A1A' }}>✓</motion.span>
        )}
        <div className="mb-5">
          <div className={`text-[8.5px] font-mono font-bold tracking-[0.28em] uppercase mb-3 ${fgMuted}`}>{name}</div>
          <div className="flex items-baseline gap-1 flex-wrap">
            <span className={`text-[34px] font-black leading-none ${fg}`}>{price}</span>
            <span className={`text-(--fs-md) font-mono ${fgMuted}`}>{period}</span>
            {originalPrice && <span className={`text-(--fs-xs) font-mono line-through ml-1 ${fgMuted}`}>{originalPrice}</span>}
          </div>
          <div className={`text-[8.5px] font-mono mt-1.5 ${fgMuted}`}>{subtitle}</div>
        </div>
        <hr className={`border-t ${divider} mb-4`} />
        <ul className="flex flex-col gap-2.5 flex-1 mb-7">
          {features.map(f => (
            <li key={f.label} className={`flex items-start gap-2 text-[8.5px] font-mono ${f.included ? fg : fgMuted}`}>
              <span className="mt-px shrink-0 w-3">{f.included ? '✓' : '—'}</span>
              <span>{f.label}</span>
            </li>
          ))}
        </ul>
        <button disabled={ctaDisabled} onClick={e => { e.stopPropagation(); onCtaClick?.(); }}
          className={`w-full py-2 text-(--fs-xs) font-mono font-bold tracking-widest uppercase transition-all rounded-none ${ctaCls} ${ctaDisabled ? 'opacity-40 cursor-default' : 'cursor-pointer'}`}>
          {isCurrent && '✓ '}{cta}
        </button>
      </motion.div>
    </motion.div>
  );
}
