/**
 * CanvasFormatMenu — iA Writer 风格 Format 下拉菜单
 */
import { useEffect, useRef } from 'react';
import { ChevronRight } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onWrap: (b: string, a: string) => void;
  dark: boolean;
}

const MENU_BG   = (dark: boolean) => dark ? '#242424' : '#F5F5F5';
const MENU_FG   = (dark: boolean) => dark ? '#CCCCCC' : '#1A1A1A';
const MENU_DIM  = (dark: boolean) => dark ? '#666666' : '#999999';
const MENU_BDR  = (dark: boolean) => dark ? '#333333' : '#E0E0E0';
const MENU_HVR  = (dark: boolean) => dark ? '#333333' : '#E8E8E8';

const HEADINGS = [
  { label: 'Headings 1', shortcut: 'Ctrl+1', b: '# ',   a: '' },
  { label: 'Headings 2', shortcut: 'Ctrl+2', b: '## ',  a: '' },
  { label: 'Headings 3', shortcut: 'Ctrl+3', b: '### ', a: '' },
  { label: 'Headings 4', shortcut: 'Ctrl+4', b: '#### ', a: '' },
  { label: 'Headings 5', shortcut: 'Ctrl+5', b: '##### ', a: '' },
  { label: 'Headings 6', shortcut: 'Ctrl+6', b: '###### ', a: '' },
];

const ITEMS = [
  { label: 'List',       shortcut: '',       b: '- ',  a: '' },
  { label: 'Blockquote', shortcut: '',       b: '> ',  a: '' },
  { label: 'Body Text',  shortcut: '',       b: '',    a: '' },
];

const INLINE = [
  { label: 'Emphasis', shortcut: 'Ctrl+I', b: '*',  a: '*'  },
  { label: 'Strong',   shortcut: 'Ctrl+B', b: '**', a: '**' },
  { label: 'Code',     shortcut: '',       b: '`',  a: '`'  },
];

export function CanvasFormatMenu({ open, onClose, onWrap, dark }: Props) {
  const ref    = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const bg  = MENU_BG(dark);
  const fg  = MENU_FG(dark);
  const dim = MENU_DIM(dark);
  const bdr = MENU_BDR(dark);
  const hvr = MENU_HVR(dark);
  const mono = '"iA Writer Mono","Courier New",monospace';

  useEffect(() => {
    if (!open) return;
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    setTimeout(() => document.addEventListener('mousedown', fn), 0);
    return () => document.removeEventListener('mousedown', fn);
  }, [open, onClose]);

  if (!open) return null;

  const itemStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '7px 16px', fontSize: '13px', fontFamily: mono,
    color: fg, cursor: 'pointer', userSelect: 'none',
  };

  const Row = ({ label, shortcut, b, a }: { label: string; shortcut: string; b: string; a: string }) => (
    <div style={itemStyle}
      onMouseEnter={e => (e.currentTarget.style.background = hvr)}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      onClick={() => { onWrap(b, a); onClose(); }}>
      <span>{label}</span>
      {shortcut && <span style={{ color: dim, fontSize: '11px' }}>{shortcut}</span>}
    </div>
  );

  const Divider = () => <div style={{ height: 1, background: bdr, margin: '3px 0' }} />;

  return (
    <div ref={ref} style={{
      position: 'absolute', top: 40, left: 0, zIndex: 100,
      background: bg, border: `1px solid ${bdr}`,
      borderRadius: 8, minWidth: 220,
      boxShadow: dark ? '0 8px 32px rgba(0,0,0,0.6)' : '0 8px 32px rgba(0,0,0,0.15)',
      overflow: 'visible',
    }}>
      {/* Headings 行 — 有子菜单 */}
      <div style={{ position: 'relative' }}
        onMouseEnter={e => {
          (e.currentTarget.style.background = hvr);
          const sub = e.currentTarget.querySelector('.sub-menu') as HTMLElement;
          if (sub) sub.style.display = 'block';
        }}
        onMouseLeave={e => {
          (e.currentTarget.style.background = 'transparent');
          const sub = e.currentTarget.querySelector('.sub-menu') as HTMLElement;
          if (sub) sub.style.display = 'none';
        }}>
        <div style={{ ...itemStyle }}>
          <span>Headings</span>
          <ChevronRight className="w-3.5 h-3.5" style={{ color: dim }} />
        </div>
        {/* 子菜单 */}
        <div className="sub-menu" style={{
          display: 'none', position: 'absolute', top: 0, left: '100%',
          background: bg, border: `1px solid ${bdr}`, borderRadius: 8,
          minWidth: 200, boxShadow: dark ? '0 8px 32px rgba(0,0,0,0.6)' : '0 8px 32px rgba(0,0,0,0.15)',
        }}>
          {HEADINGS.map(h => <Row key={h.label} {...h} />)}
        </div>
      </div>

      {ITEMS.map(item => <Row key={item.label} {...item} />)}
      <Divider />
      {INLINE.map(item => <Row key={item.label} {...item} />)}
    </div>
  );
}
