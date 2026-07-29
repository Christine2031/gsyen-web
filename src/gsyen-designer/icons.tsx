/**
 * GSYEN Designer (gd) — Icon Library
 * strokeWidth=1.5, strokeLinecap=round, strokeLinejoin=round, fill=none
 */
import { Image as LucideImage } from 'lucide-react';

// ── Window Controls 11×11 ──────────────────────────────────────────────────
interface SmallIconProps { className?: string }

export const MinIcon = ({ className }: SmallIconProps = {}) => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className={className}>
    <line x1="2" y1="5.5" x2="9" y2="5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

export const MaxIcon = ({ className }: SmallIconProps = {}) => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className={className}>
    <rect x="1" y="1" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
  </svg>
);

export const CloseIcon = ({ className }: SmallIconProps = {}) => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className={className}>
    <line x1="2" y1="2" x2="9" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="9" y1="2" x2="2" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

// 已最大化时显示：重叠双方块（前方块完整 + 后方块只露右上角 L）= Windows 标准「还原」
export const RestoreIcon = ({ className }: SmallIconProps = {}) => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className={className}>
    <rect x="1" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    <path d="M3 3V2.5A1.5 1.5 0 0 1 4.5 1H8.5A1.5 1.5 0 0 1 10 2.5V6.5A1.5 1.5 0 0 1 8.5 8H8"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// ── Sidebar 16×12 ──────────────────────────────────────────────────────────
export const SidebarIcon = ({ className }: SmallIconProps = {}) => (
  <svg width="16" height="12" viewBox="0 0 16 12" fill="none" className={className}>
    <rect x="0.75" y="0.75" width="14.5" height="10.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    <line x1="5.25" y1="0.75" x2="5.25" y2="11.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

// ── Preview Triangle 15×17 ─────────────────────────────────────────────────
export const PreviewIcon = ({ className }: SmallIconProps = {}) => (
  <svg width="15" height="17" viewBox="0 0 15 17" fill="none" className={className}>
    <path d="M2 1.5L12.5 7.5Q14 8.5 12.5 9.5L2 15.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>
  </svg>
);

// ── Chevron 8×5 ───────────────────────────────────────────────────────────
export const ChevronIcon = ({ className }: SmallIconProps = {}) => (
  <svg width="8" height="5" viewBox="0 0 8 5" fill="none" className={className}>
    <path d="M1 1L4 4L7 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// ── Kanban Board 14×14  (Trello-style) ────────────────────────────────────
export const KanbanIcon = ({ className }: SmallIconProps = {}) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={className}>
    <rect x="1" y="1" width="4.75" height="12" rx="1.25" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    <rect x="8.25" y="1" width="4.75" height="7.5" rx="1.25" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
  </svg>
);

// ── Doc / Draw / Node  13×13 ──────────────────────────────────────────────
export const DocIcon = ({ className }: SmallIconProps = {}) => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className={className}>
    <rect x="1" y="1" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    <line x1="3.5" y1="4"   x2="9.5" y2="4"   stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="3.5" y1="6.5" x2="9.5" y2="6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="3.5" y1="9"   x2="7.5" y2="9"   stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

export const DrawIcon = ({ className }: SmallIconProps = {}) => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className={className}>
    <path d="M2 10.5L4 6L8 8L10.5 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="10.5" cy="2.5" r="1.2" stroke="currentColor" strokeWidth="1.5"/>
  </svg>
);

export const NodeIcon = ({ className }: SmallIconProps = {}) => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className={className}>
    <rect x="1" y="1" width="4" height="3" rx="1" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    <rect x="8" y="1" width="4" height="3" rx="1" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    <rect x="4" y="9" width="5" height="3" rx="1" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    <line x1="3"   y1="4" x2="6.5" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="1.5 1.5"/>
    <line x1="10"  y1="4" x2="6.5" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="1.5 1.5"/>
  </svg>
);

export const ImageIcon = ({ className }: SmallIconProps = {}) => (
  <LucideImage size={13} strokeWidth={1.5} className={`gsyen-icon${className ? ` ${className}` : ''}`} />
);
