import { useState } from 'react';
import { useAuth } from '../../auth/useAuth';
import { supabase } from '../../auth/supabaseClient';
import { useFontSize } from '../../hooks/useFontSize';

const PROVIDER_LABEL: Record<string, string> = {
  google: 'Google',
  email: 'Email / Password',
  github: 'GitHub',
};

interface Props { lang: 'zh' | 'en' }

export default function BrandMemberProfile({ lang }: Props) {
  const zh = lang === 'zh';
  const { user, tier, emailVerified } = useAuth();

  const [sent, setSent]         = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  const meta = user?.user_metadata ?? {};
  const [firstName, setFirstName] = useState<string>(meta.first_name ?? '');
  const [lastName,  setLastName]  = useState<string>(meta.last_name  ?? '');
  const [username,  setUsername]  = useState<string>(meta.username   ?? '');
  const [phone,        setPhone]       = useState<string>(meta.phone         ?? '');
  const [phoneCountry, setPhoneCountry] = useState<string>(meta.phone_country ?? '+86');

  const { size: fontSize, setSize: setFontSize } = useFontSize();
  const isUnverified = tier === 'free_unverified' || (!emailVerified && !!user);
  const provider = user?.app_metadata?.provider ?? meta.provider ?? 'email';

  const handleResend = async () => {
    if (!user?.email || sending || cooldown > 0) return;
    setSending(true);
    const { error } = await supabase!.auth.signInWithOtp({ email: user.email, options: { shouldCreateUser: false } });
    if (error) { console.error('[OTP]', error.message); setSending(false); return; }
    setSending(false); setSent(true);
    let t = 60; setCooldown(t);
    const iv = setInterval(() => {
      t -= 1; setCooldown(t);
      if (t <= 0) { clearInterval(iv); setCooldown(0); }
    }, 1000);
  };

  const handleSave = async () => {
    setSaving(true);
    await supabase.auth.updateUser({ data: { first_name: firstName, last_name: lastName, username, phone, phone_country: phoneCountry } });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const INP = 'w-full px-3 py-2 border border-[#DADCE0] text-[13px] font-sans text-[#202124] placeholder:text-[#BDC1C6] outline-none focus:border-[#1A6ECC] transition-colors rounded-sm bg-white';

  return (
    <div>
      {/* 页面标题 — iA Writer shell 风格 */}
      <div className="mb-7">
        <p className="text-[10px] font-mono font-bold tracking-[0.28em] uppercase text-[#1A1A1A]">
          {zh ? '账户信息' : 'Account'}
        </p>
        <p className="text-[9px] font-mono text-[#1A1A1A]/38 mt-1 tracking-wide">
          {zh ? '管理您的账户资料与连接方式' : 'Manage your account profile and connections'}
        </p>
      </div>

      {/* 邮箱验证条 */}
      {isUnverified && (
        <div className="flex items-center justify-between border border-[#1A1A1A]/10 bg-[#F4F2EE] px-5 py-3.5 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
            <div>
              <p className="text-[10px] font-mono font-bold text-[#1A1A1A]">
                {zh ? '邮箱未验证' : 'Email not verified'}
              </p>
              <p className="text-[9px] font-mono text-[#1A1A1A]/40 mt-0.5">
                {sent
                  ? zh
                    ? `验证邮件已发送，请查看收件箱${cooldown > 0 ? ` · ${cooldown}s 后可重发` : ''}`
                    : `Verification email sent — check your inbox${cooldown > 0 ? ` · resend in ${cooldown}s` : ''}`
                  : zh ? '完成验证后解锁完整功能权限' : 'Verify to unlock full access'}
              </p>
            </div>
          </div>
          {!sent
            ? <button onClick={handleResend} disabled={sending}
                className="px-3 py-1.5 text-[10px] font-mono font-bold tracking-widest uppercase border border-[#1A6ECC]/50 text-[#1A6ECC] hover:bg-[#1A6ECC] hover:text-[#F9F8F6] transition-all rounded-none shrink-0">
                {sending ? '···' : zh ? '发送验证邮件 →' : 'Send verification →'}
              </button>
            : <span className="text-[9px] font-mono font-bold text-[#1A6ECC] shrink-0">✓ {zh ? '已发送' : 'Sent'}</span>
          }
        </div>
      )}

      {/* Profile information — Google content 风格 */}
      <p className="text-[8px] font-mono font-bold tracking-[0.28em] uppercase text-[#1A1A1A]/30 mb-3">
        {zh ? '基本信息' : 'Profile information'}
      </p>
      <div className="bg-white border border-[#DADCE0] mb-6">
        {zh ? (
          <>
            <FormRow label="姓" sub="Last name" last={false}>
              <input className={INP} value={lastName} onChange={e => setLastName(e.target.value)} placeholder="姓" />
            </FormRow>
            <FormRow label="名" sub="First name" last={false}>
              <input className={INP} value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="名" />
            </FormRow>
          </>
        ) : (
          <>
            <FormRow label="First name" last={false}>
              <input className={INP} value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" />
            </FormRow>
            <FormRow label="Last name" last={false}>
              <input className={INP} value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" />
            </FormRow>
          </>
        )}
        <FormRow label={zh ? '主邮箱' : 'Primary email'} sub={zh ? '用于账户通知与登录' : 'Used for account notifications'} last={false}>
          <div className="flex items-center gap-2 px-3 py-2 border border-[#DADCE0] bg-[#F8F9FA] text-[13px] font-sans text-[#5F6368] rounded-sm">
            {user?.email ?? '—'}
            <span className={`ml-auto text-[7px] font-mono font-bold tracking-widest uppercase px-1.5 py-0.5 rounded-none ${!isUnverified ? 'text-[#137333] bg-[#E6F4EA]' : 'text-[#B05E00] bg-[#FEF7E0]'}`}>
              {!isUnverified ? (zh ? '已验证' : 'Verified') : (zh ? '未验证' : 'Unverified')}
            </span>
          </div>
        </FormRow>
        <FormRow label={zh ? '手机号' : 'Phone'} sub={zh ? '用于账户安全验证' : 'Used for account security'} last={false}>
          <div className="flex gap-2">
            <select
              value={phoneCountry} onChange={e => setPhoneCountry(e.target.value)}
              className="px-2 py-2 border border-[#DADCE0] text-[12px] font-sans text-[#202124] outline-none focus:border-[#1A6ECC] transition-colors rounded-sm bg-white shrink-0 cursor-pointer"
            >
              <option value="+86">{zh ? '🇨🇳 中国 +86'       : '🇨🇳 China +86'}</option>
              <option value="+1"> {zh ? '🇺🇸 美国 +1'        : '🇺🇸 USA +1'}</option>
              <option value="+852">{zh ? '🇭🇰 香港 +852'     : '🇭🇰 HK +852'}</option>
              <option value="+853">{zh ? '🇲🇴 澳门 +853'     : '🇲🇴 Macao +853'}</option>
              <option value="+886">{zh ? '🇨🇳 台湾省 +886'   : '🇨🇳 Taiwan +886'}</option>
              <option value="+64"> {zh ? '🇳🇿 新西兰 +64'    : '🇳🇿 NZ +64'}</option>
            </select>
            <input className={INP} value={phone} onChange={e => setPhone(e.target.value)} placeholder={zh ? '手机号码' : 'Phone number'} />
          </div>
        </FormRow>
        <FormRow label={zh ? '用户名' : 'Username'} sub={zh ? '在工作坊中的显示名称' : 'Display name across the workspace'} last>
          <input className={INP} value={username} onChange={e => setUsername(e.target.value)} placeholder={zh ? '留空则显示邮箱前缀' : 'Leave blank to use email prefix'} />
        </FormRow>
        <div className="flex justify-end px-6 py-3 border-t border-[#DADCE0]">
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-1.5 text-[10px] font-mono font-bold tracking-widest uppercase bg-[#1A1A1A] text-[#F9F8F6] hover:bg-[#1A1A1A]/80 transition-colors rounded-none disabled:opacity-40">
            {saved ? `✓ ${zh ? '已保存' : 'Saved'}` : saving ? '···' : zh ? '保存' : 'Save'}
          </button>
        </div>
      </div>

      {/* Account identities */}
      <p className="text-[8px] font-mono font-bold tracking-[0.28em] uppercase text-[#1A1A1A]/30 mb-3">
        {zh ? '账号身份' : 'Account identities'}
      </p>
      <div className="bg-white border border-[#DADCE0] mb-6">
        <FormRow label={PROVIDER_LABEL[provider] ?? provider} sub={zh ? '当前登录方式' : 'Connected login method'} last>
          <div className="flex items-center gap-2">
            <span className="text-[8px] font-mono px-2 py-0.5 border border-[#DADCE0] text-[#5F6368] uppercase tracking-widest rounded-sm">
              {PROVIDER_LABEL[provider] ?? provider}
            </span>
            <span className="text-[13px] font-sans text-[#5F6368]">{user?.email ?? '—'}</span>
          </div>
        </FormRow>
      </div>

      {/* Display preferences */}
      <p className="text-[8px] font-mono font-bold tracking-[0.28em] uppercase text-[#1A1A1A]/30 mb-3">
        {zh ? '界面偏好' : 'Display preferences'}
      </p>
      <div className="bg-white border border-[#DADCE0]">
        <FormRow label={zh ? '界面字体' : 'Font size'} sub={zh ? '影响全局字号，立即生效' : 'Applies globally, takes effect immediately'} last>
          <div className="flex items-center gap-1 border border-[#1A1A1A]/10 p-1 bg-[#F9F8F6]/40 w-fit">
            {(['compact', 'normal', 'large'] as const).map(v => (
              <button
                key={v}
                onClick={() => setFontSize(v)}
                className={`px-3.5 py-1.5 text-[10px] font-mono font-bold uppercase tracking-widest rounded-none transition-colors ${
                  fontSize === v ? 'bg-[#1A1A1A] text-white' : 'text-[#1A1A1A]/60 hover:bg-[#1A1A1A]/5'
                }`}
              >
                {zh
                  ? v === 'compact' ? '紧凑' : v === 'normal' ? '正常' : '近视'
                  : v === 'compact' ? 'Compact' : v === 'normal' ? 'Normal' : 'Large'}
              </button>
            ))}
          </div>
        </FormRow>
      </div>
    </div>
  );
}

function FormRow({ label, sub, children, last }: { label: string; sub?: string; children: React.ReactNode; last: boolean }) {
  return (
    <div className={`flex items-center gap-8 px-6 py-4 ${!last ? 'border-b border-[#DADCE0]' : ''}`}>
      <div className="w-48 shrink-0">
        <p className="text-[13px] font-sans font-medium text-[#202124]">{label}</p>
        {sub && <p className="text-[11px] font-sans text-[#5F6368] mt-0.5">{sub}</p>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
