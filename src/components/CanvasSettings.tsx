/**
 * CanvasSettings — iWriter 设置面板（portal 弹窗）
 */
import { createPortal } from 'react-dom';
import type { CanvasPrefs } from '../stores/canvasPrefsStore';
import { SYS_FONT } from './CanvasEditorTypes';
import type { Palette } from './CanvasEditorTypes';

interface Props {
  prefs:    CanvasPrefs;
  onChange: (patch: Partial<CanvasPrefs>) => void;
  onClose:  () => void;
  P:        Palette;
  dark:     boolean;
}

/* ── 小控件 ── */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '11px 0', borderBottom: '0.5px solid rgba(128,128,128,0.12)' }}>
      <span style={{ fontSize: 13, fontFamily: SYS_FONT, opacity: 0.75 }}>{label}</span>
      {children}
    </div>
  );
}

function SectionTitle({ label }: { label: string }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
      textTransform: 'uppercase', opacity: 0.4, fontFamily: SYS_FONT,
      padding: '20px 0 6px' }}>
      {label}
    </div>
  );
}

function Seg<T extends string>({ options, value, onChange, P }: {
  options: { value: T; label: string }[];
  value:   T;
  onChange:(v: T) => void;
  P:       Palette;
}) {
  return (
    <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden',
      border: `0.5px solid ${P.border}`, flexShrink: 0 }}>
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)}
          style={{ padding: '5px 12px', fontFamily: SYS_FONT, fontSize: 12,
            fontWeight: 500, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
            background: value === o.value ? P.accent : 'transparent',
            color:      value === o.value ? '#fff' : P.fg,
            transition: 'background 0.12s, color 0.12s' }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ value, onChange, P }: { value: boolean; onChange: (v: boolean) => void; P: Palette }) {
  return (
    <button onClick={() => onChange(!value)}
      style={{ width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
        background: value ? P.accent : `${P.fg}22`,
        position: 'relative', flexShrink: 0, transition: 'background 0.18s' }}>
      <span style={{ position: 'absolute', top: 3, borderRadius: '50%', width: 16, height: 16,
        background: '#fff', transition: 'left 0.18s',
        left: value ? 21 : 3 }} />
    </button>
  );
}

function Slider({ value, min, max, onChange, P }: {
  value: number; min: number; max: number;
  onChange: (v: number) => void; P: Palette;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 12, fontFamily: SYS_FONT, opacity: 0.5, minWidth: 24, textAlign: 'right' }}>{value}</span>
      <input type="range" min={min} max={max} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: 110, accentColor: P.accent }} />
    </div>
  );
}

export function CanvasSettings({ prefs, onChange, onClose, P, dark }: Props) {
  return createPortal(
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 200,
        background: dark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(4px)' }}>

      <div onClick={e => e.stopPropagation()}
        style={{ width: 420, maxHeight: '80vh', overflowY: 'auto',
          background: P.chrome, borderRadius: 12, color: P.fg,
          boxShadow: dark
            ? '0 8px 16px rgba(0,0,0,0.5), 0 24px 64px rgba(0,0,0,0.7)'
            : '0 8px 16px rgba(0,0,0,0.08), 0 24px 64px rgba(0,0,0,0.14)',
          border: `0.5px solid ${P.border}`, padding: '20px 24px 28px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 16, fontWeight: 600, fontFamily: SYS_FONT }}>Settings</span>
          <button onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer',
              color: P.dim, fontSize: 18, lineHeight: 1, padding: '2px 4px' }}>×</button>
        </div>

        {/* ── Editor ── */}
        <SectionTitle label="Editor" />
        <Row label="Theme">
          <Seg P={P} value={prefs.dark ? 'dark' : 'light'}
            options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]}
            onChange={v => onChange({ dark: v === 'dark' })} />
        </Row>
        <Row label="Font">
          <Seg P={P} value={prefs.font}
            options={[{ value: 'mono', label: 'Mono' }, { value: 'quattro', label: 'Quattro' }]}
            onChange={v => onChange({ font: v as 'mono' | 'quattro' })} />
        </Row>
        <Row label="Font Size">
          <Slider P={P} value={prefs.fontSize} min={13} max={24}
            onChange={v => onChange({ fontSize: v })} />
        </Row>
        <Row label="Line Width">
          <Seg P={P} value={String(prefs.lineLen) as any}
            options={[{ value: '64', label: '64' }, { value: '72', label: '72' }, { value: '80', label: '80' }]}
            onChange={v => onChange({ lineLen: Number(v) as 64 | 72 | 80 })} />
        </Row>

        {/* ── Writing ── */}
        <SectionTitle label="Writing" />
        <Row label="Focus Mode">
          <Seg P={P} value={prefs.focusMode}
            options={[
              { value: 'off',       label: 'Off'       },
              { value: 'sentence',  label: 'Sentence'  },
              { value: 'paragraph', label: 'Paragraph' },
            ]}
            onChange={v => onChange({ focusMode: v as CanvasPrefs['focusMode'] })} />
        </Row>
        <Row label="Typewriter Scroll">
          <Toggle P={P} value={prefs.tw} onChange={v => onChange({ tw: v })} />
        </Row>

        {/* ── Library ── */}
        <SectionTitle label="Library" />
        <Row label="Default File Type">
          <select value={prefs.defaultExt} onChange={e => onChange({ defaultExt: e.target.value as '.md' | '.txt' })}
            style={{ background: P.chrome, color: P.fg, border: `0.5px solid ${P.border}`,
              borderRadius: 4, padding: '4px 8px', fontSize: 12, fontFamily: SYS_FONT,
              cursor: 'pointer', outline: 'none' }}>
            <option value=".md">.md</option>
            <option value=".txt">.txt</option>
          </select>
        </Row>
        <Row label="Reopen Last File">
          <Toggle P={P} value={prefs.reopenLast} onChange={v => onChange({ reopenLast: v })} />
        </Row>

      </div>
    </div>,
    document.body
  );
}
