import { useState } from 'react';
import { Panel } from '@xyflow/react';

interface CanvasAskBarProps {
  busy?: boolean;
  messages?: CanvasAskMessage[];
  onSubmit?: (query: string) => void | Promise<void>;
}

export interface CanvasAskMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

const FONT = '"JetBrains Mono","SFMono-Regular","Cascadia Code","Consolas",monospace';
const UI_FONT = '"HarmonyOS Sans SC","Inter","Microsoft YaHei UI",system-ui,sans-serif';

export function CanvasAskBar({ busy = false, messages = [], onSubmit }: CanvasAskBarProps) {
  const [query, setQuery] = useState('');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || busy) return;
    void onSubmit?.(trimmed);
    setQuery('');
  };
  const visibleMessages = messages.slice(-10).reverse();

  return (
    <Panel
      position="bottom-left"
      className="nodrag nopan"
      style={{ margin: 0, left: 0, bottom: 0, pointerEvents: 'none', zIndex: 40 }}
    >
      <style>{`
        @keyframes gsyenAskSlide {
          from { opacity: 0; transform: translateX(-12px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      <div style={{
        width: '100vw',
        height: '25vh',
        minHeight: 188,
        maxHeight: 280,
        display: 'grid',
        gridTemplateRows: visibleMessages.length > 0 ? 'minmax(0, 1fr) 46px' : '46px',
        gap: 10,
        padding: visibleMessages.length > 0 ? '12px 18px 18px' : '0 18px 18px',
        boxSizing: 'border-box',
        pointerEvents: 'none',
        alignContent: 'end',
      }}>
        {visibleMessages.length > 0 && (
          <div style={{
            position: 'relative',
            flex: 1,
            minHeight: 0,
          }}>
            <div style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'stretch',
              gap: 10,
              overflowX: 'auto',
              overflowY: 'hidden',
              padding: '8px 12vw 4px 0',
              pointerEvents: 'auto',
              scrollSnapType: 'x proximity',
              WebkitMaskImage: 'linear-gradient(90deg, #000 0%, #000 90%, transparent 100%)',
              maskImage: 'linear-gradient(90deg, #000 0%, #000 90%, transparent 100%)',
            }}>
              {visibleMessages.map(message => {
                const isUser = message.role === 'user';
                return (
                  <div key={message.id} style={{
                    flex: '0 0 auto',
                    width: isUser ? 320 : 460,
                    height: '100%',
                    overflowY: 'auto',
                    padding: '12px 14px',
                    background: isUser ? '#1A1A1A' : 'rgba(255,255,255,0.92)',
                    color: isUser ? '#F9F8F6' : '#1A1A1A',
                    border: `1px solid ${isUser ? 'rgba(26,26,26,0.72)' : 'rgba(153,27,27,0.16)'}`,
                    boxShadow: '0 10px 28px rgba(40,38,52,0.10)',
                    fontFamily: UI_FONT,
                    fontSize: 12,
                    lineHeight: 1.55,
                    whiteSpace: 'pre-wrap',
                    animation: 'gsyenAskSlide 180ms ease-out both',
                    backdropFilter: 'blur(16px)',
                    scrollSnapAlign: 'start',
                    boxSizing: 'border-box',
                  }}>
                    {!isUser && (
                      <div style={{ marginBottom: 6, fontFamily: FONT, fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', color: '#991B1B' }}>
                        灵阁 SESSION
                      </div>
                    )}
                    {message.text}
                  </div>
                );
              })}
            </div>
            <div style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: '10%',
              height: '100%',
              pointerEvents: 'none',
              background: 'linear-gradient(90deg, rgba(248,248,248,0), rgba(26,26,26,0.22) 62%, rgba(26,26,26,0.62))',
            }} />
          </div>
        )}
        <form
          onSubmit={submit}
          onMouseDown={event => event.stopPropagation()}
          onDoubleClick={event => event.stopPropagation()}
          style={{
            alignSelf: 'center',
            width: 'min(1180px, calc(100vw - 112px))',
            minWidth: 620,
            height: 46,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 10px 0 14px',
            background: 'rgba(255,255,255,0.92)',
            border: '1px solid rgba(26,26,26,0.14)',
            boxShadow: '0 14px 42px rgba(40,38,52,0.14)',
            fontFamily: UI_FONT,
            backdropFilter: 'blur(18px)',
            pointerEvents: 'auto',
          }}
        >
          <span style={{
            flexShrink: 0,
            color: '#991B1B',
            fontFamily: FONT,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.12em',
          }}>
            灵阁 SESSION
          </span>
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="帮我找到 header 隐藏的相关代码"
            spellCheck={false}
            style={{
              flex: 1,
              minWidth: 0,
              border: 0,
              outline: 0,
              background: 'transparent',
              color: '#1A1A1A',
              fontSize: 14,
              fontFamily: UI_FONT,
            }}
          />
          <button
            type="submit"
            disabled={busy || query.trim().length === 0}
            style={{
              height: 30,
              padding: '0 14px',
              border: '1px solid rgba(26,26,26,0.16)',
              background: busy ? 'rgba(26,26,26,0.06)' : '#1A1A1A',
              color: busy ? 'rgba(26,26,26,0.38)' : '#F9F8F6',
              fontFamily: FONT,
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: '0.12em',
              cursor: busy ? 'wait' : 'pointer',
            }}
          >
            {busy ? 'SCAN' : 'ENTER'}
          </button>
        </form>
      </div>
    </Panel>
  );
}
