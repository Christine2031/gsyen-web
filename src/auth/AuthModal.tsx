import { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { useAuth } from './useAuth';
import { RegisterCTABadge } from './RegisterCTABadge';

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
  const [mode, setMode]         = useState<'auth' | 'forgot' | 'forgot-sent'>('auth');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [error, setError]       = useState('');
  const [verifyMsg, setVerifyMsg] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy]         = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  const { signInWithOAuth, signInWithEmail, signUpWithEmail, resetPasswordForEmail } = useAuth();

  useEffect(() => { emailRef.current?.focus(); }, [tab, mode]);
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  const reset = () => { setError(''); setVerifyMsg(''); setNotFound(false); };
  const switchToRegister = () => { reset(); setTab('register'); setMode('auth'); };

  const handleGoogle = async () => {
    reset(); setBusy(true);
    const { error: err } = await signInWithOAuth('google');
    if (err) setError(err.message);
    setBusy(false);
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault(); reset();
    if (!email || !password) { setError(lang === 'zh' ? '请填写邮箱和密码' : 'Email and password required'); return; }
    if (tab === 'register' && password !== confirm) { setError(lang === 'zh' ? '两次密码不一致' : 'Passwords do not match'); return; }
    setBusy(true);
    if (tab === 'login') {
      const { error: err } = await signInWithEmail(email, password);
      if (err) {
        const msg = err.message?.toLowerCase() ?? '';
        if (msg.includes('invalid login') || msg.includes('invalid credentials') || msg.includes('user not found') || msg.includes('no user found')) {
          setNotFound(true);
        } else if (msg.includes('email not confirmed') || msg.includes('email_not_confirmed')) {
          setError(zh ? `账号和密码正确，但邮箱尚未验证。请检查 ${email} 的收件箱，点击验证链接后再登录` : `Credentials correct, but email not verified. Check ${email} for the verification link.`);
        } else { setError(err.message); }
      } else { onClose(); }
    } else {
      const { error: err } = await signUpWithEmail(email, password);
      if (err) setError(err.message);
      else { setVerifyMsg(zh ? `注册成功！请检查 ${email} 的收件箱，点击验证链接完成验证后即可登录` : `Account created! Check ${email} for the verification link.`); }
    }
    setBusy(false);
  };

  const handleForgot = async (ev: React.FormEvent) => {
    ev.preventDefault(); reset();
    if (!email) { setError(lang === 'zh' ? '请填写邮箱地址' : 'Email required'); return; }
    setBusy(true);
    const { error: err } = await resetPasswordForEmail(email);
    if (err) setError(err.message);
    else setMode('forgot-sent');
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
          backdropFilter: 'blur(1px)', WebkitBackdropFilter: 'blur(1px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <motion.div
          key="card"
          variants={{
            hidden:  { opacity: 0, y: 28, scale: 0.96 },
            visible: { opacity: 1, y: 0,  scale: 1,    transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as any } },
            exit:    { opacity: 0, y: 18, scale: 0.97, transition: { duration: 0.75, ease: [0.4, 0, 0.6, 1] as any } },
          }}
          initial="hidden" animate="visible" exit="exit"
          onClick={e => e.stopPropagation()}
          style={{ width: 380, background: '#111111', border: '1px solid rgba(249,248,246,0.16)', padding: '42px 38px 34px' }}
        >
          <style>{`.gd-ad-inp::placeholder{color:rgba(249,248,246,0.38)}`}</style>

          {/* Brand */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontFamily: CINZEL, fontSize: 11, fontWeight: 700, letterSpacing: '0.4em', color: 'rgba(249,248,246,0.94)', textTransform: 'uppercase', marginBottom: 7 }}>GSYEN</div>
            <div style={{ fontFamily: 'monospace', fontSize: 8, letterSpacing: '0.3em', color: 'rgba(249,248,246,0.38)', textTransform: 'uppercase' }}>
              {zh ? '星瀚矢量工作坊' : 'SIRIUS VECTOR ATELIER'}
            </div>
          </div>

          <div style={{ height: 1, background: 'rgba(249,248,246,0.1)', marginBottom: 26 }} />

          {/* ── 忘记密码模式 ── */}
          {mode === 'forgot' && (
            <form onSubmit={handleForgot}>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(249,248,246,0.45)', marginBottom: 10 }}>
                  {zh ? '重置密码' : 'RESET PASSWORD'}
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.04em', color: 'rgba(249,248,246,0.5)', lineHeight: 1.6 }}>
                  {zh ? '输入账户邮箱，我们将发送重置链接' : 'Enter your email to receive a reset link'}
                </div>
              </div>
              <input ref={emailRef} type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder={zh ? '邮箱地址' : 'Email address'} className="gd-ad-inp"
                style={{ ...inp, marginBottom: 16 }} />
              {error && <div style={{ marginBottom: 14, fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.05em', color: '#C42B1C' }}>{error}</div>}
              <button type="submit" disabled={busy} style={{ width: '100%', padding: 12, background: busy ? 'rgba(249,248,246,0.5)' : 'rgba(249,248,246,0.93)', color: '#111111', fontFamily: 'monospace', fontSize: 9, fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', border: 'none', cursor: busy ? 'default' : 'pointer', marginBottom: 14 }}>
                {busy ? '···' : (zh ? '发送重置邮件 →' : 'SEND RESET EMAIL →')}
              </button>
              <div style={{ textAlign: 'center' }}>
                <span onClick={() => { reset(); setMode('auth'); }} style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.2em', color: 'rgba(249,248,246,0.35)', textTransform: 'uppercase', cursor: 'pointer' }}>
                  ← {zh ? '返回登录' : 'BACK TO LOGIN'}
                </span>
              </div>
            </form>
          )}

          {/* ── 已发送 ── */}
          {mode === 'forgot-sent' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'monospace', fontSize: 22, color: 'rgba(249,248,246,0.8)', marginBottom: 16 }}>✓</div>
              <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.18em', color: 'rgba(249,248,246,0.7)', textTransform: 'uppercase', marginBottom: 10 }}>
                {zh ? '重置邮件已发送' : 'RESET EMAIL SENT'}
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(249,248,246,0.38)', lineHeight: 1.7, marginBottom: 22 }}>
                {zh ? `请检查 ${email} 的收件箱，点击邮件中的链接设置新密码。` : `Check ${email} for the reset link.`}
              </div>
              <span onClick={onClose} style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.2em', color: 'rgba(249,248,246,0.3)', textTransform: 'uppercase', cursor: 'pointer' }}>
                ESC {zh ? '关闭' : 'CLOSE'}
              </span>
            </div>
          )}

          {/* ── 正常登录/注册模式 ── */}
          {mode === 'auth' && (
            <>
              <div style={{ display: 'flex', border: '1px solid rgba(249,248,246,0.15)', marginBottom: 26 }}>
                {(['login', 'register'] as const).map(t => (
                  <button key={t} onClick={() => { setTab(t); reset(); }}
                    style={{ flex: 1, padding: '9px 0', fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'background 0.22s, color 0.22s', background: tab === t ? 'rgba(249,248,246,0.93)' : 'rgba(249,248,246,0.07)', color: tab === t ? '#111111' : 'rgba(249,248,246,0.42)' }}>
                    {t === 'login' ? (zh ? '登录' : 'LOGIN') : (zh ? '注册' : 'REGISTER')}
                  </button>
                ))}
              </div>

              <button onClick={handleGoogle} disabled={busy} style={{ width: '100%', padding: '11px', border: '1px solid rgba(249,248,246,0.22)', background: 'transparent', color: 'rgba(249,248,246,0.72)', fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, cursor: 'pointer', marginBottom: 18 }}>
                <GoogleIcon />
                {zh ? '使用 Google 继续' : 'CONTINUE WITH GOOGLE'}
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                <div style={{ flex: 1, height: 1, background: 'rgba(249,248,246,0.11)' }} />
                <span style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.22em', color: 'rgba(249,248,246,0.3)', textTransform: 'uppercase' }}>or</span>
                <div style={{ flex: 1, height: 1, background: 'rgba(249,248,246,0.11)' }} />
              </div>

              <form onSubmit={handleSubmit}>
                <input ref={emailRef} type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder={zh ? '邮箱地址' : 'Email address'} className="gd-ad-inp"
                  style={{ ...inp, marginBottom: 10 }} />
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder={zh ? '密码' : 'Password'} className="gd-ad-inp"
                  style={{ ...inp, marginBottom: tab === 'register' ? 10 : 6 }} />

                {tab === 'login' && (
                  <div style={{ textAlign: 'right', marginBottom: 16 }}>
                    <span onClick={() => { reset(); setMode('forgot'); }} style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.15em', color: 'rgba(249,248,246,0.3)', textTransform: 'uppercase', cursor: 'pointer' }}>
                      {zh ? '忘记密码？' : 'FORGOT PASSWORD?'}
                    </span>
                  </div>
                )}

                {tab === 'register' && (
                  <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                    placeholder={zh ? '确认密码' : 'Confirm password'} className="gd-ad-inp"
                    style={{ ...inp, marginBottom: 22 }} />
                )}

                {notFound && (
                  <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.06em', color: 'rgba(249,248,246,0.38)' }}>邮箱或密码有误</span>
                    <RegisterCTABadge onClick={switchToRegister} />
                  </div>
                )}
                {error && <div style={{ marginBottom: 14, fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.05em', color: '#C42B1C', lineHeight: 1.6 }}>{error}</div>}
                {verifyMsg && <div style={{ marginBottom: 14, fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.05em', color: 'rgba(249,248,246,0.62)', lineHeight: 1.6 }}>{verifyMsg}</div>}

                <button type="submit" disabled={busy} style={{ width: '100%', padding: 12, background: busy ? 'rgba(249,248,246,0.5)' : 'rgba(249,248,246,0.93)', color: '#111111', fontFamily: 'monospace', fontSize: 9, fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', border: 'none', cursor: busy ? 'default' : 'pointer', transition: 'background 0.22s' }}>
                  {busy ? '···' : tab === 'login' ? (zh ? '进入工作坊 →' : 'ENTER ATELIER →') : (zh ? '创建账号 →' : 'CREATE ACCOUNT →')}
                </button>
              </form>
            </>
          )}

          {mode === 'auth' && (
            <div style={{ textAlign: 'center', marginTop: 18 }}>
              <span onClick={onClose} style={{ fontFamily: 'monospace', fontSize: 8, letterSpacing: '0.22em', color: 'rgba(249,248,246,0.28)', textTransform: 'uppercase', cursor: 'pointer' }}>
                ESC {zh ? '关闭' : 'CLOSE'}
              </span>
            </div>
          )}
        </motion.div>
      </motion.div>
    </>
  );
}
