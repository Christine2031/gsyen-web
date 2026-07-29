import { Handle } from '@xyflow/react';
import type { CardSize } from './CanvasCardData';
import {
  HANDLE_HIT_SIZE,
  HANDLE_SIZE,
  SIDES,
  SIZE_H,
  SIZE_W,
  type HandleSide,
  visualHandlePosition,
} from './CanvasCardSolidTokens';

interface Props {
  activeHandleSide: HandleSide | null;
  muted: string;
  size: CardSize;
}

export function CanvasCardSolidHandles({ activeHandleSide, muted, size }: Props) {
  return (
    <>
      {SIDES.map(({ id: hid }) => {
        const active = activeHandleSide === hid;
        return (
          <span key={`visual-${hid}`} aria-hidden
            style={{
              ...visualHandlePosition(hid, SIZE_W[size], SIZE_H[size]),
              position: 'absolute',
              width: HANDLE_SIZE,
              height: HANDLE_SIZE,
              borderRadius: '50%',
              background: muted,
              border: '2px solid rgba(255,255,255,0.78)',
              boxSizing: 'border-box',
              opacity: active ? 0.72 : 0,
              scale: active ? 1.04 : 0.92,
              boxShadow: active
                ? '0 1px 5px rgba(47,37,71,0.10), 0 0 0 1px rgba(255,255,255,0.26)'
                : '0 1px 3px rgba(47,37,71,0.06)',
              pointerEvents: 'none',
              zIndex: 4,
              transition: 'opacity 0.18s ease, background 0.18s ease, box-shadow 0.18s ease, scale 0.18s ease',
            }} />
        );
      })}
      {SIDES.map(({ pos, id: hid }) => (
        <Handle key={hid} className="gsyen-side-aware-handle" id={`src-${hid}`} type="source" position={pos}
          style={{ opacity: 0, width: HANDLE_HIT_SIZE, height: HANDLE_HIT_SIZE, background: 'transparent', border: 'none' }} />
      ))}
      {SIDES.map(({ pos, id: hid }) => (
        <Handle key={`t-${hid}`} id={`tgt-${hid}`} type="target" position={pos}
          style={{ opacity: 0, width: HANDLE_HIT_SIZE, height: HANDLE_HIT_SIZE, background: 'transparent', border: 'none' }} />
      ))}
    </>
  );
}
