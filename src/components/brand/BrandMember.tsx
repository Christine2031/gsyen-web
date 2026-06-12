import React, { useState } from 'react';
import { motion } from 'motion/react';
import { useAuth } from '../../auth/useAuth';

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

export default function BrandMember({ lang }: { lang: 'zh' | 'en' }) {
  const [billing, setBilling] = useState<'month' | 'year'>('month');
  const [selected, setSelected] = useState<PlanName>('PRO');
  const { tier } = useAuth();

  const proMonthly = billing === 'year' ? 158 : 198;
  const isFree = !tier || tier === 'free' || tier === 'free_unverified';
  const isPro  = tier === 'pro_month' || tier === 'pro_year';
  const isEnt  = tier === 'enterprise';

  return (
    <div className="flex-1 overflow-y-auto px-8 py-10">
      <motion.div
        className="flex flex-col items-center gap-2 mb-8"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      >
        <h2 className="text-[11px] font-mono font-bold tracking-[0.28em] uppercase text-[#1A1A1A]">
          {lang === 'zh' ? '会员方案' : 'Membership Plans'}
        </h2>
        <p className="text-[8.5px] font-mono tracking-[0.18em] uppercase text-[#1A1A1A]/35">
          {lang === 'zh' ? '穹弯算筹 · 按量计费' : 'Halfsphere Token Billing'}
        </p>

        <div className="flex items-center border border-[#1A1A1A]/10 mt-3">
          <button
            onClick={() => setBilling('month')}
            className={`px-4 py-1.5 text-[10px] font-mono font-bold tracking-widest uppercase rounded-none transition-all ${
              billing === 'month' ? 'bg-[#1A1A1A] text-white' : 'text-[#1A1A1A]/50 hover:bg-[#1A1A1A]/5'
            }`}
          >
            {lang === 'zh' ? '月付' : 'Monthly'}
          </button>
          <button
            onClick={() => setBilling('year')}
            className={`px-4 py-1.5 text-[10px] font-mono font-bold tracking-widest uppercase rounded-none transition-all flex items-center gap-1.5 ${
              billing === 'year' ? 'bg-[#1A1A1A] text-white' : 'text-[#1A1A1A]/50 hover:bg-[#1A1A1A]/5'
            }`}
          >
            {lang === 'zh' ? '年付' : 'Annual'}
            <span className={`text-[8px] font-bold ${billing === 'year' ? 'text-white/60' : 'text-[#1A6ECC]'}`}>
              -20%
            </span>
          </button>
        </div>
      </motion.div>

      <motion.div
        className="grid grid-cols-1 lg:grid-cols-3 gap-4 max-w-4xl mx-auto items-start"
        variants={CONTAINER_VARIANTS}
        initial="hidden"
        animate="show"
      >
        <PlanCard
          name="FREE"
          price="¥0"
          period={lang === 'zh' ? '/月' : '/mo'}
          subtitle={lang === 'zh' ? '永久免费' : 'Forever free'}
          features={F_FREE}
          isCurrent={isFree}
          isSelected={selected === 'FREE'}
          onSelect={() => setSelected('FREE')}
          cta={isFree ? (lang === 'zh' ? '当前方案' : 'Current Plan') : (lang === 'zh' ? '选择 Free' : 'Choose Free')}
          ctaDisabled={isFree}
          ctaVariant="ghost"
        />

        <PlanCard
          name="PRO"
          price={`¥${proMonthly}`}
          period={lang === 'zh' ? '/月' : '/mo'}
          subtitle={billing === 'month'
            ? (lang === 'zh' ? '首月 ¥99 试用' : 'First month ¥99')
            : (lang === 'zh' ? `¥${proMonthly * 12}/年，省¥${(198 - proMonthly) * 12}` : `¥${proMonthly * 12}/yr`)}
          features={F_PRO}
          isCurrent={isPro}
          isSelected={selected === 'PRO'}
          onSelect={() => setSelected('PRO')}
          recommended
          badge={billing === 'month' ? (lang === 'zh' ? '首月 ¥99' : '¥99 trial') : (lang === 'zh' ? '年付 8 折' : '20% off')}
          originalPrice={billing === 'year' ? (lang === 'zh' ? '原价 ¥198/月' : 'Was ¥198/mo') : undefined}
          cta={isPro ? (lang === 'zh' ? '当前方案' : 'Current Plan') : (lang === 'zh' ? '立即升级' : 'Upgrade Now')}
          ctaDisabled={isPro}
          ctaVariant="primary"
        />

        <PlanCard
          name="ENTERPRISE"
          price={lang === 'zh' ? '定制' : 'Custom'}
          period=""
          subtitle={lang === 'zh' ? '联系我们获取报价' : 'Contact us for pricing'}
          features={F_ENT}
          isCurrent={isEnt}
          isSelected={selected === 'ENTERPRISE'}
          onSelect={() => setSelected('ENTERPRISE')}
          cta={lang === 'zh' ? '联系我们' : 'Contact Us'}
          ctaDisabled={false}
          ctaVariant="amber"
          onCtaClick={() => window.open('mailto:hello@gsyen.com')}
        />
      </motion.div>
    </div>
  );
}

