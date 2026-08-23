import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, ChevronUp, PanelLeft, Plus } from 'lucide-react';
import { memo, type MouseEventHandler, type RefObject } from 'react';
import { MODELS, type ModelId } from '../config/models';
import { getPulseSignals, type PulseLang, type PulseSignal } from '../config/pulseSignals';
import { ModelStatusLight } from './ModelStatusLight';

type Lang = PulseLang;

interface ChatCommandDeckProps {
  lang: Lang;
  sidebarOpen: boolean;
  pulseOpen: boolean;
  pulseDocked: boolean;
  modelPanelOpen: boolean;
  selectedModel: ModelId;
  modelScrollRef: RefObject<HTMLDivElement>;
  onToggleSidebar: () => void;
  onNewChat: () => void;
  onTogglePulse: () => void;
  onTogglePulseDock: () => void;
  onClosePulse: () => void;
  onToggleModelPanel: () => void;
  onPulseDockAnimationComplete: (docked: boolean) => void;
  onSelectModel: (model: ModelId) => void;
  onMsDragStart: MouseEventHandler<HTMLDivElement>;
  onMsDragMove: MouseEventHandler<HTMLDivElement>;
  onMsDragEnd: MouseEventHandler<HTMLDivElement>;
}

function PulseDockButton({ lang, onTogglePulseDock, onAnimationComplete }: {
  lang: Lang;
  onTogglePulseDock: () => void;
  onAnimationComplete: (docked: boolean) => void;
}) {
  return (
    <motion.button type="button" onClick={onTogglePulseDock}
      className="gsyen-command-button gsyen-pulse-dock-button"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { delay: 0.64, duration: 0.32, ease: [0.16, 1, 0.3, 1] } }}
      exit={{ opacity: 0, transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] } }}
      onAnimationComplete={() => onAnimationComplete(true)}
      aria-label={lang === 'zh' ? '展开 GYEN Pulse' : 'Expand GYEN Pulse'}>
      <span>GYEN PULSE</span>
    </motion.button>
  );
}

