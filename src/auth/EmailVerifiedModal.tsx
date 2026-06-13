import { useEffect } from 'react';
import { motion } from 'motion/react';

const CINZEL = "'Cinzel', Georgia, 'Times New Roman', serif";

interface Props {
  email: string;
  lang: 'zh' | 'en';
  onDone: () => void;
}

export default function EmailVerifiedModal({ email, lang, onDone }: Props) {
  const zh = lang === 'zh';

  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <motion.div
      key="verified-overlay"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(4,4,4,0.55)',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 32, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as any } }}
        style={{ width: 380, background: '#111111', border: '1px solid rgba(249,248,246,0.16)', padding: '42px 38px 36px', textAlign: 'center' }}
      >
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: CINZEL, fontSize: 11, fontWeight: 700, letterSpacing: '0.4em', color: 'rgba(249,248,246,0.94)', textTransform: 'uppercase', marginBottom: 7 }}>GSYEN</div>
          <div style={{ fontFamily: 'monospace', fontSize: 8, letterSpacing: '0.3em', color: 'rgba(249,248,246,0.38)', textTransform: 'uppercase' }}>
            {zh ? '疆域协同工作平台' : 'SIRIUS VECTOR ATELIER'}
          </div>
        </div>

        <div style={{ height: 1, background: 'rgba(249,248,246,0.1)', marginBottom: 32 }} />

        {/* Checkmark */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1, transition: { delay: 0.2, duration: 0.5, ease: [0.22, 1, 0.36, 1] as any } }}
          style={{ fontSize: 36, marginBottom: 20, color: 'rgba(249,248,246,0.85)' }}
        >
          ✓
        </motion.div>

        {/* Title */}
        <div style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, letterSpacing: '0.22em', color: 'rgba(249,248,246,0.9)', textTransform: 'uppercase', marginBottom: 12 }}>
          {zh ? '邮箱验证成功' : 'EMAIL VERIFIED'}
        </div>

        {/* Email */}
        <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.08em', color: 'rgba(249,248,246,0.45)', marginBottom: 28 }}>
          {email}
        </div>

        {/* Desc */}
        <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.12em', color: 'rgba(249,248,246,0.35)', marginBottom: 32 }}>
          {zh ? '已解锁完整功能权限' : 'Full access unlocked'}
        </div>

        {/* Button */}
        <button
          onClick={onDone}
          style={{
            width: '100%', padding: '12px 0',
            background: 'rgba(249,248,246,0.93)', color: '#111111',
            fontFamily: 'monospace', fontSize: 9, fontWeight: 700,
            letterSpacing: '0.3em', textTransform: 'uppercase',
            border: 'none', cursor: 'pointer',
          }}
        >
          {zh ? '进入疆域 →' : 'ENTER GSYEN →'}
        </button>
      </motion.div>
    </motion.div>
  );
}
