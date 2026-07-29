import type { CSSProperties } from 'react';
import { Position } from '@xyflow/react';
import type { CardSize, ContentType } from './CanvasCardData';

export const CARD_SIZE_DIM: Record<CardSize, { w: number; h: number }> = {
  S: { w: 220, h: 170 },
  M: { w: 300, h: 230 },
  L: { w: 380, h: 320 },
};
export const SIZE_W: Record<CardSize, number> = { S: CARD_SIZE_DIM.S.w, M: CARD_SIZE_DIM.M.w, L: CARD_SIZE_DIM.L.w };
export const SIZE_H: Record<CardSize, number> = { S: CARD_SIZE_DIM.S.h, M: CARD_SIZE_DIM.M.h, L: CARD_SIZE_DIM.L.h };
export const TITLE_SIZE: Record<CardSize, number> = { S: 15.5, M: 18, L: 22 };
export const BODY_SIZE: Record<CardSize, number> = { S: 11.5, M: 13, L: 14.5 };
export const EMPTY_BULLETS: Record<CardSize, number> = { S: 3, M: 4, L: 5 };
export const HANDLE_NEAR_PX = 36;
export const HANDLE_SIZE = 10.4;
export const HANDLE_HIT_SIZE = 24;

export const SIDES = [
  { pos: Position.Top, id: 't' }, { pos: Position.Right, id: 'r' },
  { pos: Position.Bottom, id: 'b' }, { pos: Position.Left, id: 'l' },
] as const;

export type HandleSide = typeof SIDES[number]['id'];

export function visualHandlePosition(side: HandleSide, width: number, height: number): CSSProperties {
  const offset = -HANDLE_SIZE / 2;
  const centerX = width / 2 - HANDLE_SIZE / 2;
  const centerY = height / 2 - HANDLE_SIZE / 2;
  if (side === 't') return { top: offset, left: centerX };
  if (side === 'r') return { right: offset, top: centerY };
  if (side === 'b') return { bottom: offset, left: centerX };
  return { left: offset, top: centerY };
}

export const ACCENT_HEX: Record<string, { border: string; bg: string; ink: string; muted: string }> = {
  blue: { border: 'rgba(77, 137, 220, 0.38)', bg: 'rgba(235, 243, 255, 0.96)', ink: '#1F4F8E', muted: 'rgba(31,79,142,0.52)' },
  green: { border: 'rgba(87, 157, 112, 0.38)', bg: 'rgba(236, 249, 241, 0.96)', ink: '#22663B', muted: 'rgba(34,102,59,0.52)' },
  amber: { border: 'rgba(188, 150, 57, 0.38)', bg: 'rgba(255, 248, 224, 0.96)', ink: '#795914', muted: 'rgba(121,89,20,0.52)' },
  yellow: { border: 'rgba(210, 173, 45, 0.38)', bg: 'rgba(255, 251, 226, 0.96)', ink: '#765D08', muted: 'rgba(118,93,8,0.52)' },
  red: { border: 'rgba(195, 86, 92, 0.38)', bg: 'rgba(255, 238, 240, 0.96)', ink: '#8C2D32', muted: 'rgba(140,45,50,0.52)' },
  purple: { border: 'rgba(145, 101, 205, 0.38)', bg: 'rgba(244, 237, 255, 0.96)', ink: '#5A3894', muted: 'rgba(90,56,148,0.52)' },
  cyan: { border: 'rgba(67, 151, 169, 0.38)', bg: 'rgba(235, 249, 252, 0.96)', ink: '#236B78', muted: 'rgba(35,107,120,0.52)' },
  gray: { border: 'rgba(107, 114, 128, 0.32)', bg: 'rgba(247, 248, 250, 0.96)', ink: '#374151', muted: 'rgba(55,65,81,0.50)' },
  black: { border: 'rgba(38, 42, 48, 0.28)', bg: 'rgba(248, 248, 249, 0.96)', ink: '#22262E', muted: 'rgba(34,38,46,0.48)' },
};

export const SCRINTAL_DEFAULT = {
  border: 'rgba(135, 146, 166, 0.36)',
  bg: 'rgba(237, 240, 246, 0.96)',
  ink: '#20232B',
  muted: 'rgba(62, 70, 86, 0.48)',
};

export const CT_LABEL: Record<ContentType, string> = {
  note: 'note', code: 'code', image: 'image', link: 'link',
  task: 'task', table: 'table', math: 'math', quote: 'quote',
};

export const UI_FONT = '"HarmonyOS Sans SC","HarmonyOS Sans","Inter","PingFang SC","Microsoft YaHei UI",system-ui,sans-serif';
export const LATIN_FONT = '"Inter","HarmonyOS Sans",system-ui,sans-serif';
