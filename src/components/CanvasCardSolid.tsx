import { memo, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { useReactFlow } from '@xyflow/react';
import type { CardData, CardSize, StatusColor } from './CanvasCardData';
import { STATUS_COLORS } from './CanvasCardData';
import { CanvasCardPanel } from './CanvasCardPanel';
import {
  ACCENT_HEX,
  BODY_SIZE,
  EMPTY_BULLETS,
  HANDLE_NEAR_PX,
  LATIN_FONT,
  SCRINTAL_DEFAULT,
  SIZE_H,
  SIZE_W,
  TITLE_SIZE,
  UI_FONT,
  type HandleSide,
} from './CanvasCardSolidTokens';
import { buildHeaderTags, normalizeContentType, renderLines, splitDashedLeadHeading } from './CanvasCardSolidContent';
import { CanvasCardSolidHandles } from './CanvasCardSolidHandles';
import { openSourceCode } from './CanvasSourceCodeViewer';

export interface SolidCardProps { id: string; data: CardData; selected: boolean }

function sourcePathFrom(data: CardData) {
  if (typeof data.sourcePath === 'string' && data.sourcePath.trim()) return data.sourcePath.trim();
  return '';
}

function lineRangeFrom(status?: string) {
  const match = String(status ?? '').match(/^L(\d+)(?:-L?(\d+))?$/);
  if (!match) return {};
  const lineStart = Number(match[1]);
  const lineEnd = Number(match[2] ?? match[1]);
  return { lineStart, lineEnd };
}

export const CanvasCardSolid = memo(({ id, data: d, selected }: SolidCardProps) => {
  const { updateNodeData } = useReactFlow();
  const sz: CardSize = d.cardSize ?? 'S';
  const [hovered, setHovered] = useState(false);
  const [activeHandleSide, setActiveHandleSide] = useState<HandleSide | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingBody, setEditingBody] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const rawTitle = String(d.entityName || d.connectorName || '').trim();
  const title = rawTitle || '未命名';
  const hasExplicitTitle = rawTitle.length > 0;
  const text = typeof d.text === 'string' ? d.text : '';
  const childIds = Array.isArray(d.childIds) ? d.childIds.filter(Boolean) : [];
  const isPortal = childIds.length > 0;
  const portalActive = Boolean(d.portalFocusActive);
  const onPortalToggle = typeof d.onPortalToggle === 'function' ? d.onPortalToggle as (id: string) => void : null;
  const sourcePath = sourcePathFrom(d);
  const isSourceFile = sourcePath.length > 0;
  const [titleDraft, setTitleDraft] = useState(title);
  const [bodyDraft, setBodyDraft] = useState(text);

  useEffect(() => { if (!editingTitle) setTitleDraft(title); }, [editingTitle, title]);
  useEffect(() => { if (!editingBody) setBodyDraft(text); }, [editingBody, text]);

  const openPanel = (e: MouseEvent) => {
    e.stopPropagation();
    setPanelOpen(true);
  };

  const togglePortal = (e: MouseEvent) => {
    if (!isPortal || !onPortalToggle) return;
    e.stopPropagation();
    onPortalToggle(id);
  };

  const openSource = (e: MouseEvent) => {
    if (!isSourceFile) return;
    e.stopPropagation();
    openSourceCode({ path: sourcePath, title, ...lineRangeFrom(d.status) });
  };

  const updateActiveHandleSide = (e: MouseEvent<HTMLDivElement>) => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const distances: Array<{ side: HandleSide; value: number }> = [
      { side: 't', value: y },
      { side: 'r', value: rect.width - x },
      { side: 'b', value: rect.height - y },
      { side: 'l', value: x },
    ];
    const nearest = distances.sort((a, b) => a.value - b.value)[0];
    setActiveHandleSide(nearest.value <= HANDLE_NEAR_PX ? nearest.side : null);
  };

  const commitTitle = () => {
    setEditingTitle(false);
    const next = titleDraft.trim();
    if (next !== (d.entityName ?? '')) updateNodeData(id, { cardType: 'solid', entityName: next });
  };

  const commitBody = () => {
    setEditingBody(false);
    if (bodyDraft !== text) updateNodeData(id, { cardType: 'solid', text: bodyDraft });
  };

  const onTitleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitTitle();
    if (e.key === 'Escape') { setTitleDraft(title); setEditingTitle(false); }
  };

  const onBodyKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') { setBodyDraft(text); setEditingBody(false); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') commitBody();
  };

  const contentType = normalizeContentType(d);
  const tone = d.cardAccent ? ACCENT_HEX[d.cardAccent] ?? SCRINTAL_DEFAULT : SCRINTAL_DEFAULT;
  const isDashed = d.cardBorder === 'dashed';
  const isFrosted = d.cardOpacity === 'frosted';
  const isFade = d.cardState === 'fade';
  const isHighlight = d.cardState === 'highlight';
  const isFloat = d.cardElevation === 'float';
  const isLoose = d.cardDensity === 'loose';
  const cornerR = d.cardCorner === 'none' ? 4 : 6;
  const statusColor = (STATUS_COLORS[(d.statusColor ?? 'gray') as StatusColor] ? (d.statusColor ?? 'gray') : 'gray') as StatusColor;
  const status = d.status || '草稿';
  const statusTone = STATUS_COLORS[statusColor];
  const headerTags = buildHeaderTags(d, contentType, status);
  const showActions = hovered || selected || panelOpen;

  const padX = isLoose ? 17 : 14;
  const padY = isLoose ? 15 : 12;
  const titleSize = TITLE_SIZE[sz];
  const bodySize = BODY_SIZE[sz];
  const borderColor = isHighlight ? 'rgba(185, 134, 32, 0.46)' : tone.border;
  const actionColor = panelOpen ? tone.ink : tone.muted;
  const actionRing = panelOpen ? `0 0 0 2px ${tone.border}` : '0 4px 9px rgba(53,39,78,0.055)';
  const cardBg = isDashed ? SCRINTAL_DEFAULT.bg : tone.bg;
  const headerBg = isDashed ? tone.bg : undefined;
  const dashedSplit = isDashed && !editingBody ? splitDashedLeadHeading(text) : { leadHeading: null, bodyText: text };
  const displayText = dashedSplit.bodyText;
  const displayHasBody = displayText.trim().length > 0;
  const shadow = selected
    ? '0 5px 12px rgba(53,39,78,0.085), 0 1px 2px rgba(53,39,78,0.05)'
    : portalActive
      ? '0 0 0 2px rgba(255,255,255,0.74), 0 7px 18px rgba(53,39,78,0.12)'
    : (hovered || isFloat)
      ? '0 5px 12px rgba(53,39,78,0.08), 0 1px 2px rgba(53,39,78,0.05)'
      : '0 3px 8px rgba(53,39,78,0.06), 0 1px 2px rgba(53,39,78,0.035)';

  return (
    <div style={{ position: 'relative', opacity: isFade ? 0.42 : 1, transition: 'opacity 0.16s' }}
      onMouseEnter={() => setHovered(true)}
      onMouseMove={updateActiveHandleSide}
      onMouseLeave={() => { setHovered(false); setActiveHandleSide(null); }}
      onClick={isSourceFile ? openSource : undefined}
      onDoubleClick={isSourceFile ? openSource : togglePortal}>

      {panelOpen && (
        <CanvasCardPanel nodeId={id} data={{ ...d, cardType: 'solid', contentType }} anchorRef={cardRef}
          onClose={() => setPanelOpen(false)} />
      )}

      <div ref={cardRef} style={{
        position: 'relative', width: SIZE_W[sz], height: SIZE_H[sz], overflow: 'hidden', boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column', padding: `${padY}px ${padX}px 10px`,
        background: isFrosted ? `${cardBg.replace('0.96', '0.74')}` : cardBg,
        backdropFilter: isFrosted ? 'blur(18px)' : undefined,
        WebkitBackdropFilter: isFrosted ? 'blur(18px)' : undefined,
        border: `1.5px ${isPortal ? 'solid' : isDashed ? 'dashed' : 'solid'} ${portalActive ? tone.ink : borderColor}`,
        backgroundClip: 'padding-box',
        borderRadius: cornerR, boxShadow: shadow,
        transition: 'box-shadow 0.14s, border-color 0.14s, background 0.14s, opacity 0.14s',
        outline: isHighlight ? '2px solid rgba(185,134,32,0.16)' : 'none', outlineOffset: 2,
        fontFamily: UI_FONT,
      }}>
        <button onClick={openPanel} className="nodrag nopan" aria-label="Card options"
          style={{ position: 'absolute', top: 10, right: 10, width: 22, height: 22,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: panelOpen ? 'rgba(255,255,255,0.66)' : 'rgba(255,255,255,0.36)',
            border: '1px solid rgba(72,61,88,0.12)', borderRadius: 7, cursor: 'pointer', padding: 0, outline: 'none',
            boxShadow: actionRing,
            color: actionColor,
            opacity: showActions ? 0.95 : 0, pointerEvents: showActions ? 'auto' : 'none', zIndex: 3,
            transition: 'opacity 0.1s, background 0.12s, color 0.12s, box-shadow 0.12s' }}>
          <svg width="13" height="4" viewBox="0 0 13 4" fill="currentColor">
            <circle cx="2" cy="2" r="1.55"/><circle cx="6.5" cy="2" r="1.55"/><circle cx="11" cy="2" r="1.55"/>
          </svg>
        </button>

        {isPortal && (
          <span className="nodrag nopan" onDoubleClick={togglePortal}
            style={{ position: 'absolute', top: 10, right: 40, height: 22,
              display: 'inline-flex', alignItems: 'center', padding: '0 7px',
              borderRadius: 7, border: `1px solid ${tone.border}`,
              background: 'rgba(255,255,255,0.46)', color: tone.muted,
              fontFamily: LATIN_FONT, fontSize: 9.5, fontWeight: 650,
              boxShadow: '0 4px 9px rgba(53,39,78,0.035)', zIndex: 3,
              cursor: 'zoom-in', userSelect: 'none' }}>
            {portalActive ? 'open' : 'folder'} · {childIds.length}
          </span>
        )}

        <div style={{
          margin: headerBg ? `-${padY}px -${padX}px 0` : undefined,
          padding: headerBg ? `${padY}px ${padX}px 10px` : undefined,
          background: headerBg ? (isFrosted ? headerBg.replace('0.96', '0.74') : headerBg) : undefined,
          borderBottom: headerBg ? `1px solid ${tone.border}` : undefined,
          position: 'relative',
          zIndex: 1,
        }}>
          <div style={{ paddingRight: isPortal ? 112 : 30 }}>
            {editingTitle ? (
              <input autoFocus value={titleDraft} className="nodrag nopan"
                onChange={e => setTitleDraft(e.target.value)} onBlur={commitTitle} onKeyDown={onTitleKey}
                style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent',
                  padding: 0, fontFamily: UI_FONT, fontSize: titleSize, fontWeight: 720,
                  lineHeight: 1.18, color: tone.ink }} />
            ) : (
              <div onDoubleClick={e => { if (isPortal) togglePortal(e); else if (isSourceFile) openSource(e); else { e.stopPropagation(); setEditingTitle(true); } }}
                style={{ fontSize: titleSize, fontWeight: hasExplicitTitle ? 720 : 680, lineHeight: 1.18,
                  color: hasExplicitTitle ? tone.ink : 'rgba(32,35,43,0.74)', letterSpacing: 0, overflowWrap: 'anywhere',
                  cursor: isPortal || isSourceFile ? 'zoom-in' : 'text' }}>
                {title}
              </div>
            )}
          </div>

          <div style={{ marginTop: 8, fontFamily: LATIN_FONT, fontSize: 9.5, lineHeight: 1.25,
            color: tone.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {headerTags}
          </div>

          {dashedSplit.leadHeading && (
            <div style={{ marginTop: 13, fontSize: bodySize, fontWeight: 700, color: 'rgba(24,28,38,0.86)' }}>
              {dashedSplit.leadHeading}
            </div>
          )}
        </div>

        <div onDoubleClick={e => { if (isPortal) togglePortal(e); else if (isSourceFile) openSource(e); else { e.stopPropagation(); setEditingBody(true); } }}
          style={{ flex: '1 1 auto', minHeight: 0, overflow: 'hidden', marginTop: dashedSplit.leadHeading ? 0 : 13,
            fontSize: bodySize, lineHeight: 1.42, color: 'rgba(34,39,52,0.72)', position: 'relative', zIndex: 1,
            cursor: isPortal || isSourceFile ? 'zoom-in' : 'text' }}>
          {editingBody ? (
            <textarea autoFocus value={bodyDraft} className="nodrag nopan"
              onChange={e => setBodyDraft(e.target.value)} onBlur={commitBody} onKeyDown={onBodyKey}
              style={{ width: '100%', height: '100%', border: 'none', outline: 'none', resize: 'none',
                background: 'transparent', padding: 0, fontFamily: UI_FONT, fontSize: bodySize,
                lineHeight: 1.42, color: 'rgba(34,39,52,0.78)' }} />
          ) : displayHasBody ? (
            <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{renderLines(displayText, bodySize, tone.muted)}</div>
          ) : (
            <div aria-hidden>
              <div style={{ marginBottom: 6, fontSize: bodySize, fontWeight: 720, color: 'rgba(32,35,43,0.48)' }}>Schedule</div>
              {Array.from({ length: EMPTY_BULLETS[sz] }).map((_, i) => (
                <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'center', marginTop: 5 }}>
                  <span style={{ width: 3.5, height: 3.5, borderRadius: '50%', background: 'rgba(32,35,43,0.25)', flexShrink: 0 }} />
                  <span style={{ width: `${68 - i * 10}%`, height: 6, borderRadius: 3, background: 'rgba(32,35,43,0.055)' }} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginTop: 10, flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 7,
          fontFamily: LATIN_FONT, color: 'rgba(54,60,74,0.48)', fontSize: 10.5, lineHeight: 1, position: 'relative', zIndex: 1 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: d.status ? statusTone.fg : 'rgba(54,60,74,0.32)', opacity: 0.58 }} />
          <span>{status}</span>
          <span style={{ opacity: 0.45 }}>·</span>
          <span>edited</span>
        </div>
      </div>

      <CanvasCardSolidHandles activeHandleSide={activeHandleSide} muted={tone.muted} size={sz} />
    </div>
  );
});

CanvasCardSolid.displayName = 'CanvasCardSolid';
