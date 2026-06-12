import React from 'react';
import { motion } from 'motion/react';
import type { UserTier } from '../types/auth';

interface TierBadgeProps {
  tier: UserTier | null;
  onClick?: () => void;
}

const base = 'px-1.5 py-0.5 text-[7px] font-bold tracking-[0.22em] uppercase border font-mono shrink-0 select-none';

/** 蓝色升级 CTA — free MEMBER */
function BlueCTABadge({ label, onClick }: { label: string; onClick?: () => void }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <motion.span
      onClick={onClick}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      className="relative inline-flex items-center gap-0.5 px-2 py-0.5 text-[7px] font-bold tracking-[0.22em] uppercase border font-mono shrink-0 cursor-pointer overflow-hidden select-none"
      style={{ borderColor: 'rgba(26,110,204,0.45)', color: '#1A6ECC' }}
      animate={hovered
        ? { backgroundColor: '#1A6ECC', color: '#FFFFFF', y: -2, scale: 1.07,
            borderColor: '#1A6ECC',
            boxShadow: '0 4px 14px rgba(26,110,204,0.38), 0 1px 3px rgba(26,110,204,0.25)' }
        : { backgroundColor: 'rgba(26,110,204,0.04)', color: '#1A6ECC', y: 0, scale: 1,
            borderColor: 'rgba(26,110,204,0.45)',
            boxShadow: '0 0px 0px rgba(26,110,204,0)' }
      }
      whileTap={{ scale: 0.95, y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 22 }}
      title="前往会员中心"
    >
      <motion.span
        animate={hovered ? { textShadow: '0 1px 0 rgba(0,40,100,0.45), 0 2px 8px rgba(26,110,204,0.35)' } : { textShadow: 'none' }}
        transition={{ duration: 0.15 }}
      >
        {label}
      </motion.span>
    </motion.span>
  );
}

/** 黄色升级 CTA — UNVERIFIED */
function YellowCTABadge({ onClick }: { onClick?: () => void }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <motion.span
      onClick={onClick}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      className="relative inline-flex items-center px-2 py-0.5 text-[7px] font-bold tracking-[0.22em] uppercase border font-mono shrink-0 cursor-pointer select-none"
      style={{ borderColor: 'rgba(255,211,0,0.6)', color: '#A07800' }}
      animate={hovered
        ? { backgroundColor: '#FFD300', color: '#1A1A1A', y: -1.5, scale: 1.07,
            borderColor: '#FFD300',
            boxShadow: 'inset 0 1px 0 rgba(255,255,200,0.6), inset 0 -1px 0 rgba(120,90,0,0.25), 0 4px 12px rgba(255,211,0,0.45)' }
        : { backgroundColor: 'rgba(255,211,0,0.07)', color: '#A07800', y: 0, scale: 1,
            borderColor: 'rgba(255,211,0,0.6)',
            boxShadow: '0 0 0 rgba(255,211,0,0)' }
      }
      whileTap={{ scale: 0.95, y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 22 }}
      title="前往会员中心"
    >
      <motion.span
        animate={hovered
          ? { textShadow: '0 1px 0 rgba(255,255,180,0.7), 0 -1px 0 rgba(100,70,0,0.3)' }
          : { textShadow: 'none' }}
        transition={{ duration: 0.12 }}
      >
        UNVERIFIED
      </motion.span>
    </motion.span>
  );
}

export function TierBadge({ tier, onClick }: TierBadgeProps) {
  if (!tier) return null;

  if (tier === 'free_unverified')
    return <YellowCTABadge onClick={onClick} />;

  if (tier === 'free')
    return <BlueCTABadge label="MEMBER" onClick={onClick} />;

  if (tier === 'pro_month' || tier === 'pro_year') return (
    <span onClick={onClick} className={`${base} cursor-pointer bg-[#1A1A1A] text-white border-[#1A1A1A]`}>
      PRO
    </span>
  );

  if (tier === 'enterprise') return (
    <span onClick={onClick} className={`${base} cursor-pointer bg-[#3B5998] text-white border-[#3B5998]`}>
      ENTERPRISE
    </span>
  );

  if (tier === 'owner') return (
    <span onClick={onClick} className={`${base} cursor-pointer border-amber-400/70 text-amber-600 bg-amber-50`}>
      OWNER
    </span>
  );

  // admin
  return (
    <span onClick={onClick} className={`${base} border-[#1A1A1A]/30 text-[#1A1A1A]/70 bg-[#1A1A1A]/5`}>
      ADMIN
    </span>
  );
}
