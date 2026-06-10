import { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { useAuth } from './useAuth';

interface Props {
  lang: 'zh' | 'en';
  initialTab?: 'login' | 'register';
  onClose: () => void;
}

const CINZEL = "'Cinzel', Georgia, 'Times New Roman', serif";

const GoogleIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

export default function AuthModal({ lang, initialTab = 'login', onClose }: Props) {
  const [tab, setTab]           = useState<'login' | 'register'>(initialTab);
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [error, setError]       = useState('');
  const [info, setInfo]         = useState('');
  const [busy, setBusy]         = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  const { signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();

  useEffect(() => { emailRef.current?.focus(); }, [tab]);
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  const reset = () => { setError(''); setInfo(''); };

  const handleGoogle = async () => {
    reset(); setBusy(true);
    const { error: e } = await signInWithGoogle();
    if (e) setError(e.message);
    setBusy(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); reset();
    if (!email || !password) { setError(lang === 'zh' ? '请填写邮箱和密码' : 'Email and password required'); return; }
    if (tab === 'register' && password !== confirm) { setError(lang === 'zh' ? '两次密码不一致' : 'Passwords do not match'); return; }
    setBusy(true);
    if (tab === 'login') {
      const { error: e } = await signInWithEmail(email, password);
      if (e) setError(e.message); else onClose();
    } else {
      const { error: e } = await signUpWithEmail(email, password);
      if (e) setError(e.message);
      else { onClose(); }
    }
    setBusy(false);
  };

  const zh = lang === 'zh';

  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '11px 13px',
    background: 'rgba(249,248,246,0.05)',
    border: '1px solid rgba(249,248,246,0.2)',
    color: 'rgba(249,248,246,0.88)',
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: 12, letterSpacing: '0.04em', outline: 'none',
    transition: 'border-color 0.25s',
  };

  return (
    <>
      {/* ── Overlay ── */}
      <motion.div
        key="overlay"
        variants={{
          hidden:  { opacity: 0 },
          visible: { opacity: 1, transition: { duration: 0.55, ease: [0.4, 0, 0.2, 1] as any } },
          exit:    { opacity: 0, transition: { duration: 0.85, ease: [0.4, 0, 0.6, 1] as any } },
        }}
        initial="hidden" animate="visible" exit="exit"
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(4,4,4,0.05)',
          backdropFilter: 'blur(1px)',
          WebkitBackdropFilter: 'blur(1px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {/* ── Card ── */}
        <motion.div
          key="card"
          variants={{
            hidden:  { opacity: 0, y: 28, scale: 0.96 },
            visible: { opacity: 1, y: 0,  scale: 1,    transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as any } },
            exit:    { opacity: 0, y: 18, scale: 0.97, transition: { duration: 0.75, ease: [0.4, 0, 0.6, 1] as any } },
          }}
          initial="hidden" animate="visible" exit="exit"
          onClick={e => e.stopPropagation()}
          style={{
            width: 380, background: '#111111',
            border: '1px solid rgba(249,248,246,0.16)',
            padding: '42px 38px 34px',
          }}
        >
          {/* placeholder 亮度 — 只注入一次 */}
          <style>{`.gd-ad-inp::placeholder{color:rgba(249,248,246,0.38)}`}</style>

          {/* Brand */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{
              fontFamily: CINZEL, fontSize: 11, fontWeight: 700,
              letterSpacing: '0.4em', color: 'rgba(249,248,246,0.94)',
              textTransform: 'uppercase', marginBottom: 7,
            }}>GSYEN</div>
            <div style={{
              fontFamily: 'monospace', fontSize: 8, letterSpacing: '0.3em',
              color: 'rgba(249,248,246,0.38)', textTransform: 'uppercase',
            }}>
              {zh ? '星瀚矢量工作坊' : 'SIRIUS VECTOR ATELIER'}
            </div>
          </div>

          <div style={{ height: 1, background: 'rgba(249,248,246,0.1)', marginBottom: 26 }} />

          {/* Tabs */}
          <div style={{ display: 'flex', border: '1px solid rgba(249,248,246,0.15)', marginBottom: 26 }}>
            {(['login', 'register'] as const).map(t => (
              <button key={t} onClick={() => { setTab(t); reset(); }}
                style={{
                  flex: 1, padding: '9px 0', fontFamily: 'monospace',
                  fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase',
                  fontWeight: 700, border: 'none', cursor: 'pointer',
                  transition: 'background 0.22s, color 0.22s',
                  background: tab === t ? 'rgba(249,248,246,0.93)' : 'transparent',
                  color:      tab === t ? '#111111'                 : 'rgba(249,248,246,0.42)',
                }}>
                {t === 'login' ? (zh ? '登录' : 'LOGIN') : (zh ? '注册' : 'REGISTER')}
              </button>
            ))}
          </div>

          {/* Google */}
          <button onClick={handleGoogle} disabled={busy}
            style={{
              width: '100%', padding: '11px',
              border: '1px solid rgba(249,248,246,0.22)',
              background: 'transparent', color: 'rgba(249,248,246,0.72)',
              fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.2em',
              textTransform: 'uppercase', display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 9, cursor: 'pointer', marginBottom: 18,
              transition: 'border-color 0.22s, color 0.22s',
            }}>
            <GoogleIcon />
            {zh ? '使用 Google 继续' : 'CONTINUE WITH GOOGLE'}
          </button>

          {/* OR */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(249,248,246,0.11)' }} />
            <span style={{
              fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.22em',
              color: 'rgba(249,248,246,0.3)', textTransform: 'uppercase',
            }}>or</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(249,248,246,0.11)' }} />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <input ref={emailRef} type="email" value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder={zh ? '邮箱地址' : 'Email address'}
              className="gd-ad-inp"
              style={{ ...inp, marginBottom: 10 }} />
            <input type="password" value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={zh ? '密码' : 'Password'}
              className="gd-ad-inp"
              style={{ ...inp, marginBottom: tab === 'register' ? 10 : 22 }} />
            {tab === 'register' && (
              <input type="password" value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder={zh ? '确认密码' : 'Confirm password'}
                className="gd-ad-inp"
                style={{ ...inp, marginBottom: 22 }} />
            )}

            {error && (
              <div style={{ marginBottom: 14, fontFamily: 'monospace', fontSize: 10,
                letterSpacing: '0.05em', color: '#C42B1C' }}>{error}</div>
            )}
            {info && (
              <div style={{ marginBottom: 14, fontFamily: 'monospace', fontSize: 10,
                letterSpacing: '0.06em', color: 'rgba(249,248,246,0.55)' }}>{info}</div>
            )}

            <button type="submit" disabled={busy}
              style={{
                width: '100%', padding: 12,
                background: busy ? 'rgba(249,248,246,0.5)' : 'rgba(249,248,246,0.93)',
                color: '#111111', fontFamily: 'monospace', fontSize: 9, fontWeight: 700,
                letterSpacing: '0.3em', textTransform: 'uppercase',
                border: 'none', cursor: busy ? 'default' : 'pointer',
                transition: 'background 0.22s',
              }}>
              {busy ? '···' : tab === 'login'
                ? (zh ? '进入工作坊 →' : 'ENTER ATELIER →')
                : (zh ? '创建账号 →' : 'CREATE ACCOUNT →')}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: 18 }}>
            <span onClick={onClose}
              style={{
                fontFamily: 'monospace', fontSize: 8, letterSpacing: '0.22em',
                color: 'rgba(249,248,246,0.28)', textTransform: 'uppercase', cursor: 'pointer',
              }}>
              ESC {zh ? '关闭' : 'CLOSE'}
            </span>
          </div>
        </motion.div>
      </motion.div>
    </>
  );
}
