import type { ReactNode, SVGProps } from 'react';
import { Plus, Send, Sparkles, Trash2, type LucideIcon } from 'lucide-react';

export type GsyenIconProps = Omit<SVGProps<SVGSVGElement>,
  'children' | 'fill' | 'height' | 'stroke' | 'strokeLinecap' | 'strokeLinejoin' | 'strokeWidth' | 'viewBox' | 'width'>;

function IconFrame({ children, className, ...props }: GsyenIconProps & { children: ReactNode }) {
  return <svg {...props} width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor"
    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
    className={`gsyen-icon${className ? ` ${className}` : ''}`}>{children}</svg>;
}

function LucideFrame({ icon: Icon, className, ...props }: GsyenIconProps & { icon: LucideIcon }) {
  return <Icon {...props} strokeWidth={1.5} className={`gsyen-icon${className ? ` ${className}` : ''}`} />;
}

export function MuseIcon(props: GsyenIconProps) {
  return <LucideFrame icon={Sparkles} {...props} />;
}

export function PlusIcon(props: GsyenIconProps) {
  return <LucideFrame icon={Plus} {...props} />;
}

export function AttachmentIcon(props: GsyenIconProps) {
  return <IconFrame {...props}>
    <path d="M1.5 1.5h5.8l2.1 2.1v4.1" />
    <path d="M7.3 1.5v2.2h2.1" />
    <path d="M10.25 8v4M8.25 10h4" />
  </IconFrame>;
}

export function SendIcon(props: GsyenIconProps) {
  return <LucideFrame icon={Send} {...props} />;
}

export function TrashIcon(props: GsyenIconProps) {
  return <LucideFrame icon={Trash2} {...props} />;
}

export function ArchiveIcon(props: GsyenIconProps) {
  return <IconFrame {...props}>
    <path d="M1.5 4h10v7.5H1.5zM1 1.5h11v2.5H1z" />
    <path d="M5 7h3" />
  </IconFrame>;
}

export function MessageIcon(props: GsyenIconProps) {
  return <IconFrame {...props}><path d="M1.5 2.25h10v7H6.25L3.5 11v-1.75h-2z" /></IconFrame>;
}

export function UserIcon(props: GsyenIconProps) {
  return <IconFrame {...props}><circle cx="6.5" cy="4" r="2.25" /><path d="M2 11.25c.45-2.2 2.05-3.5 4.5-3.5s4.05 1.3 4.5 3.5" /></IconFrame>;
}

export function UsersIcon(props: GsyenIconProps) {
  return <IconFrame {...props}>
    <circle cx="5" cy="4" r="2" /><path d="M1.5 11c.4-2 1.65-3.2 3.5-3.2S8.1 9 8.5 11" />
    <path d="M9 2.35a2 2 0 010 3.3M9 7.9c1.4.25 2.25 1.25 2.5 3.1" />
  </IconFrame>;
}

export function GlobeIcon(props: GsyenIconProps) {
  return <IconFrame {...props}>
    <circle cx="6.5" cy="6.5" r="5" /><path d="M1.75 6.5h9.5M6.5 1.5c1.3 1.35 2 3.02 2 5s-.7 3.65-2 5c-1.3-1.35-2-3.02-2-5s.7-3.65 2-5z" />
  </IconFrame>;
}

export function MailIcon(props: GsyenIconProps) {
  return <IconFrame {...props}><rect x="1.5" y="2.5" width="10" height="8" rx="1.5" /><path d="M2.3 4.2l3.2 2.2a1.7 1.7 0 002 0l3.2-2.2" /></IconFrame>;
}

export function RefreshIcon(props: GsyenIconProps) {
  return <IconFrame {...props}><path d="M10.75 5A4.5 4.5 0 002.7 3.75L1.5 5M1.5 2v3h3M2.25 8A4.5 4.5 0 0010.3 9.25L11.5 8M11.5 11v-3h-3" /></IconFrame>;
}

export function CopyIcon(props: GsyenIconProps) {
  return <IconFrame {...props}><rect x="4.25" y="1.5" width="7.25" height="8.5" rx="1.25" /><path d="M8.75 10v1.25c0 .7-.55 1.25-1.25 1.25H2.75c-.7 0-1.25-.55-1.25-1.25v-5C1.5 5.55 2.05 5 2.75 5H4.25" /></IconFrame>;
}

export function CheckIcon(props: GsyenIconProps) {
  return <IconFrame {...props}><path d="M2 6.75l2.8 2.8L11 3.45" /></IconFrame>;
}

export function DownloadIcon(props: GsyenIconProps) {
  return <IconFrame {...props}><path d="M6.5 1.5v6.4M4 5.4l2.5 2.5L9 5.4M2 10.5h9v1H2z" /></IconFrame>;
}

export function SpreadsheetIcon(props: GsyenIconProps) {
  return <IconFrame {...props}>
    <rect x="1.25" y="1.25" width="10.5" height="10.5" rx="1.5" />
    <path d="M4.75 1.5v10M1.5 4.75h10M7.9 7.25H10M7.9 9.5H10" />
  </IconFrame>;
}
