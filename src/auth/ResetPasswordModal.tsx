import { useState } from 'react';
import { motion } from 'motion/react';
import { supabase } from './supabaseClient';

const CINZEL = "'Cinzel', Georgia, 'Times New Roman', serif";

interface Props {
  lang: 'zh' | 'en';
  onDone: () => void;
}

export default function ResetPasswordModal({ lang, onDone }: Props) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [error, setError]       = useState('');
  const [done, setDone]         = useState(false);
  const [busy, setBusy]         = useState(false);
  const zh = lang === 'zh';

  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '11px 13px',
    background: 'rgba(249,248,246,0.05)',
    border: '1px solid rgba(249,248,246,0.2)',
    color: 'rgba(249,248,246,0.88)',
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: 12, letterSpacing: '0.04em', outline: 'none',
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError('');
    if (!password) { setError(zh ? '请输入新密码' : 'Password required'); return; }
    if (password.length < 8) { setError(zh ? '密码至少 8 位' : 'Min 8 characters'); return; }
    if (password !== confirm) { setError(zh ? '两次密码不一致' : 'Passwords do not match'); return; }
    setBusy(true);
    const { error: err } = await supabase!.auth.updateUser({ password });
    if (err) { setError(err.message); setBusy(false); return; }
    setDone(true);
    setBusy(false);
    setTimeout(onDone, 2000);
  };

  return (
    <motion.div
      key="reset-overlay"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(4,4,4,0.05)',
        backdropFilter: 'blur(1px)', WebkitBackdropFilter: 'blur(1px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 28, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as any } }}
        style={{ width: 380, background: '#111111', border: '1px solid rgba(249,248,246,0.16)', padding: '42px 38px 34px' }}
      >
        <style>{`.rp-inp::placeholder{color:rgba(249,248,246,0.38)}`}</style>

        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontFamily: CINZEL, fontSize: 11, fontWeight: 700, letterSpacing: '0.4em', color: 'rgba(249,248,246,0.94)', textTransform: 'uppercase', marginBottom: 7 }}>GSYEN</div>
          <div style={{ fontFamily: 'monospace', fontSize: 8, letterSpacing: '0.3em', color: 'rgba(249,248,246,0.38)', textTransform: 'uppercase' }}>
            {zh ? '星瀚矢量工作坊' : 'SIRIUS VECTOR ATELIER'}
          </div>
        </div>

        <div style={{ height: 1, background: 'rgba(249,248,246,0.1)', marginBottom: 26 }} />

        {done ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'monospace', fontSize: 22, color: 'rgba(249,248,246,0.8)', marginBottom: 16 }}>✓</div>
            <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.18em', color: 'rgba(249,248,246,0.7)', textTransform: 'uppercase' }}>
              {zh ? '密码已更新' : 'PASSWORD UPDATED'}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(249,248,246,0.45)', marginBottom: 10 }}>
                {zh ? '设置新密码' : 'SET NEW PASSWORD'}
              </div>
            </div>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder={zh ? '新密码（至少 8 位）' : 'New password (min 8 chars)'} className="rp-inp"
              style={{ ...inp, marginBottom: 10 }} autoFocus />
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              placeholder={zh ? '确认新密码' : 'Confirm new password'} className="rp-inp"
              style={{ ...inp, marginBottom: 18 }} />
            {error && <div style={{ marginBottom: 14, fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.05em', color: '#C42B1C' }}>{error}</div>}
            <button type="submit" disabled={busy} style={{ width: '100%', padding: 12, background: busy ? 'rgba(249,248,246,0.5)' : 'rgba(249,248,246,0.93)', color: '#111111', fontFamily: 'monospace', fontSize: 9, fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', border: 'none', cursor: busy ? 'default' : 'pointer' }}>
              {busy ? '···' : (zh ? '确认修改 →' : 'CONFIRM →')}
            </button>
          </form>
        )}
      </motion.div>
    </motion.div>
  );
}
