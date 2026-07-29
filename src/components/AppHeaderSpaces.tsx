import type { ComponentType } from 'react';
import { KanbanIcon, MailIcon, MuseIcon } from '../gsyen-designer';

interface GsIconProps { className?: string; strokeWidth?: number }

export function KanbanOutlineIcon({ className, strokeWidth = 1.5 }: GsIconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="7" height="18" rx="1.5" />
      <rect x="13" y="3" width="7" height="11" rx="1.5" />
    </svg>
  );
}

function ReportMoneyIcon({ className, strokeWidth = 1.5 }: GsIconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2" />
      <path d="M9 5a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2" />
      <path d="M14 11h-2.5a1.5 1.5 0 0 0 0 3h1a1.5 1.5 0 0 1 0 3h-2.5" />
      <path d="M12 17v1m0 -8v1" />
    </svg>
  );
}

function ShieldLockIcon({ className, strokeWidth = 1.5 }: GsIconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3" />
      <path d="M11 11a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
      <path d="M12 12l0 2.5" />
    </svg>
  );
}

function PrismIcon({ className, strokeWidth = 1.5 }: GsIconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12,2 5.45,20 18.55,20" />
    </svg>
  );
}

function CalendarDateIcon({ className, strokeWidth = 1.5 }: GsIconProps) {
  const day = new Date().getDate();
  return (
    <svg viewBox="0 0 24 24" className={className}
      style={{ fill: 'none', stroke: 'currentColor', strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <text x="12" y="20" textAnchor="middle" fontSize="9.5" fontWeight="700"
        fill="currentColor" stroke="none" style={{ fontFamily: 'system-ui,sans-serif', fontVariantNumeric: 'tabular-nums' }}>
        {day}
      </text>
    </svg>
  );
}

function MailBrandIcon({ className, strokeWidth = 1.14 }: GsIconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.35" y="5.45" width="17.3" height="13.1" rx="2.05" />
      <path d="M4.6 8.05l6.35 4.1a2.05 2.05 0 0 0 2.1 0l6.35-4.1" />
    </svg>
  );
}

function FlowBrandIcon({ className, strokeWidth = 1.14 }: GsIconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4.35" y="3.15" width="6.35" height="17.7" rx="1.6" />
      <rect x="13.3" y="3.15" width="6.35" height="10.9" rx="1.6" />
    </svg>
  );
}

function CalendarBrandIcon({ className, strokeWidth = 1.14 }: GsIconProps) {
  const day = new Date().getDate();
  return (
    <svg viewBox="0 0 24 24" className={className}
      style={{ fill: 'none', stroke: 'currentColor', strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
      <rect x="3.3" y="4.5" width="17.4" height="17" rx="2.05" />
      <path d="M3.3 10h17.4" />
      <path d="M8.1 2.6v3.6" />
      <path d="M15.9 2.6v3.6" />
      <text x="12" y="19.4" textAnchor="middle" fontSize="9.1" fontWeight="720"
        fill="currentColor" stroke="none" style={{ fontFamily: 'system-ui,sans-serif', fontVariantNumeric: 'tabular-nums' }}>
        {day}
      </text>
    </svg>
  );
}

function LedgerBrandIcon({ className, strokeWidth = 1.14 }: GsIconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4.3" y="3.3" width="15.4" height="17.4" rx="2.05" />
      <path d="M8.25 3.3v17.4" />
      <path d="M15.2 8.4h-1.75a1.45 1.45 0 0 0 0 2.9h.9a1.45 1.45 0 0 1 0 2.9H12.3" />
      <path d="M13.8 7.55v7.5" />
    </svg>
  );
}

function CitadelBrandIcon({ className, strokeWidth = 1.14 }: GsIconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.4c2.65 1.9 5.15 2.5 7.55 3.1v5.3c0 4.8-2.75 7.7-7.55 9.6c-4.8-1.9-7.55-4.8-7.55-9.6V6.5c2.4-.6 4.9-1.2 7.55-3.1z" />
      <circle cx="12" cy="11.6" r="1" />
      <path d="M12 12.7v2.5" />
    </svg>
  );
}

function PrismBrandIcon({ className, strokeWidth = 1.14 }: GsIconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.35L6.35 19.7h11.3L12 3.35z" />
      <path d="M12 6.25l-1.65 13.45" />
    </svg>
  );
}

export type ActiveSpace = 'chat' | 'mail' | 'schedule' | 'calendar' | 'finance' | 'password' | 'brand';

export interface SpaceTab {
  value: ActiveSpace;
  Icon: ComponentType<any>;
  BrandIcon?: ComponentType<GsIconProps>;
  iconClass: string;
  zh: string;
  en: string;
  shortZh: string;
  shortEn: string;
  subtitle: string;
}

export const SPACES: SpaceTab[] = [
  { value: 'chat', Icon: MuseIcon, iconClass: 'animate-pulse', zh: '疆域灵阁', en: 'GSYEN Muse', shortZh: '灵阁', shortEn: 'Muse', subtitle: '' },
  { value: 'mail', Icon: MailIcon, BrandIcon: MailBrandIcon, iconClass: 'scale-90', zh: '工作邮件', en: 'Mailbox', shortZh: '邮件', shortEn: 'Mail', subtitle: 'Hermes · 极雅私密邮件信道' },
  { value: 'schedule', Icon: KanbanIcon, BrandIcon: FlowBrandIcon, iconClass: 'animate-pulse scale-[1.3]', zh: '项目看板', en: 'Kanban', shortZh: '看板', shortEn: 'Kanban', subtitle: 'Flow · 信息流转看板工作系统' },
  { value: 'calendar', Icon: CalendarDateIcon, BrandIcon: CalendarBrandIcon, iconClass: 'scale-90', zh: '日程日历', en: 'Calendar', shortZh: '日历', shortEn: 'Cal', subtitle: 'Chronos · 极速格栅日程空间' },
  { value: 'finance', Icon: ReportMoneyIcon, BrandIcon: LedgerBrandIcon, iconClass: '', zh: '复试账簿', en: 'Atelier Ledger', shortZh: '账簿', shortEn: 'Ledger', subtitle: 'Atelier Ledger · 奢雅资产复式记账账簿' },
  { value: 'password', Icon: ShieldLockIcon, BrandIcon: CitadelBrandIcon, iconClass: '', zh: '军工密钥', en: 'Citadel Key', shortZh: '密钥', shortEn: 'Keys', subtitle: 'Citadel · 军事级密匙生成与保管箱' },
  { value: 'brand', Icon: PrismIcon, BrandIcon: PrismBrandIcon, iconClass: '', zh: 'PRISM', en: 'Brand Lab', shortZh: '品牌', shortEn: 'Brand', subtitle: 'Prism · 品牌基因折射实验室' },
];
