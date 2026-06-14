import { useAuth } from '../../auth/useAuth';
import type { UserTier } from '../../types/auth';

interface Props { lang: 'zh' | 'en'; onScrollToPlans?: () => void }

interface Perm { zh: string; en: string; tiers: UserTier[] }

const ALL_TIERS: UserTier[] = ['free_unverified', 'free', 'pro_month', 'pro_year', 'enterprise', 'owner', 'admin'];
const PAID_TIERS: UserTier[] = ['pro_month', 'pro_year', 'enterprise', 'owner', 'admin'];
const ENT_TIERS:  UserTier[] = ['enterprise', 'owner', 'admin'];

const PERMS: Perm[] = [
  { zh: '7 大功能模块',         en: '7 workspace modules',       tiers: ALL_TIERS },
  { zh: '基础 AI 模型',         en: 'Standard AI models',         tiers: ALL_TIERS },
  { zh: '100,000 算筹 / 月',   en: '100,000 tokens / mo',        tiers: ['free_unverified', 'free'] },
  { zh: '5,000,000 算筹 / 月', en: '5,000,000 tokens / mo',      tiers: PAID_TIERS },
  { zh: '优先推理通道',         en: 'Priority inference',         tiers: PAID_TIERS },
  { zh: '高级模型（Opus）',     en: 'Advanced models (Opus)',     tiers: PAID_TIERS },
  { zh: '邮件支持',             en: 'Email support',              tiers: PAID_TIERS },
  { zh: 'API 接入',             en: 'API access',                 tiers: ENT_TIERS  },
  { zh: '私有部署选项',         en: 'Private deployment',         tiers: ENT_TIERS  },
  { zh: '专属客服',             en: 'Dedicated support',          tiers: ENT_TIERS  },
];

const TIER_META: Record<string, { label: string; cls: string }> = {
  free_unverified: { label: 'UNVERIFIED', cls: 'border-amber-400/70 text-amber-600 bg-amber-50' },
  free:            { label: 'MEMBER',     cls: 'border-[#1A6ECC]/45 text-[#1A6ECC] bg-[#1A6ECC]/5' },
  pro_month:       { label: 'PRO',        cls: 'bg-[#1A1A1A] text-white border-[#1A1A1A]' },
  pro_year:        { label: 'PRO',        cls: 'bg-[#1A1A1A] text-white border-[#1A1A1A]' },
  enterprise:      { label: 'ENTERPRISE', cls: 'bg-[#3B5998] text-white border-[#3B5998]' },
  owner:           { label: 'OWNER',      cls: 'border-amber-400/70 text-amber-600 bg-amber-50' },
  admin:           { label: 'ADMIN',      cls: 'border-[#1A1A1A]/30 text-[#1A1A1A]/70 bg-[#1A1A1A]/5' },
};

export default function BrandMemberPerms({ lang, onScrollToPlans }: Props) {
  const zh = lang === 'zh';
  const { tier, user } = useAuth();
  const isLoggedIn = !!user;
  const t = isLoggedIn ? (tier ?? 'free_unverified') : null;
  const meta = t ? (TIER_META[t] ?? TIER_META['free']) : null;

  const included = t ? PERMS.filter(p => p.tiers.includes(t as UserTier)) : [];
  const excluded = t ? PERMS.filter(p => !p.tiers.includes(t as UserTier)) : [];

  return (
    <div>
      <div className="mb-7">
        <p className="text-(--fs-sm) font-mono font-bold tracking-[0.28em] uppercase text-[#1A1A1A]">
          {zh ? '我的权限' : 'My Permissions'}
        </p>
        <p className="text-(--fs-xs) font-mono text-[#1A1A1A]/38 mt-1 tracking-wide">
          {zh ? '当前等级包含的功能与访问权限' : 'Features and access included in your current plan'}
        </p>
      </div>

      {/* 未登录占位 */}
      {!isLoggedIn && (
        <div className="bg-white border border-[#DADCE0] px-6 py-5 mb-5 text-(--fs-body) font-sans text-[#5F6368]">
          {zh ? '登录后查看您的权限' : 'Sign in to view your permissions'}
        </div>
      )}

      {/* 当前等级卡 */}
      {isLoggedIn && meta && (
      <div className="bg-white border border-[#DADCE0] px-6 py-5 mb-5 flex items-center justify-between">
        <div>
          <p className="text-(--fs-md) font-sans text-[#5F6368] mb-1">{zh ? '当前等级' : 'Current plan'}</p>
          <span className={`inline-flex items-center px-2 py-0.5 text-[7px] font-mono font-bold tracking-[0.22em] uppercase border ${meta.cls}`}>
            {meta.label}
          </span>
        </div>
        {(t === 'free_unverified' || t === 'free') && (
          <button onClick={onScrollToPlans}
            className="text-(--fs-sm) font-mono text-[#1A6ECC]/70 tracking-wide hover:text-[#1A6ECC] transition-colors cursor-pointer">
            {zh ? '升级 PRO 解锁更多 →' : 'Upgrade to PRO for more →'}
          </button>
        )}
      </div>
      )}

      {/* 已包含 / 未包含权限列表 — 仅登录后显示 */}
      {isLoggedIn && (
        <>
          <p className="text-(--fs-2xs) font-mono font-bold tracking-[0.28em] uppercase text-[#1A1A1A]/30 mb-3">
            {zh ? '已包含' : 'Included'}
          </p>
          <div className="bg-white border border-[#DADCE0] mb-5">
            {included.map((p, i) => (
              <div key={p.en} className={`flex items-center gap-3 px-6 py-3.5 ${i < included.length - 1 ? 'border-b border-[#DADCE0]' : ''}`}>
                <span className="text-[#137333] text-(--fs-body) font-sans shrink-0">✓</span>
                <span className="text-(--fs-body) font-sans text-[#202124]">{zh ? p.zh : p.en}</span>
              </div>
            ))}
          </div>

          {excluded.length > 0 && (
            <>
              <p className="text-(--fs-2xs) font-mono font-bold tracking-[0.28em] uppercase text-[#1A1A1A]/30 mb-3">
                {zh ? '未包含' : 'Not included'}
              </p>
              <div className="bg-[#F8F9FA] border border-[#DADCE0]">
                {excluded.map((p, i) => (
                  <div key={p.en} className={`flex items-center gap-3 px-6 py-3.5 ${i < excluded.length - 1 ? 'border-b border-[#DADCE0]' : ''}`}>
                    <span className="text-[#BDC1C6] text-(--fs-body) font-sans shrink-0">—</span>
                    <span className="text-(--fs-body) font-sans text-[#9AA0A6]">{zh ? p.zh : p.en}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
