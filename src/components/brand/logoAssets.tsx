import React, { ComponentType } from 'react';
import {
  Layers, Sparkles, Crown, Gem, Shield, Flame, Cpu, Database, Globe, Zap, Atom,
  Terminal, Hexagon, Compass, Infinity as InfinityIcon, Box, CircleDot, Crosshair,
  Coffee, ShoppingBag, Wine, Package, Scissors, Key, Leaf, Sun, Moon, Sprout, Wind, Heart, Star,
} from 'lucide-react';
import { FontFamilyType, TrackingType } from '../../types';
import VintageCar from '../VintageCar';

/** symbol id → Lucide / 自定义 组件 */
export const iconMap: Record<string, ComponentType<any>> = {
  Layers, Sparkles, VintageCar, Crown, Gem, Shield, Flame, Cpu, Database, Globe, Zap, Atom,
  Terminal, Hexagon, Compass, Infinity: InfinityIcon, Box, CircleDot, Crosshair,
  Coffee, ShoppingBag, Wine, Package, Scissors, Key, Leaf, Sun, Moon, Sprout, Wind, Heart, Star,
};

export const fontClassMap: Record<FontFamilyType, string> = {
  sans: 'font-sans',
  display: 'font-display',
  space: 'font-space',
  serif: 'font-serif',
  cinzel: 'font-cinzel',
  mono: 'font-mono',
};

export const trackingClassMap: Record<TrackingType, string> = {
  tight: 'tracking-tight',
  normal: 'tracking-normal',
  wide: 'tracking-wide',
  widest: 'tracking-widest',
};

/** 兜底图标——iconMap 未命中时使用 */
export function logoFallbackIcon(props: any) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <polygon points="12 2 2 22 22 22" />
    </svg>
  );
}
