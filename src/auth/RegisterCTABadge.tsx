import { useState } from 'react';
import { motion } from 'motion/react';

export function RegisterCTABadge({ onClick }: { onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <motion.span
      onClick={onClick}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      className="inline-flex items-center px-3 py-1 text-[9px] font-bold tracking-[0.2em] uppercase border font-mono cursor-pointer select-none"
      style={{ borderColor: 'rgba(26,110,204,0.55)', color: '#4A90D9' }}
      animate={hovered
        ? { backgroundColor: '#1A6ECC', color: '#FFFFFF', y: -2, scale: 1.06,
            borderColor: '#1A6ECC',
            boxShadow: '0 4px 16px rgba(26,110,204,0.5), 0 1px 4px rgba(26,110,204,0.3)' }
        : { backgroundColor: 'rgba(26,110,204,0.07)', color: '#4A90D9', y: 0, scale: 1,
            borderColor: 'rgba(26,110,204,0.55)',
            boxShadow: '0 0px 0px rgba(26,110,204,0)' }
      }
      whileTap={{ scale: 0.93, y: 1 }}
      transition={{ type: 'spring', stiffness: 280, damping: 28 }}
    >
      <motion.span
        animate={hovered ? { textShadow: '0 1px 0 rgba(0,40,100,0.45), 0 2px 8px rgba(26,110,204,0.35)' } : { textShadow: 'none' }}
        transition={{ duration: 0.15 }}
      >
        还没账号？立即注册 →
      </motion.span>
    </motion.span>
  );
}