function PulseTape({ lang, pulseOpen, signals, onTogglePulse, onTogglePulseDock }: {
  lang: Lang;
  pulseOpen: boolean;
  signals: PulseSignal[];
  onTogglePulse: () => void;
  onTogglePulseDock: () => void;
}) {
  return (
    <div
      className={`gsyen-pulse-tape gsyen-system-bus ${pulseOpen ? 'is-open' : ''}`}
      aria-label={lang === 'zh' ? '疆域脉搏' : 'GYEN pulse'}>
      <button type="button" onClick={onTogglePulseDock}
        className="gsyen-system-bus-label gsyen-pulse-dock-toggle"
        aria-label={lang === 'zh' ? '收起 GYEN Pulse' : 'Dock GYEN Pulse'}>
        GYEN PULSE
      </button>
      <button type="button" onClick={onTogglePulse}
        className="gsyen-pulse-window gsyen-system-bus-window"
        aria-expanded={pulseOpen} aria-label={lang === 'zh' ? '展开今日疆域状态' : 'Toggle GYEN pulse detail'}>
        <span className="gsyen-pulse-marquee gsyen-system-bus-track">
          {signals.map(signal => <PulseCell key={`a-${signal.label}-${signal.value}`} signal={signal} />)}
          {signals.map(signal => <PulseCell key={`b-${signal.label}-${signal.value}`} signal={signal} hidden />)}
        </span>
      </button>
      <button type="button" onClick={onTogglePulse}
        className="gsyen-system-count"
        aria-expanded={pulseOpen} aria-label={lang === 'zh' ? '展开今日疆域状态' : 'Toggle GYEN pulse detail'}>
        <span>{signals.length}</span>
        {pulseOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
    </div>
  );
}

function PulseCell({ signal, hidden = false }: { signal: PulseSignal; hidden?: boolean }) {
  return (
    <span className="gsyen-system-cell" aria-hidden={hidden || undefined}>
      <span className="gsyen-system-cell-name">{signal.label}</span>
      <span className="gsyen-system-cell-value">{signal.value}</span>
      <span className="gsyen-system-cell-unit">{signal.unit}</span>
    </span>
  );
}

function PulsePanel({ lang, pulseOpen, signals, onClosePulse }: {
  lang: Lang;
  pulseOpen: boolean;
  signals: PulseSignal[];
  onClosePulse: () => void;
}) {
  return (
    <AnimatePresence initial={false}>
      {pulseOpen && (
        <motion.div key="pulse-panel"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="gsyen-pulse-panel shrink-0 overflow-hidden border-b border-[#1A1A1A]/20 bg-[#151412] text-[#F4F2EE] shadow-[inset_0_1px_0_rgba(215,181,109,0.18)]">
          <div className="px-8 py-2">
            <div className="gsyen-pulse-panel-head flex h-7 items-center justify-between border-b border-[#D7B56D]/20 font-mono fs-xs font-bold uppercase tracking-widest">
              <div className="flex items-center text-[#D7B56D]">
                <span>{lang === 'zh' ? '今日疆域状态' : 'Today GYEN State'}</span>
              </div>
              <button type="button" onClick={onClosePulse}
                className="gsyen-pulse-panel-collapse text-[#F4F2EE]/45 transition-colors hover:text-[#D7B56D]">
                {lang === 'zh' ? '收起' : 'Collapse'} ▲
              </button>
            </div>
            <div className="grid gap-0 py-1">
              {signals.map(signal => <PulsePanelRow key={`${signal.label}-${signal.value}-${signal.detail}`} signal={signal} />)}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PulsePanelRow({ signal }: { signal: PulseSignal }) {
  return (
    <div className="gsyen-pulse-panel-row grid h-8 grid-cols-[96px_48px_72px_minmax(0,1fr)_84px] items-center border-b border-white/[0.06] last:border-b-0">
      <span className="font-mono fs-xs font-bold tracking-widest text-[#F4F2EE]/38">{signal.label}</span>
      <span className="font-mono fs-xs font-bold tracking-widest text-[#D7B56D]/90">{signal.value}</span>
      <span className="font-mono fs-xs font-bold tracking-widest text-[#F4F2EE]/40">{signal.unit}</span>
      <span className="truncate fs-sm text-[#F4F2EE]/82">{signal.detail}</span>
      <button type="button" className="gsyen-pulse-panel-action h-6 justify-self-end border border-[#F4F2EE]/18 px-2 font-mono fs-xs font-bold tracking-widest text-[#F4F2EE]/62 transition-colors hover:border-[#D7B56D]/70 hover:text-[#D7B56D]">
        {signal.action}
      </button>
    </div>
  );
}

export const ChatCommandDeck = memo(function ChatCommandDeck({
  lang,
  sidebarOpen,
  pulseOpen,
  pulseDocked,
  modelPanelOpen,
  selectedModel,
  modelScrollRef,
  onToggleSidebar,
  onNewChat,
  onTogglePulse,
  onTogglePulseDock,
  onClosePulse,
  onToggleModelPanel,
  onPulseDockAnimationComplete,
  onSelectModel,
  onMsDragStart,
  onMsDragMove,
  onMsDragEnd,
}: ChatCommandDeckProps) {
  const signals = getPulseSignals(lang);

  return (
    <>
      <div className={`gsyen-command-deck gsyen-module-toolbar relative shrink-0 h-[56px] px-8 border-y border-[#1A1A1A]/10 bg-[#ECE9E3] grid items-center text-[#1A1A1A]/70 ${pulseOpen ? 'has-pulse-open' : ''} ${pulseDocked ? 'has-pulse-docked' : ''} ${modelPanelOpen ? 'has-model-open' : ''}`}>
        <div className="gsyen-command-tools">
          <button onClick={onToggleSidebar} aria-label={lang === 'zh' ? '切换档案库' : 'Toggle archive'} aria-pressed={sidebarOpen} className={`gsyen-icon-command ${sidebarOpen ? 'is-active' : ''}`}>
            <PanelLeft className="w-4 h-4" />
          </button>
          <button onClick={onNewChat} className="gsyen-command-button" aria-label={lang === 'zh' ? '新建对话' : 'New chat'}>
            <Plus className="w-3 h-3" /><span>NEW</span>
          </button>
          <div className="gsyen-pulse-dock-slot" aria-hidden={!pulseDocked}>
            <AnimatePresence initial={false}>
              {pulseDocked && <PulseDockButton lang={lang} onTogglePulseDock={onTogglePulseDock} onAnimationComplete={onPulseDockAnimationComplete} />}
            </AnimatePresence>
          </div>
        </div>

        <div className="gsyen-command-core">
          <motion.div
            className="gsyen-command-pulse"
            initial={false}
            animate={pulseDocked
              ? {
                opacity: 0,
                clipPath: 'inset(0 100% 0 0)',
                x: '-50%',
                y: '-50%',
                transitionEnd: { visibility: 'hidden' },
              }
              : { visibility: 'visible', opacity: 1, clipPath: 'inset(0 0% 0 0)', x: '-50%', y: '-50%' }}
            transition={pulseDocked
              ? { duration: 0.62, ease: [0.16, 1, 0.3, 1] }
              : { delay: 0.22, duration: 0.62, ease: [0.16, 1, 0.3, 1] }}
            onAnimationComplete={() => { if (!pulseDocked) onPulseDockAnimationComplete(false); }}
            style={{ pointerEvents: pulseDocked ? 'none' : 'auto', clipPath: 'inset(0 0% 0 0)' }}
            aria-hidden={pulseDocked}>
            <PulseTape lang={lang} pulseOpen={pulseOpen} signals={signals}
              onTogglePulse={onTogglePulse} onTogglePulseDock={onTogglePulseDock} />
          </motion.div>

          <div className="gsyen-command-model gsyen-model-strip">
            <div className="gsyen-model-dock">
              <span className="gsyen-model-label" aria-label="MODEL">
                <span className="gsyen-model-label-full">MODEL</span>
                <span className="gsyen-model-label-short" aria-hidden="true">M</span>
              </span>
              <div ref={modelScrollRef} onMouseDown={onMsDragStart} onMouseMove={onMsDragMove} onMouseUp={onMsDragEnd} onMouseLeave={onMsDragEnd}
                className="gsyen-model-selector" style={{ cursor: 'grab' }}>
                {MODELS.map(m => (
                  <button key={m.id} onClick={() => !m.disabled && onSelectModel(m.id as ModelId)} disabled={m.disabled}
                    className={`gsyen-model-option ${m.disabled ? 'is-disabled' : selectedModel === m.id ? 'is-active' : ''}`}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <ModelStatusLight selectedModel={selectedModel} active={modelPanelOpen} onClick={onToggleModelPanel} />
          </div>
        </div>
      </div>
      <PulsePanel lang={lang} pulseOpen={pulseOpen} signals={signals} onClosePulse={onClosePulse} />
    </>
  );
});