/* ── PlanCard ── */
interface PlanCardProps {
  name: string; price: string; period: string; subtitle: string;
  features: Feature[]; isCurrent: boolean;
  isSelected: boolean; onSelect: () => void;
  recommended?: boolean;
  badge?: string; originalPrice?: string;
  cta: string; ctaDisabled: boolean;
  ctaVariant: 'primary' | 'ghost' | 'amber';
  onCtaClick?: () => void;
}

function PlanCard({ name, price, period, subtitle, features, isCurrent,
  isSelected, onSelect, recommended, badge, originalPrice,
  cta, ctaDisabled, ctaVariant, onCtaClick }: PlanCardProps) {

  const dark  = isSelected;
  const isEnt = name === 'ENTERPRISE';
  const onDark = dark || isEnt;

  const fg      = onDark ? 'text-[#F0EDEA]'    : 'text-[#1A1A1A]';
  const fgMuted = onDark ? 'text-[#F0EDEA]/55'  : 'text-[#1A1A1A]/40';
  const divider = onDark ? 'border-white/10'    : 'border-[#1A1A1A]/8';

  const ctaCls = onDark
    ? 'bg-[#F0EDEA] text-[#1A1A1A] hover:bg-white'
    : 'border border-[#1A1A1A]/15 text-[#1A1A1A]/45 hover:bg-[#1A1A1A]/5';

  const cardBg: React.CSSProperties = isEnt
    ? {
        background: '#3B5998',
        boxShadow: '0 4px 16px rgba(59,89,152,0.25)',
        borderColor: 'rgba(255,255,255,0.1)',
      }
    : dark
    ? {
        background: 'linear-gradient(160deg, #2C3858 0%, #232E4A 55%, #1A233B 100%)',
        boxShadow: '0 6px 20px rgba(26,32,53,0.35), inset 0 1px 0 rgba(255,255,255,0.07)',
        borderColor: 'rgba(100,130,200,0.12)',
      }
    : {};

  // 外层：处理 stagger 入场（variants）
  // 内层：处理选中态 scale + y（animate）—— 两层分离避免冲突
  return (
    <motion.div variants={CARD_VARIANTS} onClick={onSelect} className="cursor-pointer">
      <motion.div
        animate={{
          scale: isSelected ? 1.03 : 0.965,
          y: isSelected ? -6 : 0,
        }}
        transition={{ type: 'spring', stiffness: 240, damping: 30 }}
        whileHover={{ y: -1, transition: { type: 'spring', stiffness: 300, damping: 32 } }}
        className={`relative flex flex-col border select-none ${
          onDark ? 'border-white/5' : 'bg-[#E8E6E1] border-[#1A1A1A]/10'
        }`}
        style={{ ...cardBg, padding: isSelected ? '28px 24px 36px' : '24px 24px 28px', willChange: 'transform' }}
      >
      {/* 光泽 overlay */}
      {dark && (
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(160deg, rgba(255,255,255,0.04) 0%, transparent 45%)' }} />
      )}

      {/* 推荐标签 */}
      {recommended && !isSelected && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-[#1A1A1A]/60 text-white/60 text-[7px] font-mono font-bold tracking-widest uppercase whitespace-nowrap">
          {badge}
        </span>
      )}
      {badge && isSelected && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-[#1A6ECC] text-white text-[7.5px] font-mono font-bold tracking-widest uppercase whitespace-nowrap"
          style={{ boxShadow: '0 4px 12px rgba(26,110,204,0.45)' }}>
          {badge}
        </span>
      )}

      {/* 选中角标 */}
      {isSelected && (
        <motion.span
          initial={{ scale: 0 }} animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 18 }}
          className="absolute top-3 right-3 w-4 h-4 flex items-center justify-center text-[8px] font-bold"
          style={{ color: onDark ? 'rgba(240,237,234,0.6)' : '#1A1A1A' }}
        >
          ✓
        </motion.span>
      )}

      <div className="mb-5 relative">
        <div className={`text-[8.5px] font-mono font-bold tracking-[0.28em] uppercase mb-3 ${fgMuted}`}>{name}</div>
        <div className="flex items-baseline gap-1 flex-wrap">
          <span className={`text-[34px] font-black leading-none ${fg}`}>{price}</span>
          <span className={`text-[11px] font-mono ${fgMuted}`}>{period}</span>
          {originalPrice && <span className={`text-[9px] font-mono line-through ml-1 ${fgMuted}`}>{originalPrice}</span>}
        </div>
        <div className={`text-[8.5px] font-mono mt-1.5 ${fgMuted}`}>{subtitle}</div>
      </div>

      <hr className={`border-t ${divider} mb-4`} />

      <ul className="flex flex-col gap-2.5 flex-1 mb-7 relative">
        {features.map(f => (
          <li key={f.label} className={`flex items-start gap-2 text-[8.5px] font-mono ${f.included ? fg : fgMuted}`}>
            <span className="mt-px shrink-0 w-3">{f.included ? '✓' : '—'}</span>
            <span>{f.label}</span>
          </li>
        ))}
      </ul>

      <button
        disabled={ctaDisabled}
        onClick={e => { e.stopPropagation(); onCtaClick?.(); }}
        className={`w-full py-2 text-[9px] font-mono font-bold tracking-widest uppercase transition-all rounded-none relative ${ctaCls} ${
          ctaDisabled ? 'opacity-40 cursor-default' : 'cursor-pointer'
        }`}
      >
        {isCurrent && '✓ '}{cta}
      </button>
      </motion.div>
    </motion.div>
  );
}
